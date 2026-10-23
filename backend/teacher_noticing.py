"""Quadro di noticing per il docente (#247): elementi da riprendere con lo studente.

Ogni elemento deve poggiare su frasi dello studente citate alla lettera: una
citazione che non si ritrova nel messaggio indicato viene scartata, e un
elemento senza citazioni valide non arriva al docente.
"""
import hashlib
import json
import logging
import re

from . import models
from .ai_service import AIService

logger = logging.getLogger(__name__)

NOTICING_ACTION = "teacher_noticing"
NOTICING_PROMPT_VERSION = 1
KINDS = ("revisit", "resource", "difficulty", "attention")
MAX_ITEMS = 6
MAX_EVIDENCE = 3
_STUDENT_CHARS = 1200
_COUNSELOR_CHARS = 300
_TRANSCRIPT_CHARS = 30000

_SYSTEM_PROMPT = (
    "You support a teacher who reviews a student's counseling conversation. You notice what is "
    "worth discussing with the student; you never diagnose, label or judge the student. Every "
    "element must be grounded in the student's own words, quoted exactly. Answer with JSON only."
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def _fingerprint(messages: list[dict], lang: str) -> str:
    payload = json.dumps({"version": NOTICING_PROMPT_VERSION, "lang": lang,
                          "messages": [[m.get("role", ""), m.get("text", "")] for m in messages]},
                         sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _transcript(messages: list[dict]) -> str:
    lines = []
    for index, message in enumerate(messages):
        text = re.sub(r"\s+", " ", message.get("text") or "").strip()
        if message.get("role") == "student":
            lines.append(f"[{index}] Student: {text[:_STUDENT_CHARS]}")
        else:
            lines.append(f"[{index}] Counselor: {text[:_COUNSELOR_CHARS]}")
    # Le conversazioni lunghe tengono la parte finale: e' quella che vale.
    while len(lines) > 1 and sum(len(line) + 1 for line in lines) > _TRANSCRIPT_CHARS:
        lines.pop(0)
    return "\n".join(lines)


def _prompt(questionnaire_type: str, transcript: str, lang_name: str) -> str:
    return f"""
Write in {lang_name}.

Questionnaire: {questionnaire_type}
Conversation, each message numbered in square brackets:
{transcript}

List at most {MAX_ITEMS} elements a teacher could pick up with the student. Each element has a kind:
- "revisit": a theme, question or decision worth discussing again;
- "resource": something the student shows they can do or rely on;
- "difficulty": an obstacle or doubt the student names;
- "attention": a sign of discomfort or risk that deserves the teacher's care.

For each element write one short sentence for the teacher and quote, word for word, one to
{MAX_EVIDENCE} short passages (at most 25 words each) from Student messages that support it, with
the message number. Quote only Student messages. Skip anything you cannot quote.

Answer with this JSON and nothing else:
{{"items": [{{"kind": "revisit", "text": "...", "evidence": [{{"message": 3, "quote": "..."}}]}}]}}
""".strip()


def _parse_json(answer: str | None) -> dict | None:
    if not answer:
        return None
    start, end = answer.find("{"), answer.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(answer[start:end + 1])
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _parse(answer: str | None) -> list | None:
    data = _parse_json(answer)
    items = data.get("items") if data else None
    return items if isinstance(items, list) else None


def grounded_items(items: list, messages: list[dict]) -> list[dict]:
    """Solo elementi con almeno una citazione presente nel messaggio dello studente indicato."""
    kept = []
    for item in items or []:
        if not isinstance(item, dict) or item.get("kind") not in KINDS:
            continue
        text = str(item.get("text") or "").strip()
        evidence = []
        for ref in item.get("evidence") or []:
            if not isinstance(ref, dict):
                continue
            index, quote = ref.get("message"), str(ref.get("quote") or "").strip()
            if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(messages):
                continue
            message = messages[index]
            if message.get("role") != "student" or len(quote) < 3:
                continue
            if _normalize(quote) in _normalize(message.get("text")):
                evidence.append({"message": index, "quote": quote})
        if text and evidence:
            kept.append({"kind": item["kind"], "text": text, "evidence": evidence[:MAX_EVIDENCE]})
    return kept[:MAX_ITEMS]


def _latest(db, session_id: str, lang: str):
    rows = (db.query(models.Log)
            .filter(models.Log.action == NOTICING_ACTION, models.Log.session_id == session_id)
            .order_by(models.Log.id.desc()).all())
    return next((row for row in rows if (row.details or {}).get("language") == lang), None)


def noticing(db, result, lang: str, *, generate: bool = False) -> dict:
    """Stato e elementi del quadro; genera solo se richiesto, mai alla semplice apertura."""
    from .routes.survey import _PDF_SUMMARY_LANG_NAME, _pdf_language, _session_conversation_messages

    lang = _pdf_language(lang)
    messages = _session_conversation_messages(db, result.session_id)
    if not any(m.get("role") == "student" for m in messages):
        return {"status": "empty", "items": [], "generated_at": None}
    fingerprint = _fingerprint(messages, lang)
    if generate:
        last_chat = (db.query(models.Log)
                     .filter(models.Log.session_id == result.session_id, models.Log.action == "chat_message")
                     .order_by(models.Log.id.desc()).first())
        try:
            answer = AIService(db, username=result.username).get_response(
                _prompt(result.questionnaire_type, _transcript(messages), _PDF_SUMMARY_LANG_NAME[lang]),
                _SYSTEM_PROMPT, "generic", max_tokens=1200,
                provider=last_chat.provider if last_chat else None,
                model=last_chat.model_name if last_chat else None,
            )
        except Exception as exc:
            logger.warning("Noticing generation failed for session %s: %s", result.session_id, exc)
            answer = None
        items = _parse(answer)
        if items is None:
            return {"status": "unavailable", "items": [], "generated_at": None}
        db.add(models.Log(session_id=result.session_id, action=NOTICING_ACTION,
                          questionnaire_type=result.questionnaire_type,
                          details={"language": lang, "fingerprint": fingerprint,
                                   "items": grounded_items(items, messages)}))
        db.commit()
    row = _latest(db, result.session_id, lang)
    if row is None:
        return {"status": "missing", "items": [], "generated_at": None}
    details = row.details or {}
    return {
        "status": "ready" if details.get("fingerprint") == fingerprint else "stale",
        # Ricontrollate a ogni lettura: una conversazione cambiata non sposta le citazioni.
        "items": grounded_items(details.get("items"), messages),
        "generated_at": row.timestamp.isoformat() if row.timestamp else None,
    }
