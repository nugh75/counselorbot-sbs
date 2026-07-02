"""Gestione documenti delle basi di conoscenza RAG (solo admin).

Endpoint per:
- elencare/creare/eliminare collezioni (le dinamiche sono cartelle plain
  sotto RAG_DYNAMIC_COLLECTIONS_DIR; le builtin non sono eliminabili);
- elencare i documenti di una collezione (indicizzati e/o su disco);
- caricare .md/.pdf nella cartella della collezione e reindicizzare;
- eliminare un documento caricato e reindicizzare.

Nota per le collezioni graphify (competenzestrategiche/framework/questionari):
i file caricati vengono comunque ingeriti direttamente (pdftotext/markdown)
al reindex, ma il grafo semantico va rigenerato a parte con la pipeline
graphify sull'host (`converted/` + `cache/semantic/`).
"""
import logging
import os
import re

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import auth, database
from ..ai_service import AIService
from ..rag_index import (
    COLLECTION_COMPETENZE,
    _GUIDE_STEMS,
    collection_exists,
    create_dynamic_collection,
    delete_dynamic_collection,
    docs_roots_for,
    get_index,
    is_dynamic_collection,
    list_collections,
    upload_dir_for,
)

router = APIRouter()
get_db = database.get_db
logger = logging.getLogger(__name__)

_ALLOWED_EXTENSIONS = (".md", ".pdf")
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB, coerente col limite nginx


class RagCollectionCreate(BaseModel):
    id: str
    label: str = ""


def _admin_username(current_user) -> str | None:
    if isinstance(current_user, dict):
        return current_user.get("username")
    return getattr(current_user, "username", None)


def _require_collection(collection: str) -> str:
    if not collection_exists(collection):
        raise HTTPException(status_code=404, detail=f"Collezione '{collection}' non trovata")
    return collection


def _sanitize_filename(name: str) -> str:
    base = os.path.basename(name or "").strip()
    base = re.sub(r"[^\w. \-()]", "_", base, flags=re.UNICODE)
    return base


def _reindex(db: Session, collection: str):
    index = get_index(collection)
    index.build(AIService(db))
    return index.stats()


@router.get("/admin/rag/collections")
async def rag_collections(
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Tutte le collezioni (builtin + dinamiche), con cartella di upload."""
    out = list_collections()
    for c in out:
        c["upload_dir"] = upload_dir_for(c["id"])
    return out


@router.post("/admin/rag/collections")
async def rag_create_collection(
    payload: RagCollectionCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Crea una nuova collezione dinamica (plain: .md/.pdf, nessun grafo)."""
    try:
        return create_dynamic_collection(payload.id.strip().lower(), payload.label.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/admin/rag/collections/{slug}")
async def rag_delete_collection(
    slug: str,
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Elimina una collezione dinamica (documenti + indice). Builtin: vietato."""
    if not is_dynamic_collection(slug):
        raise HTTPException(status_code=400, detail="Solo le collezioni dinamiche sono eliminabili")
    try:
        delete_dynamic_collection(slug)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "ok"}


@router.get("/admin/rag/docs")
async def rag_docs_list(
    collection: str = Query(...),
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Documenti della collezione: sorgenti indicizzate + file su disco.

    Ogni voce: source (relpath), chunks, indexed, on_disk, deletable,
    size/mtime quando il file esiste su disco."""
    coll = _require_collection(collection)
    index = get_index(coll)
    if not index._loaded:
        index._load_from_disk()
    roots = docs_roots_for(coll)
    upload_dir = upload_dir_for(coll)
    upload_root = os.path.abspath(upload_dir) if upload_dir else None

    def _resolve(source: str):
        """(abspath, root) del file sorgente, o (None, None)."""
        for root in roots:
            p = os.path.abspath(os.path.normpath(os.path.join(root, source)))
            if p.startswith(os.path.abspath(root) + os.sep) and os.path.isfile(p):
                return p, root
        return None, None

    docs: dict[str, dict] = {}
    for chunk in index.chunks:
        src = chunk["source"]
        entry = docs.setdefault(src, {
            "source": src, "chunks": 0, "indexed": True,
            "on_disk": False, "deletable": False, "size": None, "mtime": None,
        })
        entry["chunks"] += 1
    for src, entry in docs.items():
        p, _root = _resolve(src)
        if p:
            st = os.stat(p)
            entry.update(on_disk=True, size=st.st_size, mtime=int(st.st_mtime))
            entry["deletable"] = bool(upload_root) and p.startswith(upload_root + os.sep)

    # File presenti nella cartella di upload ma non (ancora) indicizzati.
    if upload_dir and os.path.isdir(upload_dir):
        # Le sorgenti sono relative alla prima root che contiene upload_dir.
        base_root = next(
            (r for r in roots if os.path.abspath(upload_dir).startswith(os.path.abspath(r))),
            roots[0],
        )
        for walk_root, _dirs, files in os.walk(upload_dir):
            for fn in sorted(files):
                if fn.startswith(".") or not fn.lower().endswith(_ALLOWED_EXTENSIONS):
                    continue
                abspath = os.path.join(walk_root, fn)
                src = os.path.relpath(abspath, base_root).replace("\\", "/")
                if src in docs:
                    continue
                st = os.stat(abspath)
                docs[src] = {
                    "source": src, "chunks": 0, "indexed": False,
                    "on_disk": True, "deletable": True,
                    "size": st.st_size, "mtime": int(st.st_mtime),
                }

    return {
        "collection": coll,
        "upload_dir": upload_dir,
        "stats": index.stats(),
        "docs": sorted(docs.values(), key=lambda d: d["source"]),
    }


@router.post("/admin/rag/docs")
async def rag_docs_upload(
    collection: str = Query(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Carica un .md/.pdf nella cartella della collezione e reindicizza."""
    coll = _require_collection(collection)
    upload_dir = upload_dir_for(coll)
    if not upload_dir:
        raise HTTPException(status_code=400, detail="Collezione senza cartella di upload")
    filename = _sanitize_filename(file.filename or "")
    if not filename or filename.startswith(".") or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Nome file non valido")
    if not filename.lower().endswith(_ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Sono ammessi solo file .md e .pdf")
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File troppo grande (max 50 MB)")
    if not content:
        raise HTTPException(status_code=400, detail="File vuoto")

    os.makedirs(upload_dir, exist_ok=True)
    dest = os.path.join(upload_dir, filename)
    try:
        with open(dest, "wb") as f:
            f.write(content)
    except OSError as e:
        logger.error("Upload RAG fallito (%s): %s", dest, e)
        raise HTTPException(status_code=500, detail=f"Scrittura fallita: {e}")
    logger.info("RAG upload: %s -> %s (%d byte) da %s",
                filename, coll, len(content), _admin_username(current_user))

    warning = None
    if coll == COLLECTION_COMPETENZE:
        stem = os.path.splitext(filename)[0].lower()
        if stem not in _GUIDE_STEMS:
            warning = (
                "La collezione 'competenzestrategiche' indicizza solo le guide "
                f"({', '.join(sorted(_GUIDE_STEMS))}): questo file è stato salvato "
                "ma NON verrà indicizzato in questa collezione (lo sarà in 'framework')."
            )

    stats = await run_in_threadpool(_reindex, db, coll)
    return {"status": "ok", "filename": filename, "warning": warning, "stats": stats}


@router.delete("/admin/rag/docs")
async def rag_docs_delete(
    collection: str = Query(...),
    source: str = Query(...),
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Elimina un documento caricato (solo dentro la cartella di upload) e reindicizza."""
    coll = _require_collection(collection)
    upload_dir = upload_dir_for(coll)
    if not upload_dir:
        raise HTTPException(status_code=400, detail="Collezione senza cartella di upload")
    upload_root = os.path.abspath(upload_dir)
    roots = docs_roots_for(coll)
    target = None
    for root in roots:
        p = os.path.abspath(os.path.normpath(os.path.join(root, source)))
        if p.startswith(os.path.abspath(root) + os.sep) and os.path.isfile(p):
            target = p
            break
    if not target:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    if not target.startswith(upload_root + os.sep):
        raise HTTPException(status_code=403, detail="Il documento non è eliminabile da qui")
    try:
        os.remove(target)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Eliminazione fallita: {e}")
    logger.info("RAG delete: %s da %s (%s)", source, coll, _admin_username(current_user))
    stats = await run_in_threadpool(_reindex, db, coll)
    return {"status": "ok", "stats": stats}
