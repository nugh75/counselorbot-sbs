"""API di amministrazione per la configurazione del Guardiano del Filo.

Permette di visualizzare lo stato del guardiano, i provider attivi con chiave
configurata o raggiungibili, e di scegliere provider e modello del guardiano
validando che il provider scelto sia attivo.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, database, models, thread_guard
from .chatgpt import browser_mutation

router = APIRouter()
get_db = database.get_db


class ThreadGuardUpdateRequest(BaseModel):
    enabled: bool
    provider: str | None = None
    model: str | None = None


@router.get("/admin/thread-guard")
def get_guard_settings(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Restituisce lo stato del guardiano, il provider/modello correnti e l'elenco dei provider attivi."""
    return thread_guard.get_guard_configuration(db)


@router.put("/admin/thread-guard", dependencies=[Depends(browser_mutation)])
def update_guard_settings(
    payload: ThreadGuardUpdateRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Aggiorna abilitazione e provider+modello del guardiano con validazione del provider attivo."""
    try:
        return thread_guard.save_guard_configuration(
            db,
            enabled=payload.enabled,
            provider=payload.provider,
            model=payload.model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
