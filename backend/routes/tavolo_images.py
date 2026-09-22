"""Il catalogo d'immagini del tavolo: caricamento massivo con CSV (solo admin).

Ogni caricamento porta insieme le immagini e il file CSV che le accompagna:
una riga per file, con il nome e l'utilizzo. Le colonne del CSV parlano
italiano, ma un separatore virgola o punto-e-virgola vanno bene lo stesso
(Excel italiano usa il punto-e-virgola).

Un'immagine che il CSV non menziona non blocca il caricamento: entra con il
nome del file e l'utilizzo vuoto, e l'elenco in amministrazione la segnala
come da completare — e' quello il momento in cui si chiede, non un errore.
"""
import csv
import io
import os
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, models

router = APIRouter()
get_db = database.get_db

STORAGE_DIR = os.getenv("TAVOLO_IMAGES_STORAGE_DIR", "/app/uploads/tavolo-images")

# Come gli audio: dieci MiB a file, e un catalogo che resta sfogliabile.
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_IMAGES = 200

ALLOWED_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
}

# Le colonne si chiamano in italiano nel CSV, ma una variante comune non deve
# far perdere il nome: si riconoscono per senso, non per posizione.
_FILE_KEYS = {"nome_file", "file", "filename", "file_name", "nomefile", "immagine"}
_NAME_KEYS = {"nome", "name", "titolo"}
_USAGE_KEYS = {"utilizzo", "uso", "descrizione", "usage", "description"}


def _csv_rows(raw: bytes) -> dict[str, dict[str, str]]:
    """Il CSV letto per nome file: la chiave e' il nome in minuscolo, con
    estensione; una seconda chiave senza estensione copre il CSV che scrive
    `foto` e il file che si chiama `foto.png`."""
    text = raw.decode("utf-8-sig", errors="replace")
    head = text[:4096]
    separator = ";" if head.count(";") >= head.count(",") else ","
    by_file: dict[str, dict[str, str]] = {}
    for row in csv.DictReader(io.StringIO(text), delimiter=separator):
        cleaned = {}
        for key, value in (row or {}).items():
            if isinstance(key, str):
                cleaned[key.strip().lower()] = (value or "").strip() if isinstance(value, str) else ""
        file_key = next((key for key in cleaned if key in _FILE_KEYS and cleaned[key]), None)
        if not file_key:
            continue
        filename = os.path.basename(cleaned[file_key])
        entry = {
            "file": filename,
            "name": next((cleaned[key] for key in cleaned if key in _NAME_KEYS and cleaned[key]), ""),
            "usage": next((cleaned[key] for key in cleaned if key in _USAGE_KEYS and cleaned[key]), ""),
        }
        by_file[filename.lower()] = entry
        stem = os.path.splitext(filename.lower())[0]
        by_file.setdefault(stem, entry)
    return by_file


def _row_of(by_file: dict[str, dict[str, str]], filename: str) -> dict[str, str] | None:
    row = by_file.get(filename.lower())
    if row:
        return row
    return by_file.get(os.path.splitext(filename.lower())[0])


class ImageUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    usage: str | None = Field(default=None, max_length=2000)


@router.post("/admin/tavolo-images")
async def upload_tavolo_images(
    files: list[UploadFile] = File(...),
    csv_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Il set d'immagini in blocco, col CSV che dice nome e utilizzo."""
    by_file = _csv_rows(await csv_file.read())
    await csv_file.close()
    total = db.query(func.count(models.TavoloImage.id)).scalar() or 0
    created: list[str] = []
    unlisted: list[str] = []
    os.makedirs(STORAGE_DIR, exist_ok=True)
    for upload in files:
        original = os.path.basename(upload.filename or "")
        extension = os.path.splitext(original)[1].lower()
        if extension not in ALLOWED_TYPES:
            raise HTTPException(status_code=422, detail=f"formato non supportato: {original or 'file senza nome'}")
        payload = await upload.read()
        await upload.close()
        if len(payload) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail=f"immagine troppo grande: {original}")
        if total >= MAX_TOTAL_IMAGES:
            raise HTTPException(status_code=409, detail=f"il catalogo e' pieno: massimo {MAX_TOTAL_IMAGES} immagini")
        row = _row_of(by_file, original)
        image_id = secrets.token_hex(8)
        path = os.path.join(STORAGE_DIR, f"{image_id}{extension}")
        with open(path, "wb") as handle:
            handle.write(payload)
        db.add(models.TavoloImage(
            id=image_id,
            name=((row or {}).get("name") or os.path.splitext(original)[0])[:120],
            usage=(row or {}).get("usage", ""),
            storage_path=path,
            original_name=original,
            content_type=ALLOWED_TYPES[extension],
            created_by=current_user.get("username") or "admin",
        ))
        total += 1
        created.append(original)
        if row is None:
            unlisted.append(original)
    db.commit()
    return {"created": len(created), "unlisted": unlisted}


@router.get("/admin/tavolo-images")
def list_tavolo_images_admin(
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """L'elenco per amministrazione: anche chi non ha riga nel CSV si vede."""
    rows = db.query(models.TavoloImage).order_by(models.TavoloImage.created_at).all()
    return {"images": [_admin_view(row) for row in rows]}


def _admin_view(row: models.TavoloImage) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "usage": row.usage or "",
        "original_name": row.original_name,
        "created_by": row.created_by,
        "url": _public_view(row)["url"],
    }


def _public_view(row: models.TavoloImage) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "usage": row.usage or "",
        "url": f"/tavolo-images/{row.id}/file",
    }


@router.patch("/admin/tavolo-images/{image_id}")
def update_tavolo_image(
    image_id: str,
    request: ImageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Il posto in cui si completa un'immagine entrata senza riga nel CSV."""
    row = db.get(models.TavoloImage, image_id)
    if not row:
        raise HTTPException(status_code=404, detail="immagine sconosciuta")
    if request.name is not None:
        row.name = request.name.strip()[:120] or row.name
    if request.usage is not None:
        row.usage = request.usage.strip()[:2000]
    db.commit()
    return _admin_view(row)


@router.delete("/admin/tavolo-images/{image_id}")
def delete_tavolo_image(
    image_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.get_current_active_admin),
):
    row = db.get(models.TavoloImage, image_id)
    if not row:
        raise HTTPException(status_code=404, detail="immagine sconosciuta")
    if row.storage_path and os.path.exists(row.storage_path):
        try:
            os.unlink(row.storage_path)
        except OSError:
            pass
    db.delete(row)
    db.commit()
    return {"ok": True}


# --- le due rotte pubbliche: leggere il catalogo e il file ---


@router.get("/tavolo-images")
def list_tavolo_images(db: Session = Depends(get_db)):
    """Il catalogo per il selettore del tavolo: nome e utilizzo dicono quando
    vale la pena scegliere un'immagine."""
    rows = db.query(models.TavoloImage).order_by(models.TavoloImage.created_at).all()
    return {"images": [_public_view(row) for row in rows]}


@router.get("/tavolo-images/{image_id}/file")
def read_tavolo_image(image_id: str, db: Session = Depends(get_db)):
    """Un file del catalogo. L'allowlist e' la tabella: un id fuori elenco e'
    `404`, e nessun percorso arriva mai dal richiedente."""
    row = db.get(models.TavoloImage, image_id)
    if not row or not row.storage_path or not os.path.exists(row.storage_path):
        raise HTTPException(status_code=404, detail="immagine sconosciuta")
    return FileResponse(
        row.storage_path,
        media_type=row.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
