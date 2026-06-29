"""Runner di test del prompt counselor, eseguito DENTRO il container backend.

Pensato per essere lanciato via stdin dal Makefile:

    docker exec -i counselorbot_backend python - < scripts/prompt_test.py

Tutti i parametri arrivano da variabili d'ambiente PT_* (impostate dai target make):

    PT_Q          questionario (QSA, QSAr, ZTPI, QPCS, QPCC, QAP, SAVICKAS)  [QSA]
    PT_STEP       id dello step/phase (vedi `make prompt-steps Q=...`)        [intro]
    PT_COUNSELOR  id del counselor (7 = Nadia, ollama locale)                 [7]
    PT_STUDENT    username dello studente (per identity + punteggi)           [admin]
    PT_LANG       lingua di risposta                                          [it]
    PT_KNOWLEDGE  includi il blocco [KNOWLEDGE] (true/false)                  [true]
    PT_MSG        messaggio utente (vuoto = messaggio intro generico)         []
    PT_MODE       live (chiama LLM + logga) | dry (solo envelope, no log)     [live]

In modalita' `live` usa run_prompt_audit_live con identity=studente, cosi' la riga
nei `logs` risulta sotto quello studente, e (con full-prompt-logging attivo) include
l'envelope completo. Lo script poi rilegge il Log per confermarlo.
"""
import os
import sys

from backend.database import SessionLocal
from backend import models
from backend.schemas import PromptAuditRequest
from backend.prompt_audit import build_prompt_audit, run_prompt_audit_live
from backend.ai_service import AIService
from backend.chat_logic import full_prompt_logging_enabled


def _env(name, default=""):
    return (os.environ.get(name) or "").strip() or default


def _bool(value, default=True):
    if not value:
        return default
    return value.strip().lower() not in ("0", "false", "no", "off")


def _format_scores(db, student, questionnaire):
    """Ultimo profilo punteggi dello studente per quel questionario, come testo.

    Vuoto se non esistono punteggi (es. QPCS/QPCC/QAP per gli studenti fittizi, o
    questionari qualitativi come SAVICKAS)."""
    row = (
        db.query(models.QuestionnaireResult)
        .filter(
            models.QuestionnaireResult.username == student,
            models.QuestionnaireResult.questionnaire_type == questionnaire,
        )
        .order_by(models.QuestionnaireResult.id.desc())
        .first()
    )
    if not row or not row.scores:
        return ""
    lines = [f"- {code}: {score}/9" for code, score in row.scores.items()]
    return f"PROFILO {questionnaire} DELLO STUDENTE:\n" + "\n".join(lines)


def _valid_steps(db, questionnaire):
    rows = (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == questionnaire)
        .order_by(models.GuidedStep.sort_order.asc())
        .all()
    )
    return [(s.id, s.label) for s in rows]


def main():
    q = _env("PT_Q", "QSA")
    step = _env("PT_STEP", "intro")
    counselor_id = int(_env("PT_COUNSELOR", "7"))
    student = _env("PT_STUDENT", "admin")
    lang = _env("PT_LANG", "it")
    knowledge = _bool(_env("PT_KNOWLEDGE", "true"))
    mode = _env("PT_MODE", "live").lower()
    message = _env(
        "PT_MSG",
        "Introduce yourself as the counselor, welcome me warmly and explain in "
        "3-4 sentences how we'll explore my profile together. Do NOT analyse or "
        "mention any factor or score yet.",
    )

    db = SessionLocal()
    try:
        steps = _valid_steps(db, q)
        step_ids = {sid for sid, _ in steps}
        if step not in step_ids:
            print(f"ERRORE: step '{step}' non valido per il questionario '{q}'.")
            if steps:
                print("Step validi:")
                for sid, label in steps:
                    print(f"  {sid:20s} {label}")
            else:
                print(f"Nessuno step trovato per '{q}'. Questionari con uppercase? (QSA, QSAr, ZTPI, QPCS, QPCC, QAP, SAVICKAS)")
            sys.exit(2)

        scores_context = _format_scores(db, student, q)

        session_id = f"make-test-{q}-{step}-{student}"
        req = PromptAuditRequest(
            questionnaire_type=q,
            phase=step,
            mode="generic",
            use_phase_prompt=True,
            language=lang,
            counselor_id=counselor_id,
            message=message,
            scores_context=scores_context,
            session_id=session_id,
            include_knowledge=knowledge,
            include_history=False,
        )

        print("=" * 70)
        print(f"PROMPT TEST  | Q={q}  STEP={step}  STUDENT={student}  "
              f"COUNSELOR={counselor_id}  LANG={lang}  MODE={mode}  KNOWLEDGE={knowledge}")
        print(f"scores: {'(nessun punteggio)' if not scores_context else scores_context.splitlines()[0] + ' ...'}")
        print("=" * 70)

        if mode == "dry":
            result = build_prompt_audit(db, req, ai_service_cls=AIService)
            env = result["envelope"]
            print("\n----- SYSTEM_PROMPT_FINAL -----\n")
            print(env["system_prompt_final"])
            print("\n----- FULL_MESSAGE -----\n")
            print(env["full_message"])
            return

        # live: chiama il LLM e scrive il Log
        if not full_prompt_logging_enabled(db):
            print("ATTENZIONE: full-prompt-logging DISATTIVO (config log_full_prompt). "
                  "L'envelope NON sara' salvato nel log. Usa `make prompt-log-on`.\n")

        identity = {
            "username": student,
            "email": f"{student}@local",
            "is_admin": True,
            "authenticated": True,
        }
        run_prompt_audit_live(db, req, identity=identity, ai_service_cls=AIService)

        log = (
            db.query(models.Log)
            .filter(models.Log.session_id == session_id)
            .order_by(models.Log.id.desc())
            .first()
        )
        if not log:
            print("ATTENZIONE: nessuna riga di log trovata per la sessione.")
            return
        details = log.details or {}
        envelope = details.get("envelope") or {}
        spf = envelope.get("system_prompt_final") or ""
        print(f"\nLOG id={log.id}  username={log.username}  "
              f"code={log.anonymous_research_code}  provider={log.provider}  model={log.model_name}")
        print(f"envelope salvato: {'SI' if spf else 'NO'} "
              f"(system_prompt_final = {len(spf)} char)")
        print("\n----- BOT RESPONSE -----\n")
        print(details.get("bot_response") or "(vuota)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
