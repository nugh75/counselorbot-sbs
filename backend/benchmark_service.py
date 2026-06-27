"""Motore benchmark QSA in-app.

Confronta uno o piu' (provider, model) eseguendo lo scenario QSA (stessi step e
stessa funzione di scoring del benchmark CLI) tramite il provider registry di
AIService. Funziona con qualunque provider che abbia una chiave configurata;
il costo arriva da usage.cost (OpenRouter) o dalla tabella model_pricing.

Esecuzione in un thread separato (fire-and-forget) che aggiorna la riga
BenchmarkRun: status queued -> running -> done/error. Il dettaglio per-step e'
loggato nei `logs` (action `benchmark_inapp`).
"""
import logging
import threading
import time
from datetime import datetime, timezone

from . import database, models, pii, model_pricing
from .ai_service import AIService, AIError
from .tests.test_ollama_qsa_benchmark import (
    QSA_PROFILE,
    QSA_STEPS,
    FOLLOWUP_QUESTIONS,
    build_messages,
    assess_quality,
)

logger = logging.getLogger(__name__)

BENCHMARK_ACTION = "benchmark_inapp"


def _all_steps() -> list[dict]:
    return list(QSA_STEPS) + list(FOLLOWUP_QUESTIONS)


def _cost_for(provider: str, model: str, usage) -> float | None:
    cost = model_pricing.estimate_cost_usd(provider, model, usage)
    if cost is None and isinstance(usage, dict):
        c = usage.get("cost")
        if isinstance(c, (int, float)):
            return float(c)
    return cost


def _run_one_preset(ai: AIService, db, run_id: str, preset: dict, language: str) -> dict:
    provider = preset["provider"]
    model = preset["model"]
    name = preset.get("name") or model
    max_tokens = preset.get("max_tokens") or 1200
    steps = _all_steps()

    qualities: list[float] = []
    durations: list[float] = []
    in_tokens = out_tokens = 0
    total_cost = 0.0
    valid = 0

    for step in steps:
        system, user = build_messages(step, QSA_PROFILE, language)
        error = None
        text = ""
        t0 = time.monotonic()
        try:
            text = ai.call_model(provider, model, user, system, max_tokens=max_tokens)
        except AIError as e:
            error = str(e)
        except Exception as e:  # difensivo: una rete che cade non deve uccidere il run
            error = str(e)
        dt = time.monotonic() - t0

        usage = getattr(ai, "last_usage", None)
        pin, pout = model_pricing._tokens(usage) or (0, 0)
        cost = _cost_for(provider, model, usage)

        quality = 0.0
        if not error and text:
            quality = float(assess_quality(text, step, language).get("overall", 0.0))
            if quality > 0:
                valid += 1

        qualities.append(quality)
        durations.append(dt)
        in_tokens += pin
        out_tokens += pout
        if cost:
            total_cost += cost

        db.add(models.Log(
            action=BENCHMARK_ACTION,
            provider=provider,
            model_name=model,
            questionnaire_type="QSA",
            phase=step.get("id"),
            mode=step.get("mode"),
            cost_usd=cost,
            details=pii.redact_details({
                "benchmark_run_id": run_id,
                "preset_name": name,
                "step_id": step.get("id"),
                "step_label": step.get("label"),
                "system_prompt": system,
                "user_input": user,
                "bot_response": text,
                "quality": round(quality, 3),
                "duration_s": round(dt, 3),
                "usage": usage,
                "cost_usd": cost,
                "error": error,
            }, "user_input", "bot_response"),
        ))
        db.commit()

    n = len(steps)
    total_dt = sum(durations) or 0.0
    return {
        "provider": provider,
        "model": model,
        "name": name,
        "turns": n,
        "valid": valid,
        "reliability": round(valid / n, 3) if n else 0.0,
        "quality": round(sum(qualities) / n, 3) if n else 0.0,
        "avg_duration_s": round(total_dt / n, 2) if n else 0.0,
        "tok_s": round(out_tokens / total_dt, 1) if total_dt > 0 else 0.0,
        "prompt_tokens": in_tokens,
        "completion_tokens": out_tokens,
        "cost_usd": round(total_cost, 6),
    }


def _add_scores(summary: list[dict]) -> None:
    """Score composito 0..1: qualita' 0.4 + velocita' 0.3 + affidabilita' 0.3
    (qualita' e velocita' normalizzate sul migliore del run)."""
    ok = [r for r in summary if not r.get("error")]
    best_q = max((r["quality"] for r in ok), default=1.0) or 1.0
    best_tps = max((r["tok_s"] for r in ok), default=1.0) or 1.0
    for r in summary:
        if r.get("error"):
            r["score"] = 0.0
            continue
        r["score"] = round(
            (r["quality"] / best_q) * 0.4
            + (r["tok_s"] / best_tps) * 0.3
            + r["reliability"] * 0.3,
            3,
        )


def run_benchmark(run_id: str, presets: list[dict], language: str) -> None:
    db = database.SessionLocal()
    row = db.query(models.BenchmarkRun).filter(models.BenchmarkRun.run_id == run_id).first()
    try:
        if row:
            row.status = "running"
            db.commit()
        ai = AIService(db)
        summary: list[dict] = []
        for preset in presets:
            try:
                summary.append(_run_one_preset(ai, db, run_id, preset, language))
            except Exception as e:
                logger.error(f"benchmark {run_id}: preset {preset} fallito: {e}")
                summary.append({
                    "provider": preset.get("provider"), "model": preset.get("model"),
                    "name": preset.get("name"), "error": str(e),
                })
            if row:
                row.summary = list(summary)
                db.commit()
        _add_scores(summary)
        if row:
            row.summary = summary
            row.status = "done"
            row.finished_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as e:
        logger.error(f"benchmark {run_id} errore fatale: {e}")
        if row:
            row.status = "error"
            row.error = str(e)
            row.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def start_benchmark_async(run_id: str, presets: list[dict], language: str) -> None:
    """Avvia il benchmark in un thread daemon e ritorna subito."""
    thread = threading.Thread(
        target=run_benchmark, args=(run_id, presets, language), daemon=True,
    )
    thread.start()
