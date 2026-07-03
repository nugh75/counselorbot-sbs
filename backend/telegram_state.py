"""State machine del bot Telegram CounselorBot.

Riusa la pipeline chat esistente (routes.chat.chat) con l'identita' dello
studente collegato: envelope, memoria di sessione, retrieval e logging restano
identici alla web app. Qui vivono solo parsing punteggi, formatter del profilo
e la conversazione Telegram (stato persistito in TelegramConversationState).
"""
import hashlib
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from . import database, models
from .api_models import ChatRequest
from .chat_logic import _ensure_questionnaire_guided_steps, strip_markdown
from .guided_step_label_i18n import resolve_step_label
from .qsa_extractor import QUESTIONNAIRE_FACTORS
from . import telegram_bot

logger = logging.getLogger(__name__)

LINK_CODE_TTL_MINUTES = 10
SCORE_QUESTIONNAIRES = ("QSA", "QSAr", "ZTPI", "QPCS", "QPCC", "QAP")
ALL_QUESTIONNAIRES = SCORE_QUESTIONNAIRES + ("SAVICKAS",)
STEP_ADVANCE_MARKER = "[[AVANZA_STEP]]"
# Fallback quando la tabella Factor non ha righe per lo strumento.
FALLBACK_FACTORS = {**QUESTIONNAIRE_FACTORS, "ZTPI": ("T1", "T2", "T3", "T4", "T5")}

# ponytail: testi bot solo it/en; le altre lingue cadono su en (le risposte AI
# seguono comunque la lingua dello studente). Aggiungere es/fr/de/sv se serve.
BOT_TEXTS = {
    "welcome_unlinked": {
        "it": "Benvenuto su CounselorBot. Per iniziare collega il tuo account: apri la pagina Profilo della web app, genera il codice e scrivimi:\n/link CODICE",
        "en": "Welcome to CounselorBot. First link your account: open the Profile page of the web app, generate the code and send me:\n/link CODE",
    },
    "welcome_linked": {
        "it": "Ciao {name}! Vuoi iniziare una nuova analisi?",
        "en": "Hi {name}! Do you want to start a new analysis?",
    },
    "help": {
        "it": "Comandi:\n/start - avvia il bot\n/link CODICE - collega il tuo account\n/unlink - scollega Telegram\n/strumenti - scegli uno strumento\n/counselor - scegli il counselor\n/nuovo - nuova analisi\n/stato - percorso corrente\n/annulla - annulla il flusso corrente",
        "en": "Commands:\n/start - start the bot\n/link CODE - link your account\n/unlink - unlink Telegram\n/strumenti - choose an instrument\n/counselor - choose the counselor\n/nuovo - new analysis\n/stato - current progress\n/annulla - cancel the current flow",
    },
    "need_link": {
        "it": "Prima devi collegare il tuo account CounselorBot: genera il codice nella pagina Profilo della web app e invia /link CODICE.",
        "en": "You need to link your CounselorBot account first: generate the code in the web app Profile page and send /link CODE.",
    },
    "link_usage": {
        "it": "Uso: /link CODICE (il codice si genera nella pagina Profilo della web app).",
        "en": "Usage: /link CODE (generate the code in the web app Profile page).",
    },
    "link_invalid": {
        "it": "Codice non valido o scaduto. Genera un nuovo codice dalla web app e riprova.",
        "en": "Invalid or expired code. Generate a new code from the web app and try again.",
    },
    "link_ok": {
        "it": "Account collegato! Ora scegli uno strumento con /strumenti.",
        "en": "Account linked! Now choose an instrument with /strumenti.",
    },
    "unlink_ok": {
        "it": "Telegram scollegato dal tuo account CounselorBot.",
        "en": "Telegram unlinked from your CounselorBot account.",
    },
    "choose_instrument": {
        "it": "Scegli lo strumento:",
        "en": "Choose the instrument:",
    },
    "enter_scores": {
        "it": "Inviami i punteggi {qtype} (valori 1-9), ad esempio:\n{example}\n\nFattori attesi:\n{factors}",
        "en": "Send me your {qtype} scores (values 1-9), for example:\n{example}\n\nExpected factors:\n{factors}",
    },
    "scores_recap": {
        "it": "Ho letto questi punteggi {qtype}:\n{recap}\n\nVuoi salvarli e avviare l'analisi?",
        "en": "I read these {qtype} scores:\n{recap}\n\nDo you want to save them and start the analysis?",
    },
    "scores_missing": {
        "it": "Mancano questi fattori: {missing}. Inviami solo quelli.",
        "en": "Missing factors: {missing}. Send just those.",
    },
    "scores_extra": {
        "it": "Codici non riconosciuti per {qtype}: {extra}. Non ho salvato nulla, ricontrolla.",
        "en": "Unrecognized codes for {qtype}: {extra}. Nothing saved, please check.",
    },
    "scores_invalid": {
        "it": "Valori non validi (devono essere interi 1-9): {invalid}",
        "en": "Invalid values (must be integers 1-9): {invalid}",
    },
    "scores_none": {
        "it": "Non ho riconosciuto punteggi nel messaggio. Formato: C1=7 C2=5 ...",
        "en": "I could not read any scores. Format: C1=7 C2=5 ...",
    },
    "cancelled": {
        "it": "Flusso annullato. Usa /strumenti per ripartire.",
        "en": "Flow cancelled. Use /strumenti to start again.",
    },
    "no_flow": {
        "it": "Nessun percorso attivo. Usa /strumenti per iniziare.",
        "en": "No active flow. Use /strumenti to start.",
    },
    "status": {
        "it": "Percorso attivo: {qtype}, passo \"{step}\". Scrivi una domanda o premi Prossimo passo.",
        "en": "Active flow: {qtype}, step \"{step}\". Ask a question or press Next step.",
    },
    "conclusion": {
        "it": "Percorso concluso. Grazie! Puoi iniziare una nuova analisi con /strumenti.",
        "en": "Flow completed. Thank you! You can start a new analysis with /strumenti.",
    },
    "ai_error": {
        "it": "Si e' verificato un problema nel generare la risposta. Riprova tra poco.",
        "en": "There was a problem generating the answer. Please retry shortly.",
    },
    "thinking": {
        "it": "Sto preparando la risposta...",
        "en": "Preparing the answer...",
    },
    "group_login": {
        "it": "Per partecipare accedi con il bottone qui sotto (puoi entrare anche come ospite anonimo): la pagina ti mostra il codice e ti riporta qui.",
        "en": "To join, log in with the button below (anonymous guest access works too): the page shows your code and brings you back here.",
    },
    "group_enrolled": {
        "it": "Sei nel gruppo: {label}.",
        "en": "You joined the group: {label}.",
    },
    "group_instrument": {
        "it": "Il tuo gruppo usa lo strumento {qtype}. Vuoi iniziare?",
        "en": "Your group uses the {qtype} instrument. Do you want to start?",
    },
    "btn_start_instrument": {"it": "Inizia {qtype}", "en": "Start {qtype}"},
    "counselor_choose": {
        "it": "Scegli il counselor che ti accompagna:",
        "en": "Choose the counselor who guides you:",
    },
    "counselor_set": {
        "it": "Counselor selezionato: {name}.",
        "en": "Selected counselor: {name}.",
    },
    "counselor_line": {
        "it": "Counselor: {name} (cambia con /counselor)",
        "en": "Counselor: {name} (change with /counselor)",
    },
    "counselor_default": {"it": "predefinito", "en": "default"},
    "teacher_message": {
        "it": "\U0001F4E9 Messaggio dal tuo docente:",
        "en": "\U0001F4E9 Message from your teacher:",
    },
    "btn_open_login": {"it": "Accedi e collega", "en": "Log in and link"},
    "btn_new": {"it": "Nuova analisi", "en": "New analysis"},
    "btn_resume": {"it": "Riprendi", "en": "Resume"},
    "btn_next": {"it": "Prossimo passo", "en": "Next step"},
    "btn_end": {"it": "Concludi", "en": "Finish"},
    "btn_confirm": {"it": "Conferma", "en": "Confirm"},
    "btn_redo": {"it": "Correggi", "en": "Fix"},
    "btn_cancel": {"it": "Annulla", "en": "Cancel"},
}

SCORE_EXAMPLES = {
    "QSA": "C1=7 C2=5 C3=3 C4=6 C5=4 C6=8 C7=5 A1=6 A2=7 A3=5 A4=3 A5=6 A6=7 A7=4",
    "QSAr": "C1r=7 C2r=5 C3r=3 C4r=6 A1r=6 A2r=7 A3r=5 A4r=3",
    "ZTPI": "T1=4 T2=7 T3=5 T4=3 T5=6",
    "QPCS": "S1=5 S2=6 S3=4 S4=7 S5=5",
    "QPCC": "K1=5 K2=6 K3=4 K4=7 K5=5",
    "QAP": "AD1=5 AD2=6 AD3=4 AD4=7",
}


def _t(key: str, language: str, **kwargs) -> str:
    texts = BOT_TEXTS[key]
    template = texts.get(language) or texts["en"]
    return template.format(**kwargs) if kwargs else template


def normalize_language(language_code: str | None) -> str:
    from .routes.chat import _normalize_language
    return _normalize_language(language_code)


def public_base_url() -> str:
    """Base pubblica della web app, derivata da TELEGRAM_PUBLIC_WEBHOOK_URL."""
    import os
    from urllib.parse import urlsplit
    raw = os.environ.get("TELEGRAM_PUBLIC_WEBHOOK_URL", "").strip()
    if not raw:
        return ""
    parts = urlsplit(raw)
    return f"{parts.scheme}://{parts.netloc}"


def resolve_group(db: Session, code: str) -> tuple[int | None, int | None, str | None, str | None]:
    """Codice gruppo -> (plan_id, contact_id, label, instrument_code). Prima piano,
    poi contatto (stessa risoluzione dello study code web in routes/survey.py)."""
    normalized = (code or "").strip().upper()
    if not normalized:
        return None, None, None, None
    plan = (
        db.query(models.AdministrationPlan)
        .filter(models.AdministrationPlan.code == normalized)
        .first()
    )
    if plan:
        return plan.id, None, plan.title or plan.code, plan.instrument_code
    contact = (
        db.query(models.ResearchContact)
        .filter(models.ResearchContact.code == normalized, models.ResearchContact.is_active.is_(True))
        .first()
    )
    if contact:
        return None, contact.id, contact.name or contact.code, None
    return None, None, None, None


# --- Link codes -----------------------------------------------------------

def hash_link_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


def create_link_code(db: Session, username: str) -> str:
    """Genera un codice monouso (6 char non ambigui) e lo salva hashato."""
    import secrets
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(6))
    db.add(models.TelegramLinkCode(
        username=username,
        code_hash=hash_link_code(code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=LINK_CODE_TTL_MINUTES),
    ))
    db.commit()
    return code


def consume_link_code(db: Session, code: str) -> str | None:
    """Valida e brucia il codice; ritorna lo username o None."""
    row = (
        db.query(models.TelegramLinkCode)
        .filter(
            models.TelegramLinkCode.code_hash == hash_link_code(code),
            models.TelegramLinkCode.used_at.is_(None),
            models.TelegramLinkCode.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if not row:
        return None
    row.used_at = datetime.now(timezone.utc)
    db.commit()
    return row.username


def get_active_link(db: Session, telegram_user_id: int) -> models.TelegramAccountLink | None:
    return (
        db.query(models.TelegramAccountLink)
        .filter(
            models.TelegramAccountLink.telegram_user_id == telegram_user_id,
            models.TelegramAccountLink.revoked_at.is_(None),
        )
        .first()
    )


# --- Punteggi -------------------------------------------------------------

def allowed_factor_codes(db: Session, questionnaire_type: str) -> list[str]:
    """Codici fattore ammessi, dal DB (Factor) con fallback al catalogo statico."""
    rows = (
        db.query(models.Factor)
        .filter(models.Factor.instrument_code == questionnaire_type)
        .order_by(models.Factor.sort_order)
        .all()
    )
    if rows:
        return [r.code for r in rows]
    return list(FALLBACK_FACTORS.get(questionnaire_type, ()))


_SCORE_TOKEN = re.compile(r"([A-Za-z]+\d*r?)\s*[:=]\s*(\S+)")


def parse_scores(text: str, allowed_codes: list[str]) -> tuple[dict, list[str], list[str]]:
    """Estrae punteggi `CODICE=valore` dal testo libero.

    Ritorna (scores, extra_codes, invalid_tokens). Separatori accettati:
    spazio, virgola, punto e virgola, newline; `:` oltre a `=`; codici
    case-insensitive normalizzati alla forma canonica dello strumento.
    """
    canonical = {c.lower(): c for c in allowed_codes}
    scores: dict[str, int] = {}
    extra: list[str] = []
    invalid: list[str] = []
    for raw_code, raw_value in _SCORE_TOKEN.findall(text or ""):
        code = canonical.get(raw_code.lower())
        value_str = raw_value.rstrip(",;")
        if not code:
            extra.append(raw_code)
            continue
        try:
            value = int(value_str)
        except ValueError:
            invalid.append(f"{raw_code}={value_str}")
            continue
        if not 1 <= value <= 9:
            invalid.append(f"{raw_code}={value_str}")
            continue
        scores[code] = value
    return scores, extra, invalid


def _factor_label(factor: models.Factor | None, code: str, language: str) -> str:
    if not factor:
        return code
    by_lang = {
        "it": factor.label_it,
        "en": factor.label_en,
        "es": factor.label_es,
        "sv": factor.label_sv,
    }
    return by_lang.get(language) or factor.label_it or factor.label_en or code


def format_scores_context(db: Session, questionnaire_type: str, scores: dict | None, language: str = "it") -> str:
    """Equivalente backend di buildScoresFormatter (GuidedChatInterface.tsx)."""
    if questionnaire_type == "SAVICKAS":
        return "CONTESTO INTERVISTA SAVICKAS: percorso narrativo qualitativo senza punteggi numerici."
    scores = scores or {}
    factors = {
        f.code: f
        for f in db.query(models.Factor)
        .filter(models.Factor.instrument_code == questionnaire_type)
        .all()
    }
    ordered = sorted(scores.items(), key=lambda kv: kv[0])
    if questionnaire_type == "ZTPI":
        parts = " ".join(
            f"{code} ({_factor_label(factors.get(code), code, language)}): {value}/9"
            for code, value in ordered
        )
        return f"PROFILO TEMPORALE DELLO STUDENTE:\n{parts}"
    lines = "\n".join(
        f"- {code} ({_factor_label(factors.get(code), code, language)}): {value}/9"
        for code, value in ordered
    )
    return f"PROFILO {questionnaire_type} DELLO STUDENTE:\n{lines}"


# --- Stato conversazione ---------------------------------------------------

def _get_state(db: Session, telegram_user_id: int, chat_id: int, username: str, language: str) -> models.TelegramConversationState:
    state = (
        db.query(models.TelegramConversationState)
        .filter(models.TelegramConversationState.telegram_user_id == telegram_user_id)
        .first()
    )
    if not state:
        state = models.TelegramConversationState(
            telegram_user_id=telegram_user_id,
            telegram_chat_id=chat_id,
            username=username,
            state="idle",
            language=language,
        )
        db.add(state)
        db.commit()
        db.refresh(state)
    else:
        state.telegram_chat_id = chat_id
        state.username = username
        state.language = language
    return state


def _reset_state(state: models.TelegramConversationState) -> None:
    state.state = "idle"
    state.questionnaire_type = None
    state.session_id = None
    state.conversation_id = None
    state.scores = None
    state.step_id = None


# --- Flusso guidato (riuso pipeline chat) -----------------------------------

def _steps(db: Session, questionnaire_type: str) -> list[models.GuidedStep]:
    _ensure_questionnaire_guided_steps(db, questionnaire_type)
    return (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStep.sort_order)
        .all()
    )


def _identity_for(username: str) -> dict:
    return {
        "email": "",
        "username": username,
        "name": username,
        "groups": [],
        "is_admin": False,
        "is_researcher": False,
        "authenticated": True,
    }


def _interactive_mode(questionnaire_type: str, step: models.GuidedStep | None) -> str:
    """Mode per i follow-up in-step (speculare a resolveInteractiveMode nel frontend)."""
    step_mode = step.system_prompt_mode if step else "generic"
    if questionnaire_type == "QSA" and step_mode in ("factor", "second-level"):
        return "factor-qa"
    if questionnaire_type == "QSAr" and step_mode in ("qsar-factor", "qsar-second-level"):
        return "qsar-factor-qa"
    if questionnaire_type == "SAVICKAS":
        return "savickas-interview"
    return step_mode


async def _call_chat(db: Session, state: models.TelegramConversationState, *, message: str,
                     mode: str, phase: str | None, use_phase_prompt: bool,
                     memory_message: str | None = None, internal: bool = False) -> str | None:
    """Invoca la pipeline chat web con l'identita' dello studente collegato."""
    from .routes.chat import chat as chat_endpoint
    request = ChatRequest(
        message=message,
        memory_message=memory_message,
        internal_message=internal,
        mode=mode,
        phase=phase,
        use_phase_prompt=use_phase_prompt,
        scores_context=format_scores_context(db, state.questionnaire_type, state.scores, state.language),
        session_id=state.session_id,
        conversation_id=state.conversation_id,
        questionnaire_type=state.questionnaire_type,
        language=state.language,
        max_tokens=700,
        counselor_id=state.counselor_id,
    )
    try:
        result = await chat_endpoint(request, BackgroundTasks(), db, _identity_for(state.username))
    except Exception:
        logger.exception("Telegram: errore pipeline chat (session %s)", state.session_id)
        return None
    state.conversation_id = result.get("conversation_id") or state.conversation_id
    text = (result.get("response") or "").replace(STEP_ADVANCE_MARKER, "").strip()
    return strip_markdown(text)


def _step_keyboard(language: str) -> list[list[dict]]:
    return [[
        {"text": _t("btn_next", language), "callback_data": "step:next"},
        {"text": _t("btn_end", language), "callback_data": "step:end"},
    ]]


async def _run_step(db: Session, state: models.TelegramConversationState, step: models.GuidedStep) -> None:
    state.state = "in_step"
    state.step_id = step.id
    db.commit()
    label = resolve_step_label(step, state.language)
    await telegram_bot.send_message(state.telegram_chat_id, f"--- {label} ---\n{_t('thinking', state.language)}")
    text = await _call_chat(
        db, state, message="", mode=step.system_prompt_mode,
        phase=step.id, use_phase_prompt=True,
    )
    db.commit()
    if text is None:
        await telegram_bot.send_message(state.telegram_chat_id, _t("ai_error", state.language), keyboard=_step_keyboard(state.language))
        return
    await telegram_bot.send_message(state.telegram_chat_id, text, keyboard=_step_keyboard(state.language))


async def _start_flow(db: Session, state: models.TelegramConversationState) -> None:
    state.session_id = str(uuid.uuid4())
    state.conversation_id = None
    if state.questionnaire_type in SCORE_QUESTIONNAIRES:
        link = get_active_link(db, state.telegram_user_id)
        db.add(models.QuestionnaireResult(
            session_id=state.session_id,
            questionnaire_type=state.questionnaire_type,
            scores=state.scores,
            username=state.username,
            administration_plan_id=link.administration_plan_id if link else None,
            research_contact_id=link.research_contact_id if link else None,
        ))
    db.commit()
    steps = _steps(db, state.questionnaire_type)
    if not steps:
        await telegram_bot.send_message(state.telegram_chat_id, _t("ai_error", state.language))
        _reset_state(state)
        db.commit()
        return
    await _run_step(db, state, steps[0])


async def _advance_step(db: Session, state: models.TelegramConversationState) -> None:
    steps = _steps(db, state.questionnaire_type)
    ids = [s.id for s in steps]
    try:
        index = ids.index(state.step_id)
    except ValueError:
        index = -1
    if index + 1 < len(steps):
        await _run_step(db, state, steps[index + 1])
    else:
        await _finish_flow(db, state)


async def _finish_flow(db: Session, state: models.TelegramConversationState) -> None:
    language = state.language
    chat_id = state.telegram_chat_id
    _reset_state(state)
    db.commit()
    await telegram_bot.send_message(chat_id, _t("conclusion", language))


# --- Handler update --------------------------------------------------------

def _counselor_name(db: Session, counselor_id: int | None, language: str) -> str:
    if counselor_id:
        counselor = (
            db.query(models.Counselor)
            .filter(models.Counselor.id == counselor_id, models.Counselor.is_active.is_(True))
            .first()
        )
        if counselor:
            return counselor.name
    return _t("counselor_default", language)


def _counselor_keyboard(db: Session, language: str) -> list[list[dict]]:
    counselors = (
        db.query(models.Counselor)
        .filter(models.Counselor.is_active.is_(True))
        .order_by(models.Counselor.id)
        .all()
    )
    rows: list[list[dict]] = []
    row: list[dict] = []
    for counselor in counselors:
        row.append({"text": counselor.name, "callback_data": f"couns:{counselor.id}"})
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([{"text": _t("counselor_default", language).capitalize(), "callback_data": "couns:0"}])
    return rows


def _choose_instrument_text(db: Session, state: models.TelegramConversationState, language: str) -> str:
    counselor = _counselor_name(db, state.counselor_id, language)
    return f"{_t('choose_instrument', language)}\n{_t('counselor_line', language, name=counselor)}"


def _instrument_keyboard() -> list[list[dict]]:
    rows, row = [], []
    for qtype in ALL_QUESTIONNAIRES:
        row.append({"text": qtype.capitalize() if qtype == "SAVICKAS" else qtype, "callback_data": f"instr:{qtype}"})
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return rows


async def _prompt_scores(db: Session, state: models.TelegramConversationState) -> None:
    qtype = state.questionnaire_type
    codes = allowed_factor_codes(db, qtype)
    factors = {
        f.code: f
        for f in db.query(models.Factor)
        .filter(models.Factor.instrument_code == qtype)
        .all()
    }
    factor_lines = "\n".join(
        f"- {code} ({_factor_label(factors.get(code), code, state.language)})"
        for code in codes
    )
    example = SCORE_EXAMPLES.get(qtype) or " ".join(f"{c}=5" for c in codes[:4])
    await telegram_bot.send_message(
        state.telegram_chat_id,
        _t("enter_scores", state.language, qtype=qtype, example=example, factors=factor_lines),
    )


async def _handle_scores_text(db: Session, state: models.TelegramConversationState, text: str) -> None:
    qtype = state.questionnaire_type
    codes = allowed_factor_codes(db, qtype)
    parsed, extra, invalid = parse_scores(text, codes)
    language = state.language
    if extra:
        await telegram_bot.send_message(state.telegram_chat_id, _t("scores_extra", language, qtype=qtype, extra=", ".join(extra)))
        return
    if invalid:
        await telegram_bot.send_message(state.telegram_chat_id, _t("scores_invalid", language, invalid=", ".join(invalid)))
        return
    if not parsed:
        await telegram_bot.send_message(state.telegram_chat_id, _t("scores_none", language))
        return
    merged = dict(state.scores or {})
    merged.update(parsed)
    state.scores = merged
    missing = [c for c in codes if c not in merged]
    if missing:
        db.commit()
        await telegram_bot.send_message(state.telegram_chat_id, _t("scores_missing", language, missing=", ".join(missing)))
        return
    state.state = "confirm_scores"
    db.commit()
    recap = ", ".join(f"{c}={merged[c]}" for c in codes)
    keyboard = [[
        {"text": _t("btn_confirm", language), "callback_data": "scores:confirm"},
        {"text": _t("btn_redo", language), "callback_data": "scores:redo"},
        {"text": _t("btn_cancel", language), "callback_data": "scores:cancel"},
    ]]
    await telegram_bot.send_message(state.telegram_chat_id, _t("scores_recap", language, qtype=qtype, recap=recap), keyboard=keyboard)


async def _handle_free_text(db: Session, state: models.TelegramConversationState, text: str) -> None:
    steps = {s.id: s for s in _steps(db, state.questionnaire_type)}
    step = steps.get(state.step_id)
    mode = _interactive_mode(state.questionnaire_type, step)
    message = text
    if state.questionnaire_type == "SAVICKAS" and step and step.prompt:
        message = (
            f"CURRENT STEP INTERNAL INSTRUCTIONS (use them only as guidance; "
            f"answer the student in language \"{state.language}\"):\n{step.prompt}\n\nSTUDENT ANSWER:\n{text}"
        )
    response = await _call_chat(
        db, state, message=message, memory_message=text,
        mode=mode, phase=state.step_id, use_phase_prompt=False,
    )
    db.commit()
    if response is None:
        await telegram_bot.send_message(state.telegram_chat_id, _t("ai_error", state.language), keyboard=_step_keyboard(state.language))
        return
    await telegram_bot.send_message(state.telegram_chat_id, response, keyboard=_step_keyboard(state.language))


async def _do_link(db: Session, sender: dict, chat_id: int, language: str,
                   code: str, group_code: str | None = None) -> None:
    """Consuma un codice /link e collega l'account; opzionale iscrizione gruppo."""
    user_id = sender.get("id")
    username = consume_link_code(db, code)
    if not username:
        await telegram_bot.send_message(chat_id, _t("link_invalid", language))
        return
    link = (
        db.query(models.TelegramAccountLink)
        .filter(models.TelegramAccountLink.telegram_user_id == user_id)
        .first()
    )
    if link:
        link.username = username
        link.telegram_chat_id = chat_id
        link.telegram_username = sender.get("username")
        link.revoked_at = None
    else:
        link = models.TelegramAccountLink(
            username=username,
            telegram_user_id=user_id,
            telegram_chat_id=chat_id,
            telegram_username=sender.get("username"),
        )
        db.add(link)
    group_label = None
    group_instrument = None
    if group_code:
        plan_id, contact_id, group_label, group_instrument = resolve_group(db, group_code)
        if plan_id or contact_id:
            link.administration_plan_id = plan_id
            link.research_contact_id = contact_id
        if plan_id:
            from .routes.administration_plans import ensure_membership
            ensure_membership(db, plan_id, username, "telegram")
    db.commit()
    message = _t("link_ok", language)
    keyboard = None
    if group_label:
        message = f"{message}\n{_t('group_enrolled', language, label=group_label)}"
    if group_instrument:
        # Propone subito lo strumento del gruppo: un tap e si passa ai punteggi
        # (con l'elenco dei fattori attesi per QUELLO strumento).
        message = f"{message}\n{_t('group_instrument', language, qtype=group_instrument)}"
        keyboard = [[{
            "text": _t("btn_start_instrument", language, qtype=group_instrument),
            "callback_data": f"instr:{group_instrument}",
        }]]
    await telegram_bot.send_message(chat_id, message, keyboard=keyboard)


async def _handle_message(db: Session, message: dict) -> None:
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    if chat.get("type") != "private" or sender.get("is_bot"):
        return
    chat_id = chat.get("id")
    user_id = sender.get("id")
    if not chat_id or not user_id:
        return
    text = (message.get("text") or "").strip()
    language = normalize_language(sender.get("language_code"))
    link = get_active_link(db, user_id)

    command = text.split()[0].lower() if text.startswith("/") and text.split() else ""
    command = command.split("@", 1)[0]  # /cmd@botname -> /cmd

    if command == "/link":
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            await telegram_bot.send_message(chat_id, _t("link_usage", language))
            return
        await _do_link(db, sender, chat_id, language, parts[1])
        return

    if command == "/start":
        # Deep link t.me/<bot>?start=<payload>: g_<gruppo> arriva dal link del
        # docente, l_<codice>[__<gruppo>] dal bottone "torna al bot" della pagina
        # /telegram-link. Flusso stateless: il gruppo viaggia nel payload.
        parts = text.split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else ""
        if payload.startswith("g_"):
            group_code = payload[2:]
            base = public_base_url()
            keyboard = None
            if base:
                keyboard = [[{
                    "text": _t("btn_open_login", language),
                    "url": f"{base}/telegram-link?g={group_code}",
                }]]
            await telegram_bot.send_message(chat_id, _t("group_login", language), keyboard=keyboard)
            return
        if payload.startswith("l_"):
            code, _, group_code = payload[2:].partition("__")
            await _do_link(db, sender, chat_id, language, code, group_code or None)
            return

    if command in ("/aiuto", "/help"):
        await telegram_bot.send_message(chat_id, _t("help", language))
        return

    if not link:
        await telegram_bot.send_message(chat_id, _t("need_link", language) if command != "/start" else _t("welcome_unlinked", language))
        return

    state = _get_state(db, user_id, chat_id, link.username, language)

    if command == "/unlink":
        link.revoked_at = datetime.now(timezone.utc)
        _reset_state(state)
        db.commit()
        await telegram_bot.send_message(chat_id, _t("unlink_ok", language))
        return

    if command == "/start":
        db.commit()
        keyboard = [[{"text": _t("btn_new", language), "callback_data": "flow:new"}]]
        if state.state == "in_step":
            keyboard[0].append({"text": _t("btn_resume", language), "callback_data": "flow:resume"})
        name = sender.get("first_name") or link.username
        await telegram_bot.send_message(chat_id, _t("welcome_linked", language, name=name), keyboard=keyboard)
        return

    if command in ("/strumenti", "/nuovo"):
        _reset_state(state)
        state.state = "choose_instrument"
        db.commit()
        await telegram_bot.send_message(chat_id, _choose_instrument_text(db, state, language), keyboard=_instrument_keyboard())
        return

    if command == "/counselor":
        db.commit()
        await telegram_bot.send_message(chat_id, _t("counselor_choose", language), keyboard=_counselor_keyboard(db, language))
        return

    if command == "/stato":
        db.commit()
        counselor_line = _t("counselor_line", language, name=_counselor_name(db, state.counselor_id, language))
        if state.state == "in_step" and state.step_id:
            steps = {s.id: s for s in _steps(db, state.questionnaire_type)}
            step = steps.get(state.step_id)
            label = resolve_step_label(step, language) if step else state.step_id
            await telegram_bot.send_message(chat_id, f"{_t('status', language, qtype=state.questionnaire_type, step=label)}\n{counselor_line}")
        else:
            await telegram_bot.send_message(chat_id, f"{_t('no_flow', language)}\n{counselor_line}")
        return

    if command == "/annulla":
        _reset_state(state)
        db.commit()
        await telegram_bot.send_message(chat_id, _t("cancelled", language))
        return

    if command:
        db.commit()
        await telegram_bot.send_message(chat_id, _t("help", language))
        return

    # Testo libero: dipende dallo stato corrente.
    if state.state == "enter_scores":
        await _handle_scores_text(db, state, text)
    elif state.state == "in_step":
        await telegram_bot.send_message(chat_id, _t("thinking", language))
        await _handle_free_text(db, state, text)
    else:
        db.commit()
        await telegram_bot.send_message(chat_id, _t("no_flow", language))


async def _handle_callback(db: Session, callback: dict) -> None:
    message = callback.get("message") or {}
    chat = message.get("chat") or {}
    sender = callback.get("from") or {}
    data = callback.get("data") or ""
    if callback.get("id"):
        await telegram_bot.answer_callback_query(callback["id"])
    if chat.get("type") != "private":
        return
    chat_id = chat.get("id")
    user_id = sender.get("id")
    if not chat_id or not user_id:
        return
    language = normalize_language(sender.get("language_code"))
    link = get_active_link(db, user_id)
    if not link:
        await telegram_bot.send_message(chat_id, _t("need_link", language))
        return
    state = _get_state(db, user_id, chat_id, link.username, language)

    if data in ("flow:new",):
        _reset_state(state)
        state.state = "choose_instrument"
        db.commit()
        await telegram_bot.send_message(chat_id, _choose_instrument_text(db, state, language), keyboard=_instrument_keyboard())
        return

    if data.startswith("couns:"):
        try:
            counselor_id = int(data.split(":", 1)[1])
        except ValueError:
            return
        state.counselor_id = counselor_id or None
        db.commit()
        name = _counselor_name(db, state.counselor_id, language)
        await telegram_bot.send_message(chat_id, _t("counselor_set", language, name=name))
        return

    if data == "flow:resume":
        db.commit()
        if state.state == "in_step" and state.step_id:
            steps = {s.id: s for s in _steps(db, state.questionnaire_type)}
            step = steps.get(state.step_id)
            label = resolve_step_label(step, language) if step else state.step_id
            await telegram_bot.send_message(chat_id, _t("status", language, qtype=state.questionnaire_type, step=label), keyboard=_step_keyboard(language))
        else:
            await telegram_bot.send_message(chat_id, _t("no_flow", language))
        return

    if data.startswith("instr:"):
        qtype = data.split(":", 1)[1]
        if qtype not in ALL_QUESTIONNAIRES:
            return
        _reset_state(state)
        state.questionnaire_type = qtype
        if qtype == "SAVICKAS":
            db.commit()
            await _start_flow(db, state)
        else:
            state.state = "enter_scores"
            state.scores = {}
            db.commit()
            await _prompt_scores(db, state)
        return

    if data == "scores:confirm" and state.state == "confirm_scores":
        await _start_flow(db, state)
        return

    if data == "scores:redo":
        state.state = "enter_scores"
        state.scores = {}
        db.commit()
        await _prompt_scores(db, state)
        return

    if data == "scores:cancel":
        _reset_state(state)
        db.commit()
        await telegram_bot.send_message(chat_id, _t("cancelled", language))
        return

    if data == "step:next" and state.state == "in_step":
        await _advance_step(db, state)
        return

    if data == "step:end" and state.state == "in_step":
        await _finish_flow(db, state)
        return


async def process_update(update: dict) -> None:
    """Entry point (eseguito fuori dal ciclo request del webhook): sessione DB propria."""
    db = database.SessionLocal()
    try:
        if "callback_query" in update:
            await _handle_callback(db, update["callback_query"])
        elif "message" in update:
            await _handle_message(db, update["message"])
    except Exception:
        logger.exception("Telegram: errore nella gestione dell'update")
    finally:
        db.close()
