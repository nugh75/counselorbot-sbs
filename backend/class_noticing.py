"""Noticing di classe (#464, #890): temi e suggerimenti dal Noticing dell'intero percorso.

Il modello raggruppa soltanto elementi gia' verificati per ogni studente
(`student_noticing`): non legge le fonti e non puo' introdurre citazioni nuove.
Conteggi e grafici sono calcolati qui, non dal modello.
"""
import hashlib
import json
from collections import Counter
from datetime import UTC, datetime, timedelta, timezone

from . import models
from .ai_service import AIService
from .class_council import _members
from .student_noticing import iso_time, student_noticing
from .teacher_noticing import KINDS, ask_json
from .test_accounts import real_membership

CLASS_NOTICING_ACTION = "class_noticing"
CLASS_NOTICING_PROMPT_VERSION = 2
MAX_THEMES = 6
MAX_SUGGESTIONS = 4

_SYSTEM_PROMPT = (
    "You help a teacher read the noticing notes of a whole class. You group notes into shared "
    "themes and suggest short, practical classroom actions. You never diagnose or rank students. "
    "Answer with JSON only."
)


def _session_key(group_id: int) -> str:
    return f"class-noticing-{group_id}"


def class_results(db, group, instrument: str | None, days: int | None):
    from .privacy.authz import is_resource_in_group_scope
    from .privacy.types import ResourceRef
    members = [row.username for row in db.query(models.GroupMembership).filter_by(group_id=group.id).filter(real_membership())]
    query = db.query(models.QuestionnaireResult).filter(models.QuestionnaireResult.username.in_(members))
    if instrument:
        query = query.filter(models.QuestionnaireResult.questionnaire_type == instrument)
    if days:
        query = query.filter(models.QuestionnaireResult.submitted_at >= datetime.now(UTC) - timedelta(days=days))
    candidates = query.order_by(models.QuestionnaireResult.submitted_at.desc(), models.QuestionnaireResult.id.desc()).all()
    results = []
    for row in candidates:
        res_ref = ResourceRef(kind="result", subject=row.username, owner_group=str(group.id), created_at=row.submitted_at)
        if is_resource_in_group_scope(db, res_ref, group.id, result_obj=row):
            results.append(row)
    return results


def _prompt(items: list[dict], lang_name: str) -> str:
    lines = [f"[{item['id']}] ({item['kind']}) {item['text']}" for item in items]
    notes = "\n".join(lines)
    return f"""
Write in {lang_name}.

Noticing notes from the whole student journeys of one class. Each note has an id, a kind and a sentence:
{notes}

1. Group the notes into at most {MAX_THEMES} themes shared across the class. A theme has a short
   title (at most 8 words), the ids of its notes and one short practical suggestion for the teacher
   (at most 25 words). A note may stay out of every theme.
2. Write at most {MAX_SUGGESTIONS} short instructions for the teacher about the whole class
   (at most 25 words each), most useful first.

Answer with this JSON and nothing else:
{{"themes": [{{"title": "...", "item_ids": ["12-0"], "suggestion": "..."}}], "suggestions": ["..."]}}
""".strip()


def _fingerprint(items: list[dict], lang: str) -> str:
    payload = json.dumps({"version": CLASS_NOTICING_PROMPT_VERSION, "lang": lang,
                          "items": [[i["id"], i["kind"], i["text"]] for i in items]}, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _filters(instrument, days) -> dict:
    return {"instrument": instrument or None, "days": days or None}


def _latest(db, group_id: int, lang: str, filters: dict):
    rows = (db.query(models.TeacherNoticingArtifact)
            .filter_by(kind=CLASS_NOTICING_ACTION, scope_key=_session_key(group_id), language=lang)
            .order_by(models.TeacherNoticingArtifact.id.desc()).all())
    return next((row for row in rows if (row.payload or {}).get("filters") == filters), None)


def _themes(raw: list, items_by_id: dict[str, dict]) -> list[dict]:
    themes = []
    for theme in raw or []:
        if not isinstance(theme, dict):
            continue
        title = str(theme.get("title") or "").strip()
        ids = [i for i in dict.fromkeys(str(x) for x in theme.get("item_ids") or []) if i in items_by_id]
        if not title or not ids:
            continue
        notes = [items_by_id[i] for i in ids]
        students = []
        for note in notes:
            ref = note["evidence"][0]
            students.append({"username": note["username"], "text": note["text"],
                             "source": ref, "quote": ref["quote"]})
        themes.append({
            "title": title,
            "kind": Counter(note["kind"] for note in notes).most_common(1)[0][0],
            "suggestion": str(theme.get("suggestion") or "").strip(),
            "student_count": len({note["username"] for note in notes}),
            "students": students,
        })
    return sorted(themes, key=lambda t: -t["student_count"])[:MAX_THEMES]


def class_noticing(db, group, lang: str, *, instrument: str | None = None, days: int | None = None,
                   generate: bool = False, username: str | None = None) -> dict:
    from .routes.survey import _PDF_SUMMARY_LANG_NAME, _pdf_language

    lang = _pdf_language(lang)
    filters = _filters(instrument, days)
    members = _members(db, group.id)
    students, items = [], []
    for member in members:
        state = student_noticing(db, group, member, lang, instrument=instrument, days=days)
        students.append(state)
        items.extend({**item, "id": f"{member}:{item['id']}", "username": member} for item in state["items"])
    charts = {
        "kinds": {kind: len({i["username"] for i in items if i["kind"] == kind}) for kind in KINDS},
        "students": len(members),
        "students_with_sources": sum(s["source_count"] > 0 for s in students),
    }
    inventory = students if not instrument and not days else [student_noticing(db, group, m, lang) for m in members]
    instruments = sorted({tool for state in inventory for tool in state["instruments"] if tool})
    base = {"students": students, "instruments": instruments, "charts": charts, "themes": [], "suggestions": [], "generated_at": None}
    if not charts["students_with_sources"]:
        return {**base, "status": "empty"}
    if generate and any(s["pending_chunks"] for s in students):
        from fastapi import HTTPException
        raise HTTPException(409, "noticing_analysis_incomplete")
    fingerprint = _fingerprint(items, lang) + ":" + ":".join(s["fingerprint"] for s in students)
    items_by_id = {item["id"]: item for item in items}
    if generate:
        data = {"themes": [], "suggestions": []}
        # Every verified note is grouped, in bounded batches, before the
        # displayed themes are selected: long journeys are not clipped.
        for offset in range(0, max(1, len(items)), 60):
            part = ask_json(AIService(db, username=username), _prompt(items[offset:offset + 60], _PDF_SUMMARY_LANG_NAME[lang]),
                            _SYSTEM_PROMPT, f"Class noticing for group {group.id}", max_tokens=2500)
            if part is None or not isinstance(part.get("themes"), list) or not isinstance(part.get("suggestions"), list):
                return {**base, "status": "unavailable"}
            data["themes"].extend(part["themes"])
            data["suggestions"].extend(part["suggestions"])
        db.add(models.TeacherNoticingArtifact(
            scope_key=_session_key(group.id), group_id=group.id, author_username=username,
            kind=CLASS_NOTICING_ACTION, language=lang,
            payload={"filters": filters, "fingerprint": fingerprint, **data}))
        db.commit()
    row = _latest(db, group.id, lang, filters)
    if row is None:
        return {**base, "status": "missing"}
    details = row.payload or {}
    return {
        **base,
        "status": "ready" if details.get("fingerprint") == fingerprint else "stale",
        # Ricalcolati a ogni lettura: gli elementi spariti non restano nei temi.
        "themes": _themes(details.get("themes"), items_by_id),
        "suggestions": [str(s).strip() for s in details.get("suggestions") or [] if str(s).strip()][:MAX_SUGGESTIONS],
        "generated_at": iso_time(row.created_at),
    }
