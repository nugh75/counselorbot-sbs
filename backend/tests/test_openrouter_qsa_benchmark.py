#!/usr/bin/env python3
"""QSA OpenRouter Benchmark.

Riusa lo stesso profilo, gli stessi step guidati e lo stesso scoring qualitativo
del benchmark Ollama, ma invia le richieste a OpenRouter.

Uso:
  OPENROUTER_API_KEY=... python -m backend.tests.test_openrouter_qsa_benchmark

Variabili:
  MODELS                     lista model id separati da virgola
  CONCURRENT_USERS           default 3
  LANGUAGE                   default it
  OUTPUT                     report markdown
  OPENROUTER_PROVIDER_SORT   default price
  OPENROUTER_DISABLE_REASONING default 1
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

try:
    import httpx
except ImportError:
    print("Serve httpx: pip install httpx", file=sys.stderr)
    sys.exit(1)

from backend.tests import test_ollama_qsa_benchmark as base


OPENROUTER_URL = os.environ.get("OPENROUTER_URL", "https://openrouter.ai/api/v1").rstrip("/")
OUTPUT_FILE = os.environ.get("OUTPUT", "")
CONCURRENT_USERS = int(os.environ.get("CONCURRENT_USERS", os.environ.get("OPENROUTER_CONCURRENT_USERS", "3")))
LANGUAGE = os.environ.get("LANGUAGE", base.LANGUAGE)
PROVIDER_SORT = os.environ.get("OPENROUTER_PROVIDER_SORT", "price").strip()
DISABLE_REASONING = os.environ.get("OPENROUTER_DISABLE_REASONING", "1").lower() in ("1", "true", "yes")
REQUEST_TIMEOUT = float(os.environ.get("OPENROUTER_TIMEOUT", "300"))
LOG_TO_DB = os.environ.get("BENCHMARK_LOG_TO_DB", "0").lower() in ("1", "true", "yes")
LOG_ACTION = "benchmark_openrouter_qsa"
_LOG_SCHEMA_READY = False

DEFAULT_MODELS = [
    "inclusionai/ling-2.6-flash",
    "mistralai/mistral-nemo",
    "meta-llama/llama-3.1-8b-instruct",
    "mistralai/mistral-small-3.2-24b-instruct",
    "qwen/qwen3-14b",
    "meta-llama/llama-3.3-70b-instruct",
    "google/gemini-2.5-flash-lite",
    "openai/gpt-4.1-nano",
    "qwen/qwen3-30b-a3b",
]

_MODELS_OVERRIDE = os.environ.get("MODELS", "")


def _clean_env_value(value: str) -> str:
    return value.strip().strip('"').strip("'")


def _read_dotenv_value(key: str) -> str:
    path = Path(".env")
    if not path.exists():
        return ""
    try:
        for line in path.read_text(errors="ignore").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            k, value = stripped.split("=", 1)
            if k.strip() == key:
                return _clean_env_value(value)
    except OSError:
        return ""
    return ""


def _api_key() -> str:
    key = (
        os.environ.get("OPENROUTER_API_KEY")
        or os.environ.get("API_KEY_OPENROUTER")
        or _read_dotenv_value("OPENROUTER_API_KEY")
        or _read_dotenv_value("API_KEY_OPENROUTER")
    )
    return _clean_env_value(key) if key else ""


def _prepare_database_env() -> None:
    value = os.environ.get("DATABASE_URL") or _read_dotenv_value("DATABASE_URL")
    if value:
        os.environ["DATABASE_URL"] = _clean_env_value(value)


def _selected_models() -> list[str]:
    if _MODELS_OVERRIDE:
        return [item.strip() for item in _MODELS_OVERRIDE.split(",") if item.strip()]
    return DEFAULT_MODELS


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://counselorbot-sbs.ai4educ.org",
        "X-Title": "CounselorBot QSA benchmark",
    }


def _price_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def fetch_model_catalog(client: httpx.AsyncClient, api_key: str | None = None) -> dict[str, dict[str, Any]]:
    """Catalogo modelli (id -> metadati con pricing). Su OpenRouter /models e'
    pubblico; su altri endpoint OpenAI-compatibili (es. DeepSeek) richiede auth
    e non espone i prezzi. Non deve essere fatale: se fallisce, niente prezzi."""
    try:
        headers = _headers(api_key) if api_key else None
        response = await client.get(f"{OPENROUTER_URL}/models", headers=headers, timeout=30)
        response.raise_for_status()
        return {item["id"]: item for item in response.json().get("data", [])}
    except Exception as e:
        print(f"   [warn] catalogo modelli non disponibile ({e}); prezzi non mostrati", file=sys.stderr)
        return {}


def _model_price(catalog: dict[str, dict[str, Any]], model: str) -> dict[str, float]:
    item = catalog.get(model.replace(":floor", ""))
    pricing = (item or {}).get("pricing") or {}
    return {
        "prompt": _price_float(pricing.get("prompt")),
        "completion": _price_float(pricing.get("completion")),
    }


def _estimate_cost(prompt_tokens: int, completion_tokens: int, price: dict[str, float]) -> float:
    return prompt_tokens * price["prompt"] + completion_tokens * price["completion"]


def _ensure_log_schema(database_module: Any) -> None:
    global _LOG_SCHEMA_READY
    if _LOG_SCHEMA_READY:
        return
    from sqlalchemy import text as sa_text

    for clause in [
        "ADD COLUMN conversation_id VARCHAR",
        "ADD COLUMN username VARCHAR",
        "ADD COLUMN email VARCHAR",
        "ADD COLUMN anonymous_research_code VARCHAR",
        "ADD COLUMN provider VARCHAR",
        "ADD COLUMN model_name VARCHAR",
        "ADD COLUMN questionnaire_type VARCHAR",
        "ADD COLUMN phase VARCHAR",
        "ADD COLUMN mode VARCHAR",
        "ADD COLUMN response_id VARCHAR",
        "ADD COLUMN cost_usd DOUBLE PRECISION",
    ]:
        try:
            with database_module.engine.connect() as conn:
                conn.execute(sa_text(f"ALTER TABLE logs {clause}"))
                conn.commit()
        except Exception:
            pass
    _LOG_SCHEMA_READY = True


def write_benchmark_log(
    *,
    run_id: str,
    model: str,
    step: dict[str, str],
    user_message: str,
    system_prompt: str,
    result: base.StepResult,
) -> None:
    if not LOG_TO_DB:
        return
    try:
        _prepare_database_env()
        from backend import database, models
        from backend.anonymous_codes import get_or_create_anonymous_research_code

        _ensure_log_schema(database)
        db = database.SessionLocal()
        try:
            anonymous_code = get_or_create_anonymous_research_code(db, "benchmark")
            cost_usd = result.raw_metrics.get("estimated_cost_usd")
            db.add(models.Log(
                session_id=run_id,
                username="benchmark",
                anonymous_research_code=anonymous_code,
                action=LOG_ACTION,
                provider="openrouter",
                model_name=model,
                questionnaire_type="QSA",
                phase=step.get("id"),
                mode=step.get("mode"),
                cost_usd=float(cost_usd or 0) if cost_usd is not None else None,
                details={
                    "source": "openrouter_qsa_benchmark",
                    "benchmark_run_id": run_id,
                    "step_id": step.get("id"),
                    "step_label": step.get("label"),
                    "step_mode": step.get("mode"),
                    "model": model,
                    "response_model": result.raw_metrics.get("response_model"),
                    "user_input": user_message,
                    "effective_user_input": user_message,
                    "system_prompt": system_prompt,
                    "bot_response": result.output_text,
                    "quality": result.quality,
                    "error": result.error,
                    "ttft_ms": result.ttft_ms,
                    "total_duration_ms": result.total_duration_ms,
                    "prompt_tokens": result.prompt_eval_count,
                    "completion_tokens": result.eval_count,
                    "tokens_per_second": result.tokens_per_second,
                    "estimated_cost_usd": result.raw_metrics.get("estimated_cost_usd"),
                    "anonymous_research_code": anonymous_code,
                    "openrouter_generation_id": result.raw_metrics.get("generation_id"),
                },
            ))
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        print(f"   [log-db] salvataggio fallito: {str(exc)[:160]}", file=sys.stderr)


def _base_payload(model: str, system_prompt: str, user_message: str, max_tokens: int, stream: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.2,
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if stream:
        payload["stream_options"] = {"include_usage": True}
    if PROVIDER_SORT:
        payload["provider"] = {"sort": PROVIDER_SORT}
    if DISABLE_REASONING:
        payload["reasoning"] = {"enabled": False}
    return payload


def _usage_tokens(usage: Optional[dict[str, Any]]) -> tuple[int, int]:
    if not usage:
        return 0, 0
    prompt_tokens = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    return prompt_tokens, completion_tokens


async def call_openrouter(
    client: httpx.AsyncClient,
    api_key: str,
    catalog: dict[str, dict[str, Any]],
    model: str,
    system_prompt: str,
    user_message: str,
    step: dict[str, str],
    max_tokens: int = 2048,
) -> base.StepResult:
    step_type = "followup" if step.get("mode") == "factor-qa" else "guided"
    payload = _base_payload(model, system_prompt, user_message, max_tokens=max_tokens, stream=True)

    chunks: list[str] = []
    first_token = False
    ttft_ms = 0.0
    start = time.monotonic()
    error: Optional[str] = None
    usage: Optional[dict[str, Any]] = None
    response_model = model
    generation_id = ""

    for attempt in range(4):
        try:
            async with client.stream(
                "POST",
                f"{OPENROUTER_URL}/chat/completions",
                headers=_headers(api_key),
                json=payload,
                timeout=httpx.Timeout(REQUEST_TIMEOUT),
            ) as response:
                if response.status_code == 429 and attempt < 3:
                    retry_after = float(response.headers.get("retry-after") or 2 ** (attempt + 2))
                    await response.aread()
                    await asyncio.sleep(min(max(retry_after, 1.0), 60.0))
                    continue
                response.raise_for_status()
                async for raw_line in response.aiter_lines():
                    line = raw_line.strip()
                    if not line or line.startswith(":") or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if event.get("id") and not generation_id:
                        generation_id = event["id"]
                    if event.get("model"):
                        response_model = event["model"]
                    if event.get("usage"):
                        usage = event["usage"]
                    if event.get("error"):
                        error = str(event["error"])
                        break
                    choices = event.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content") or ""
                    if content:
                        chunks.append(content)
                        if not first_token:
                            ttft_ms = (time.monotonic() - start) * 1000
                            first_token = True
                break
        except Exception as exc:
            error = str(exc)
            if "reasoning" in error.lower() and payload.get("reasoning"):
                payload.pop("reasoning", None)
                continue
            if attempt < 3:
                await asyncio.sleep(2 ** attempt)
                continue
            break

    total_ms = (time.monotonic() - start) * 1000
    output_text = "".join(chunks)
    prompt_tokens, completion_tokens = _usage_tokens(usage)
    if completion_tokens == 0 and output_text:
        completion_tokens = max(1, len(output_text.split()))
    if prompt_tokens == 0:
        prompt_tokens = max(1, len((system_prompt + "\n" + user_message).split()))
    if not first_token and output_text and not error:
        ttft_ms = total_ms
    if not first_token and not error:
        ttft_ms = total_ms

    price = _model_price(catalog, model)
    estimated_cost = _estimate_cost(prompt_tokens, completion_tokens, price)
    if usage:
        usage_cost = usage.get("cost")
        if isinstance(usage_cost, (int, float)):
            estimated_cost = float(usage_cost)
        elif isinstance(usage_cost, str):
            try:
                estimated_cost = float(usage_cost)
            except ValueError:
                pass

    denom = max((total_ms - ttft_ms if total_ms > ttft_ms else total_ms) / 1000, 0.05)
    tokens_per_second = completion_tokens / denom if completion_tokens else 0.0
    quality = base.assess_quality(output_text, step, LANGUAGE)

    return base.StepResult(
        step_id=step["id"],
        step_label=step["label"],
        step_type=step_type,
        ttft_ms=round(ttft_ms, 1),
        total_duration_ms=round(total_ms, 1),
        eval_count=completion_tokens,
        prompt_eval_count=prompt_tokens,
        tokens_per_second=round(tokens_per_second, 1),
        output_text=output_text,
        error=error,
        raw_metrics={
            "usage": usage,
            "estimated_cost_usd": estimated_cost,
            "response_model": response_model,
            "generation_id": generation_id,
        },
        quality=quality,
    )


async def concurrency_test(
    client: httpx.AsyncClient,
    api_key: str,
    model: str,
    n_users: int,
    step: dict[str, str],
) -> base.ConcurrencyResult:
    system_prompt, user_message = base.build_messages(step, base.QSA_PROFILE, LANGUAGE)
    payload = _base_payload(model, system_prompt, user_message, max_tokens=512, stream=False)
    latencies: list[float] = []
    errors = 0

    async def _single() -> float:
        nonlocal errors
        t0 = time.monotonic()
        try:
            response = await client.post(
                f"{OPENROUTER_URL}/chat/completions",
                headers=_headers(api_key),
                json=payload,
                timeout=httpx.Timeout(REQUEST_TIMEOUT),
            )
            response.raise_for_status()
        except Exception:
            errors += 1
        return (time.monotonic() - t0) * 1000

    start = time.monotonic()
    for coro in asyncio.as_completed([_single() for _ in range(n_users)]):
        latencies.append(await coro)
    total_wall = (time.monotonic() - start) * 1000
    latencies.sort()
    n = len(latencies)

    def pct(value: float) -> float:
        if not latencies:
            return 0.0
        return latencies[min(n - 1, int(n * value))]

    return base.ConcurrencyResult(
        n_users=n_users,
        step_id=step["id"],
        total_wall_ms=round(total_wall, 1),
        avg_latency_ms=round(sum(latencies) / n if n else 0.0, 1),
        p50_ms=round(pct(0.50), 1),
        p95_ms=round(pct(0.95), 1),
        p99_ms=round(pct(0.99), 1),
        errors=errors,
        total_requests=n_users,
    )


def _model_cost(mr: base.ModelResults) -> float:
    return sum(float(step.raw_metrics.get("estimated_cost_usd") or 0) for step in mr.steps)


def _print_report(results: list[base.ModelResults], catalog: dict[str, dict[str, Any]]) -> None:
    print("\n" + "=" * 78)
    print("  REPORT BENCHMARK QSA - OPENROUTER")
    print(f"  Data: {datetime.now().strftime('%Y-%m-%d %H:%M')} | Lingua: {LANGUAGE}")
    print(f"  Provider sort: {PROVIDER_SORT or '-'} | Concorrenza: {CONCURRENT_USERS}")
    print("=" * 78)

    sorted_results = sorted(results, key=lambda r: (r.reliability, r.avg_quality, -_model_cost(r)), reverse=True)
    best_quality = max((r.avg_quality for r in sorted_results), default=1.0) or 1.0
    best_speed = max((r.avg_tps for r in sorted_results), default=1.0) or 1.0
    best_reliability = max((r.reliability for r in sorted_results), default=1.0) or 1.0

    print(f"{'Modello':<45} {'$/M in':>8} {'$/M out':>9} {'Aff.':>6} {'TTFT':>8} {'Tok/s':>8} {'Qual.':>7} {'Costo':>9} {'Score':>7}")
    print("-" * 120)
    for mr in sorted_results:
        price = _model_price(catalog, mr.model)
        score = (
            (mr.avg_quality / best_quality) * 0.4
            + (mr.avg_tps / best_speed) * 0.3
            + (mr.reliability / best_reliability) * 0.3
        )
        print(
            f"{mr.model:<45} "
            f"{price['prompt'] * 1_000_000:>8.3f} "
            f"{price['completion'] * 1_000_000:>9.3f} "
            f"{mr.reliability:>5.0f}% "
            f"{base._fmt_ms(mr.avg_ttft):>8} "
            f"{mr.avg_tps:>8.1f} "
            f"{mr.avg_quality:>7.2f} "
            f"${_model_cost(mr):>8.4f} "
            f"{score:>7.3f}"
        )

    print("-" * 120)
    print(f"Costo stimato totale benchmark: ${sum(_model_cost(r) for r in results):.4f}")


def _markdown_report(results: list[base.ModelResults], catalog: dict[str, dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("# Benchmark QSA CounselorBot - OpenRouter\n")
    lines.append(f"**Data**: {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  **Lingua**: {LANGUAGE}  |  **Provider sort**: `{PROVIDER_SORT or '-'}`\n")
    lines.append("Stesso profilo QSA, stessi step e stessa funzione di scoring del benchmark Ollama.\n")
    lines.append("## Classifica\n")
    lines.append("| # | Modello | $/M input | $/M output | Affidabilita | TTFT | Tok/s | Qualita | Costo test | Punteggio |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")

    sorted_results = sorted(results, key=lambda r: (r.reliability, r.avg_quality, -_model_cost(r)), reverse=True)
    best_quality = max((r.avg_quality for r in sorted_results), default=1.0) or 1.0
    best_speed = max((r.avg_tps for r in sorted_results), default=1.0) or 1.0
    best_reliability = max((r.reliability for r in sorted_results), default=1.0) or 1.0
    for i, mr in enumerate(sorted_results, 1):
        price = _model_price(catalog, mr.model)
        score = (
            (mr.avg_quality / best_quality) * 0.4
            + (mr.avg_tps / best_speed) * 0.3
            + (mr.reliability / best_reliability) * 0.3
        )
        lines.append(
            f"| {i} | `{mr.model}` | {price['prompt'] * 1_000_000:.3f} | "
            f"{price['completion'] * 1_000_000:.3f} | {mr.reliability:.0f}% | "
            f"{base._fmt_ms(mr.avg_ttft)} | {mr.avg_tps:.1f} | {mr.avg_quality:.2f} | "
            f"${_model_cost(mr):.4f} | {score:.3f} |"
        )

    lines.append("\n_Punteggio = qualita x 0.4 + velocita x 0.3 + affidabilita x 0.3. Il costo test usa i token/cost restituiti da OpenRouter quando disponibili._\n")
    lines.append("## Dettaglio\n")
    for mr in results:
        lines.append(f"### `{mr.model}`\n")
        lines.append("| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |")
        lines.append("|---|---|---:|---:|---:|---:|---:|---|")
        for step in mr.steps:
            stype = "follow-up" if step.step_type == "followup" else "guidato"
            lines.append(
                f"| {step.step_label} | {stype} | {base._fmt_ms(step.ttft_ms)} | "
                f"{base._fmt_ms(step.total_duration_ms)} | {step.eval_count} | "
                f"{step.tokens_per_second:.1f} | {step.quality.get('overall', 0):.2f} | "
                f"{(step.error or '')[:80]} |"
            )
        if mr.concurrency:
            c = mr.concurrency
            lines.append(
                f"\nConcorrenza: {c.n_users} utenti, parete {base._fmt_ms(c.total_wall_ms)}, "
                f"latenza media {base._fmt_ms(c.avg_latency_ms)}, errori {c.errors}/{c.total_requests}.\n"
            )
    lines.append("\n## Raw JSON\n")
    lines.append("Il file JSON affiancato contiene token, costi stimati e metriche grezze per step.\n")
    return "\n".join(lines)


async def main() -> None:
    api_key = _api_key()
    if not api_key:
        print("OPENROUTER_API_KEY/API_KEY_OPENROUTER non configurata.", file=sys.stderr)
        sys.exit(1)

    models = _selected_models()
    run_id = f"openrouter-qsa-benchmark-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    print("QSA OpenRouter Benchmark")
    print(f"   Run id: {run_id}")
    print(f"   Modelli: {', '.join(models)}")
    print(f"   Lingua: {LANGUAGE}")
    print(f"   Provider sort: {PROVIDER_SORT or '-'}")
    print(f"   Passi: {len(base.QSA_STEPS)} + follow-up: {len(base.FOLLOWUP_QUESTIONS)}")
    print()

    async with httpx.AsyncClient() as client:
        catalog = await fetch_model_catalog(client, api_key)
        results: list[base.ModelResults] = []

        for model in models:
            print("=" * 78)
            print(f"Test modello: {model}")
            print("=" * 78)
            mr = base.ModelResults(model=model)

            for i, step in enumerate(base.QSA_STEPS, 1):
                system_prompt, user_message = base.build_messages(step, base.QSA_PROFILE, LANGUAGE)
                print(f"   [{i}/{len(base.QSA_STEPS)}] {step['label']}...", end=" ", flush=True)
                result = await call_openrouter(client, api_key, catalog, model, system_prompt, user_message, step)
                mr.steps.append(result)
                write_benchmark_log(
                    run_id=run_id,
                    model=model,
                    step=step,
                    user_message=user_message,
                    system_prompt=system_prompt,
                    result=result,
                )
                if result.error:
                    print(f"ERRORE {result.error[:80]}")
                else:
                    print(
                        f"TTFT {base._fmt_ms(result.ttft_ms)} | "
                        f"{result.tokens_per_second:.1f} tok/s | "
                        f"qualita {result.quality.get('overall', 0):.2f}"
                    )

            for i, step in enumerate(base.FOLLOWUP_QUESTIONS, 1):
                system_prompt, user_message = base.build_messages(step, base.QSA_PROFILE, LANGUAGE)
                print(f"   [FUP {i}/{len(base.FOLLOWUP_QUESTIONS)}] {step['label']}...", end=" ", flush=True)
                result = await call_openrouter(client, api_key, catalog, model, system_prompt, user_message, step)
                mr.steps.append(result)
                write_benchmark_log(
                    run_id=run_id,
                    model=model,
                    step=step,
                    user_message=user_message,
                    system_prompt=system_prompt,
                    result=result,
                )
                if result.error:
                    print(f"ERRORE {result.error[:80]}")
                else:
                    print(
                        f"TTFT {base._fmt_ms(result.ttft_ms)} | "
                        f"{result.tokens_per_second:.1f} tok/s | "
                        f"qualita {result.quality.get('overall', 0):.2f}"
                    )

            if CONCURRENT_USERS > 0:
                print(f"   Concorrenza {CONCURRENT_USERS} utenti...", end=" ", flush=True)
                try:
                    mr.concurrency = await concurrency_test(
                        client, api_key, model, CONCURRENT_USERS, base.QSA_STEPS[0]
                    )
                    c = mr.concurrency
                    print(f"{base._fmt_ms(c.total_wall_ms)} parete | errori {c.errors}/{c.total_requests}")
                except Exception as exc:
                    print(f"ERRORE {exc}")

            results.append(mr)
            print()

    _print_report(results, catalog)

    if OUTPUT_FILE:
        out = Path(OUTPUT_FILE)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(_markdown_report(results, catalog), encoding="utf-8")
        raw_file = out.with_suffix(".json")
        raw = []
        for mr in results:
            item = {
                "model": mr.model,
                "avg_quality": mr.avg_quality,
                "avg_tps": mr.avg_tps,
                "avg_ttft": mr.avg_ttft,
                "reliability": mr.reliability,
                "estimated_cost_usd": _model_cost(mr),
                "steps": [asdict(step) for step in mr.steps],
                "concurrency": asdict(mr.concurrency) if mr.concurrency else None,
            }
            raw.append(item)
        raw_file.write_text(json.dumps(raw, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Report salvato in: {out}")
        print(f"JSON salvato in: {raw_file}")


def _main() -> None:
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrotto.")


if __name__ == "__main__":
    _main()
