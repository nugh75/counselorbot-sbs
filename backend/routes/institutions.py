"""Anagrafica degli istituti: CRUD admin ed elenco per lo studente.

L'elenco pubblico serve al select del taccuino. Espone solo nome, tipo e le
pagine istituzionali: nulla che riguardi le persone.
"""
from typing import List, Literal
import re
import unicodedata
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from .. import administration_context, auth, database, models, schemas
from ..institution_access import require_institution_admin, teacher_institutions, require_teacher, require_institution_teacher

router = APIRouter()
get_db = database.get_db

VALID_KINDS = {"school", "university"}


class InstitutionTeacherCreate(BaseModel):
    username: str = Field(min_length=1, max_length=255)

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str) -> str:
        value = value.strip()
        if not value or any(character.isspace() or ord(character) < 32 for character in value):
            raise ValueError("Indicare l'identificativo dell'account, senza spazi")
        return value


class InstitutionSetPassword(BaseModel):
    # Raw hashes are refused: only a verified plaintext entry produces a verifier.
    model_config = ConfigDict(extra="forbid")
    plain_password: str | None = None


class InstitutionTeacherResponse(BaseModel):
    id: int
    institution_id: int
    username: str
    is_active: bool

    model_config = {"from_attributes": True}


class TeacherInstitutionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["school", "university"] = "school"
    website_url: HttpUrl | None = None
    orientation_page_url: HttpUrl | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(char) < 32 for char in value):
            raise ValueError("Invalid institute name")
        return value


class TeacherInstitutionUpdate(TeacherInstitutionCreate):
    revision: int = Field(ge=1)


def _teacher_response(db: Session, row: models.Institution) -> dict:
    count = db.query(models.InstitutionTeacher).filter_by(institution_id=row.id, is_active=True).count()
    return {**schemas.InstitutionPublic.model_validate(row).model_dump(),
            "is_active": row.is_active, "revision": row.revision, "created_by": row.created_by,
            "institution_code": row.institution_code,
            "credentials_configured": row.credentials_configured,
            "member_count": count, "needs_admin_review": count > 2}


@router.get("/teacher/institutions")
async def my_institutions(current_user: dict = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return [_teacher_response(db, row) for row in teacher_institutions(db, current_user).all()]


@router.post("/teacher/institutions", status_code=201)
async def create_teacher_institution(payload: TeacherInstitutionCreate,
                                     current_user: dict = Depends(auth.get_current_user),
                                     db: Session = Depends(get_db)):
    username = require_teacher(current_user)
    stem = unicodedata.normalize("NFKD", payload.name).encode("ascii", "ignore").decode().lower()
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")[:80] or "institute"
    # A server-generated suffix lets duplicate names coexist without silent joining.
    row = models.Institution(name=payload.name, kind=payload.kind, slug=f"{stem}-{uuid.uuid4().hex}",
                             website_url=str(payload.website_url) if payload.website_url else None,
                             orientation_page_url=str(payload.orientation_page_url) if payload.orientation_page_url else None,
                             is_active=True, created_by=username, revision=1)
    try:
        db.add(row)
        db.flush()
        db.add(models.InstitutionTeacher(institution_id=row.id, username=username,
                                         created_by=username, updated_by=username, is_active=True))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="institution_creation_conflict")
    return _teacher_response(db, row)


@router.get("/teacher/institutions/directory")
async def teacher_directory(q: str = "", offset: int = 0, current_user: dict = Depends(auth.get_current_user),
                            db: Session = Depends(get_db)):
    username = require_teacher(current_user)
    query = db.query(models.Institution).filter_by(is_active=True)
    if q.strip():
        query = query.filter(models.Institution.name.ilike(f"%{q.strip()}%"))
    result = []
    for row in query.order_by(models.Institution.name, models.Institution.id).offset(max(0, offset)).limit(100):
        count = db.query(models.InstitutionTeacher).filter_by(institution_id=row.id, is_active=True).count()
        joined = db.query(models.InstitutionTeacher).filter_by(institution_id=row.id, username=username, is_active=True).first() is not None
        result.append({**schemas.InstitutionPublic.model_validate(row).model_dump(),
                       "joined": joined, "can_join": not joined and count < 2})
    return result


@router.post("/teacher/institutions/{institution_id}/join")
async def join_teacher_institution(institution_id: int, current_user: dict = Depends(auth.get_current_user),
                                   db: Session = Depends(get_db)):
    username = require_teacher(current_user)
    row = db.query(models.Institution).filter_by(id=institution_id).with_for_update().first()
    if row is None:
        raise HTTPException(status_code=404, detail="institution_not_found")
    if not row.is_active:
        raise HTTPException(status_code=409, detail="institution_inactive")
    membership = db.query(models.InstitutionTeacher).filter_by(institution_id=row.id, username=username).first()
    if membership is None or not membership.is_active:
        count = db.query(models.InstitutionTeacher).filter_by(institution_id=row.id, is_active=True).count()
        if count >= 2:
            raise HTTPException(status_code=409, detail="institution_capacity_reached")
        if membership is None:
            membership = models.InstitutionTeacher(institution_id=row.id, username=username, created_by=username)
            db.add(membership)
        membership.is_active = True
        membership.updated_by = username
    db.commit()
    return _teacher_response(db, row)


@router.get("/teacher/institutions/{institution_id}")
async def get_teacher_institution(institution_id: int, current_user: dict = Depends(auth.get_current_user),
                                  db: Session = Depends(get_db)):
    return _teacher_response(db, require_institution_teacher(db, current_user, institution_id))


@router.put("/teacher/institutions/{institution_id}")
async def update_teacher_institution(institution_id: int, payload: TeacherInstitutionUpdate,
                                     current_user: dict = Depends(auth.get_current_user),
                                     db: Session = Depends(get_db)):
    require_institution_teacher(db, current_user, institution_id)
    row = db.query(models.Institution).filter_by(id=institution_id).populate_existing().with_for_update().one()
    # Recheck under the lock: revocation/deactivation must bind this write.
    require_institution_teacher(db, current_user, institution_id)
    if row.revision != payload.revision:
        raise HTTPException(status_code=409, detail="institution_revision_conflict")
    for key, value in payload.model_dump(exclude={"revision"}).items():
        setattr(row, key, str(value) if value is not None and key.endswith("_url") else value)
    row.revision += 1
    db.commit()
    return _teacher_response(db, row)


CREDENTIAL_FIELDS = {"institution_code", "password", "revision"}


@router.put("/teacher/institutions/{institution_id}/credentials")
async def replace_teacher_institution_credentials(institution_id: int, request: Request,
                                                  current_user: dict = Depends(auth.get_current_user),
                                                  db: Session = Depends(get_db)):
    """Write-only replacement of the externally issued code and password.

    The body is parsed by hand so that no validation error can echo the secret.
    """
    require_institution_teacher(db, current_user, institution_id)
    try:
        payload = await request.json()
    except ValueError:
        payload = None
    if not isinstance(payload, dict) or set(payload) != CREDENTIAL_FIELDS:
        raise HTTPException(status_code=422, detail="invalid_credentials_payload")
    revision = payload["revision"]
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        raise HTTPException(status_code=422, detail="invalid_credentials_payload")
    code = administration_context.normalize_code(payload["institution_code"])
    if code is None:
        raise HTTPException(status_code=422, detail="invalid_institution_code")
    password = payload["password"]
    if not administration_context.valid_password(password):
        raise HTTPException(status_code=422, detail="invalid_institution_password")
    # Serialize writers of the same normalized code across institutes, then lock the row.
    db.execute(text("SELECT pg_advisory_xact_lock(149, hashtext(:code))"), {"code": code.lower()})
    row = require_institution_teacher(db, current_user, institution_id, lock=True)
    if row.revision != revision:
        raise HTTPException(status_code=409, detail="institution_revision_conflict")
    if administration_context.code_taken(db, code, row.id):
        raise HTTPException(status_code=409, detail="institution_code_conflict")
    row.institution_code = code
    row.hashed_password = models.get_password_hash(password)
    row.revision += 1
    row.credentials_revision += 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="institution_code_conflict")
    return _teacher_response(db, row)


@router.get("/admin/institutions/{institution_id}/teachers", response_model=List[InstitutionTeacherResponse])
async def list_institution_teachers(
    institution_id: int,
    current_user: dict = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    _fetch(db, institution_id)
    return db.query(models.InstitutionTeacher).filter(
        models.InstitutionTeacher.institution_id == institution_id,
        models.InstitutionTeacher.is_active.is_(True),
    ).order_by(models.InstitutionTeacher.username).all()


@router.post("/admin/institutions/{institution_id}/teachers", response_model=InstitutionTeacherResponse)
async def associate_institution_teacher(
    institution_id: int,
    payload: InstitutionTeacherCreate,
    current_user: dict = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    institution = db.query(models.Institution).filter_by(id=institution_id).with_for_update().first()
    if institution is None:
        raise HTTPException(status_code=404, detail="Istituto non trovato")
    if not institution.is_active:
        raise HTTPException(status_code=409, detail="L'istituto è disattivato")
    actor = str(current_user.get("username") or "").strip()
    if not actor:
        raise HTTPException(status_code=403, detail="Amministratore non identificato")
    row = db.query(models.InstitutionTeacher).filter_by(institution_id=institution_id, username=payload.username).first()
    if row is None or not row.is_active:
        count = db.query(models.InstitutionTeacher).filter_by(institution_id=institution_id, is_active=True).count()
        if count >= 2:
            raise HTTPException(status_code=409, detail="institution_capacity_reached")
    if row is None:
        row = models.InstitutionTeacher(institution_id=institution_id, username=payload.username, created_by=actor)
        db.add(row)
    row.is_active = True
    row.updated_by = actor
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Associazione modificata contemporaneamente: ricarica e riprova")
    db.refresh(row)
    return row


@router.delete("/admin/institutions/{institution_id}/teachers/{membership_id}")
async def revoke_institution_teacher(
    institution_id: int,
    membership_id: int,
    current_user: dict = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    db.query(models.Institution).filter_by(id=institution_id).with_for_update().first()
    _fetch(db, institution_id)
    actor = str(current_user.get("username") or "").strip()
    if not actor:
        raise HTTPException(status_code=403, detail="Amministratore non identificato")
    row = db.query(models.InstitutionTeacher).filter_by(id=membership_id, institution_id=institution_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Associazione non trovata")
    row.is_active = False
    row.updated_by = actor
    db.commit()
    return {"status": "revoked", "id": row.id}


def _fetch(db: Session, institution_id: int, *, lock: bool = False) -> models.Institution:
    query = db.query(models.Institution).filter(models.Institution.id == institution_id)
    row = (query.with_for_update() if lock else query).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Istituto non trovato")
    return row


def _validate(row: models.Institution) -> None:
    if (row.kind or "") not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Tipo non valido: school o university")
    if not (row.name or "").strip():
        raise HTTPException(status_code=400, detail="Nome obbligatorio")


@router.get("/institutions", response_model=List[schemas.InstitutionPublic])
async def list_institutions(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Istituti attivi, per il selettore del taccuino."""
    return (
        db.query(models.Institution)
        .filter(models.Institution.is_active.is_(True))
        .order_by(models.Institution.name.asc())
        .all()
    )


@router.get("/admin/institutions", response_model=List[schemas.InstitutionResponse])
async def admin_list_institutions(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(models.Institution).order_by(models.Institution.name.asc()).all()
    for row in rows:
        row.needs_admin_review = db.query(models.InstitutionTeacher).filter_by(institution_id=row.id, is_active=True).count() > 2
    return rows


@router.post("/admin/institutions", response_model=schemas.InstitutionResponse)
async def create_institution(
    payload: schemas.InstitutionCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.Institution).filter(models.Institution.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.Institution(**payload.model_dump())
    row.slug = slug
    _validate(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/institutions/{institution_id}", response_model=schemas.InstitutionResponse)
async def update_institution(
    institution_id: int,
    payload: schemas.InstitutionUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = _fetch(db, institution_id, lock=True)
    previous_code = row.institution_code
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    _validate(row)
    row.revision += 1
    if row.institution_code != previous_code:
        # Outstanding verification grants were bound to the previous code.
        row.credentials_revision += 1
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/institutions/{institution_id}")
async def delete_institution(
    institution_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Disattiva invece di cancellare: le righe del taccuino citano lo slug,
    e cancellarlo renderebbe illeggibile la storia gia' scritta."""
    row = _fetch(db, institution_id, lock=True)
    row.is_active = False
    row.revision += 1
    db.commit()
    return {"status": "deactivated", "id": institution_id}


@router.put("/admin/institutions/{institution_id}/password", response_model=schemas.InstitutionResponse)
async def set_institution_password(
    institution_id: int,
    payload: InstitutionSetPassword,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    if payload.plain_password is not None and not administration_context.valid_password(payload.plain_password):
        raise HTTPException(status_code=422, detail="invalid_institution_password")
    row = _fetch(db, institution_id, lock=True)
    row.revision += 1
    row.credentials_revision += 1
    if payload.plain_password is not None:
        row.hashed_password = models.get_password_hash(payload.plain_password)
    else:
        row.hashed_password = None
    db.commit()
    db.refresh(row)
    return row
