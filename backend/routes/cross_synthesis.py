"""Sintesi cross-strumento: lettura integrata di secondo livello TRA strumenti.

Disponibile dalla pagina personale quando lo studente ha compilato almeno due
strumenti a punteggio (QSA/QSAr/ZTPI). Il profilo multi-strumento e' assemblato
lato server dai risultati persistiti (fonte autorevole), non dal client.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth
from ..ai_service import AIService, AIError
from ..cross_synthesis import (
    MIN_INSTRUMENTS,
    build_multi_instrument_block,
    latest_scored_results,
)
from ..database import get_db
from ..prompt_config import DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS

logger = logging.getLogger(__name__)

router = APIRouter()


class CrossSynthesisRequest(BaseModel):
    language: str = "it"


@router.get("/user/cross-synthesis/availability")
async def cross_synthesis_availability(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Strumenti a punteggio compilati e disponibilita' della sintesi (>=2)."""
    results = latest_scored_results(db, current_user["username"])
    return {
        "available": len(results) >= MIN_INSTRUMENTS,
        "min_instruments": MIN_INSTRUMENTS,
        "instruments": [
            {"questionnaire_type": qtype, "submitted_at": row.submitted_at}
            for qtype, row in sorted(results.items())
        ],
    }


@router.post("/user/cross-synthesis")
async def generate_cross_synthesis(
    request: CrossSynthesisRequest,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Genera la sintesi integrata cross-strumento per l'utente autenticato."""
    results = latest_scored_results(db, current_user["username"])
    if len(results) < MIN_INSTRUMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"At least {MIN_INSTRUMENTS} scored instruments are required",
        )
    profile_block = build_multi_instrument_block(results, request.language)
    if not profile_block:
        raise HTTPException(status_code=400, detail="No usable scores found")

    ai_service = AIService(db)
    system_prompt = ai_service.config.get(
        "prompt_cross_synthesis", DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS
    ) or DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS
    system_prompt = (
        f"{system_prompt}\n\n{profile_block}\n\n"
        f"Answer in the student's language: {request.language}."
    )
    try:
        content = ai_service.get_response(
            "Provide the integrated cross-instrument synthesis of my profiles.",
            system_prompt,
            "cross-synthesis",
        )
    except AIError as e:
        logger.error(f"Cross-synthesis AI error for {current_user['username']}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    return {"content": content, "instruments": sorted(results.keys())}
