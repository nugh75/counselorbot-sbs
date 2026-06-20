"""Benchmark QSA in-app: avvio, stato, storico, dettaglio per-step.

Esegue il confronto tra preset (provider+model) via AIService in un thread di
background. I risultati aggregati stanno in BenchmarkRun.summary; il dettaglio
per-step nei `logs` (action benchmark_inapp).
"""
import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database, benchmark_service

router = APIRouter()
get_db = database.get_db


@router.post("/admin/benchmark/run", response_model=schemas.BenchmarkRunResponse)
async def start_benchmark(
    payload: schemas.BenchmarkStartRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    if not payload.preset_ids:
        raise HTTPException(status_code=400, detail="Seleziona almeno un preset")
    presets = (
        db.query(models.ModelPreset)
        .filter(models.ModelPreset.id.in_(payload.preset_ids))
        .all()
    )
    if not presets:
        raise HTTPException(status_code=404, detail="Nessun preset valido trovato")

    preset_dicts = [
        {"provider": p.provider, "model": p.model, "name": p.name, "max_tokens": p.max_tokens}
        for p in presets
    ]
    run_id = f"inapp-qsa-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    row = models.BenchmarkRun(
        run_id=run_id,
        status="queued",
        language=payload.language or "it",
        created_by=getattr(current_user, "username", None),
        presets=preset_dicts,
        summary=[],
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    benchmark_service.start_benchmark_async(run_id, preset_dicts, row.language)
    return row


@router.get("/admin/benchmark/runs", response_model=List[schemas.BenchmarkRunResponse])
async def list_benchmark_runs(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    runs = (
        db.query(models.BenchmarkRun)
        .order_by(models.BenchmarkRun.id.desc())
        .limit(min(limit, 200))
        .all()
    )
    return runs


@router.get("/admin/benchmark/runs/{run_id}", response_model=schemas.BenchmarkRunResponse)
async def get_benchmark_run(
    run_id: str,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.BenchmarkRun).filter(models.BenchmarkRun.run_id == run_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Run non trovato")
    return row


@router.get("/admin/benchmark/runs/{run_id}/detail")
async def get_benchmark_detail(
    run_id: str,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Dettaglio per-step: risposte salvate nei logs per questo run."""
    logs = (
        db.query(models.Log)
        .filter(
            models.Log.action == benchmark_service.BENCHMARK_ACTION,
            models.Log.details.isnot(None),
        )
        .order_by(models.Log.id.asc())
        .all()
    )
    out = []
    for log in logs:
        details = log.details
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except (ValueError, TypeError):
                details = {}
        if not isinstance(details, dict) or details.get("benchmark_run_id") != run_id:
            continue
        out.append({
            "provider": log.provider,
            "model": log.model_name,
            "preset_name": details.get("preset_name"),
            "step_id": details.get("step_id"),
            "step_label": details.get("step_label"),
            "quality": details.get("quality"),
            "duration_s": details.get("duration_s"),
            "cost_usd": log.cost_usd,
            "bot_response": details.get("bot_response"),
            "error": details.get("error"),
        })
    return {"run_id": run_id, "steps": out}
