"""Synchronize learning-biography entries with the personal timeline."""
import hashlib
import re
from datetime import date

from .visual_tools import PersonalWorkspace, SavePersonalWorkspace, load_workspace, save_workspace

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def biography_events(data: dict | None) -> list[dict[str, str]]:
    source = data or {}
    raw_events = source.get("bio_events")
    events = []
    if isinstance(raw_events, list):
        for index, raw in enumerate(raw_events):
            if not isinstance(raw, dict):
                continue
            event = {
                "id": str(raw.get("id") or f"event-{index + 1}")[:100],
                "date": str(raw.get("date") or "")[:10],
                "context": str(raw.get("context") or "").strip()[:160],
                "discovery": str(raw.get("discovery") or "").strip()[:1000],
                "keywords": str(raw.get("keywords") or "").strip()[:300],
            }
            if any(event[key] for key in ("date", "context", "discovery", "keywords")):
                events.append(event)
        if events:
            return events

    legacy = {
        "id": "legacy-1",
        "date": str(source.get("bio_date") or "")[:10],
        "context": str(source.get("bio_context") or "").strip()[:160],
        "discovery": str(source.get("bio_discovery") or "").strip()[:1000],
        "keywords": str(source.get("bio_keywords") or "").strip()[:300],
    }
    return [legacy] if any(legacy[key] for key in ("date", "context", "discovery", "keywords")) else []


def _timeline_id(booklet_id: int, event_id: str) -> str:
    digest = hashlib.sha256(event_id.encode()).hexdigest()[:16]
    return f"booklet-{booklet_id}-{digest}"


def sync_booklet_biography(db, booklet, *, delete: bool = False) -> None:
    """Replace only timeline events derived from this booklet.

    Call ``ensure_personal_timeline`` before changing the booklet. The caller
    owns the final commit so booklet and timeline changes remain atomic.
    """
    state = load_workspace(db, None, booklet.username)
    work = PersonalWorkspace.model_validate(state["workspace"])
    prefix = f"booklet-{booklet.id}-"
    previous = {event.id: event for event in work.timeline.events if event.id.startswith(prefix)}
    untouched = [event for event in work.timeline.events if not event.id.startswith(prefix)]
    derived = []
    booklet_title = str((booklet.data or {}).get("title") or "").strip()

    if not delete:
        for index, item in enumerate(biography_events(booklet.data)):
            event_id = _timeline_id(booklet.id, item["id"])
            old = previous.get(event_id)
            event_date = item["date"] if _DATE.match(item["date"]) else ""
            if event_date:
                try:
                    date.fromisoformat(event_date)
                except ValueError:
                    event_date = ""
            title = item["context"] or booklet_title or f"Evento di apprendimento {index + 1}"
            reflection = item["discovery"]
            if item["keywords"]:
                reflection = "\n".join(filter(None, (reflection, f"Parole chiave: {item['keywords']}")))
            derived.append({
                "id": event_id,
                "date_mode": "point" if event_date else None,
                "start_date": event_date or None,
                "end_date": None,
                "planned": old.planned if old else "",
                "institution_event": None,
                "institution_available": True,
                "institution_date": "start",
                "personal_links": sorted(set((old.personal_links if old else []) + ["booklet"])),
                "title": title[:160],
                "period": event_date or "—",
                "tense": "past",
                "symbol": old.symbol if old else "study",
                "reflection": reflection[:1000],
                # The localized personal_links label already links back to the
                # booklet; keeping source empty avoids storing UI text in one language.
                "source": "",
                "action_ids": list(old.action_ids) if old else [],
                "portfolio": [item.model_dump() for item in old.portfolio] if old else [],
            })

    data = work.model_dump()
    data["timeline"]["events"] = [event.model_dump() for event in untouched] + derived
    if data["timeline"]["events"] and not data["timeline"]["title"]:
        data["timeline"]["title"] = booklet_title or "Timeline"
    next_work = PersonalWorkspace.model_validate(data)
    if work.model_dump() == next_work.model_dump():
        return
    save_workspace(
        db,
        None,
        booklet.username,
        SavePersonalWorkspace(revision=state["revision"], workspace=next_work),
        commit=False,
    )
