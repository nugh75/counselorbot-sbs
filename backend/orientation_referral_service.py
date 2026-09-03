"""Recupero dei referenti e degli eventi pertinenti.

Cugino di `certified_reading_service`, con due differenze che vengono dalla
natura del materiale.

**Gli eventi scadono.** Il filtro su `ends_at` fa sparire da se' un open day
passato: nessuno deve ricordarsi di cancellarlo.

**Niente embedding.** Le letture usano il recupero semantico perche' il loro
catalogo e' grande e il match sfumato. Qui i bisogni sono otto e discreti: il
match insiemistico basta, e un embedding aggiungerebbe latenza e
non-determinismo a un problema che non li ha.

Regole non negoziabili implementate qui:
  - una riga senza bisogni non entra mai, nemmeno quando il filtro e' spento:
    una voce che entrerebbe ovunque non e' una raccomandazione;
  - solo `status == "certified"` raggiunge uno studente;
  - un istituto diverso dal proprio non e' visibile; le righe nazionali si';
  - la fascia di pubblico dichiarata non viene scavalcata.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from . import models
from .reading_audience import audience_allows
from .referral_frame import frame

MAX_REFERRAL_CONTEXT_CHARS = 1800
_I18N_FALLBACKS = ("en", "it")


def _i18n(data, language: str) -> str:
    """Testo nella lingua del turno, poi inglese, poi italiano."""
    if not isinstance(data, dict):
        return ""
    for lang in (language or "it", *_I18N_FALLBACKS):
        value = str(data.get(lang) or "").strip()
        if value:
            return value
    return ""


def _scoped(rows, institution_ids: Iterable[int]):
    allowed = {int(i) for i in institution_ids or ()}
    return [r for r in rows if r.institution_id is None or r.institution_id in allowed]


def _matches(row, wanted: set[str], audience_band, questionnaire: str) -> bool:
    row_needs = {str(n) for n in (row.needs or [])}
    if not row_needs:
        return False  # una voce che entra ovunque non e' una raccomandazione
    if wanted and not (row_needs & wanted):
        return False
    if not audience_allows(row.audience, audience_band):
        return False
    scope = {str(s).upper() for s in (getattr(row, "questionnaire_types", None) or [])}
    if scope and questionnaire and questionnaire.upper() not in scope:
        return False
    return True


class OrientationReferralMemory:
    def retrieve_referrals(
        self,
        db: Session,
        *,
        needs: Iterable[str] = (),
        institution_ids: Iterable[int] = (),
        audience_band: str | None = None,
        questionnaire_type: str = "",
        language: str = "it",
        limit: int = 2,
    ) -> list[dict]:
        wanted = {str(n) for n in needs}
        rows = (
            db.query(models.OrientationReferral)
            .filter(models.OrientationReferral.status == "certified",
                    models.OrientationReferral.is_active.is_(True))
            .order_by(models.OrientationReferral.sort_order.asc(),
                      models.OrientationReferral.id.asc())
            .all()
        )
        eligible = [
            row for row in _scoped(rows, institution_ids)
            if _matches(row, wanted, audience_band, questionnaire_type)
        ]
        # A parita', la riga del proprio istituto viene prima di quella nazionale.
        eligible.sort(key=lambda row: 0 if row.institution_id is not None else 1)
        return [self._render_referral(row, language) for row in eligible[:max(0, limit)]]

    def retrieve_events(
        self,
        db: Session,
        *,
        needs: Iterable[str] = (),
        institution_ids: Iterable[int] = (),
        audience_band: str | None = None,
        questionnaire_type: str = "",
        language: str = "it",
        limit: int = 2,
    ) -> list[dict]:
        wanted = {str(n) for n in needs}
        now = datetime.now(timezone.utc)
        rows = (
            db.query(models.OrientationEvent)
            .filter(models.OrientationEvent.status == "certified",
                    models.OrientationEvent.is_active.is_(True),
                    models.OrientationEvent.ends_at >= now)
            .order_by(models.OrientationEvent.starts_at.asc(),
                      models.OrientationEvent.id.asc())
            .all()
        )
        eligible = [
            row for row in _scoped(rows, institution_ids)
            if _matches(row, wanted, audience_band, questionnaire_type)
        ]
        return [self._render_event(row, language) for row in eligible[:max(0, limit)]]

    def _render_referral(self, row, language: str) -> dict:
        contact = row.contact_channel if isinstance(row.contact_channel, dict) else {}
        return {
            "id": row.slug,
            "role": _i18n(row.role_label_i18n, language),
            "person": (row.person_name or "").strip(),
            "needs": list(row.needs or []),
            "what_for": _i18n(row.what_for_i18n, language),
            "how_to_reach": _i18n(row.how_to_reach_i18n, language),
            "email": str(contact.get("email") or "").strip(),
            "hours": str(contact.get("hours") or "").strip(),
            "location": str(contact.get("location") or "").strip(),
            "page_url": str(contact.get("page_url") or "").strip(),
            "institution_id": row.institution_id,
        }

    def _render_event(self, row, language: str) -> dict:
        return {
            "id": row.slug,
            "kind": row.kind,
            "title": _i18n(row.title_i18n, language),
            "summary": _i18n(row.summary_i18n, language),
            "needs": list(row.needs or []),
            "starts_at": row.starts_at.isoformat() if row.starts_at else "",
            "ends_at": row.ends_at.isoformat() if row.ends_at else "",
            "registration_deadline": (
                row.registration_deadline.isoformat() if row.registration_deadline else ""
            ),
            "page_url": (row.page_url or "").strip(),
            "location": (row.location or "").strip(),
            "is_online": bool(row.is_online),
            "institution_id": row.institution_id,
        }

    def render_context(self, referrals: list[dict], events: list[dict], language: str = "it") -> str:
        """Blocco `[REFERRALS]` per il prompt, nella lingua del turno.

        Il tag resta invariato: e' un marcatore per il motore, non una frase."""
        if not referrals and not events:
            return ""
        label = frame(language)
        lines = ["[REFERRALS]", label["intro"]]

        if referrals:
            lines.append(f"{label['referrals']}:")
            for entry in referrals:
                head = f"- {entry['role']}"
                if entry["person"]:
                    head += f" ({entry['person']})"
                lines.append(head)
                if entry["what_for"]:
                    lines.append(f"    {label['what_for']}: {entry['what_for']}")
                if entry["how_to_reach"]:
                    lines.append(f"    {label['how_to_reach']}: {entry['how_to_reach']}")
                contact = " · ".join(p for p in (entry["hours"], entry["location"],
                                                 entry["email"], entry["page_url"]) if p)
                if contact:
                    lines.append(f"    {label['contact']}: {contact}")

        if events:
            lines.append(f"{label['events']}:")
            for entry in events:
                lines.append(f"- {entry['title']}")
                if entry["summary"]:
                    lines.append(f"    {entry['summary']}")
                when = entry["starts_at"][:16].replace("T", " ")
                lines.append(f"    {label['when']}: {when}")
                where = label["online"] if entry["is_online"] else entry["location"]
                if where:
                    lines.append(f"    {label['where']}: {where}")
                if entry["registration_deadline"]:
                    deadline = entry["registration_deadline"][:10]
                    lines.append(f"    {label['deadline']}: {deadline}")
                if entry["page_url"]:
                    lines.append(f"    {label['page']}: {entry['page_url']}")

        # Un recapito troncato e' un recapito sbagliato: si taglia per riga
        # intera, mai a meta' carattere, cosi' un URL o una email non arriva
        # spezzata a meta'.
        text = "\n".join(lines)
        if len(text) <= MAX_REFERRAL_CONTEXT_CHARS:
            return text
        kept: list[str] = []
        total = 0
        for line in lines:
            added = len(line) + (1 if kept else 0)  # newline di giunzione
            if total + added > MAX_REFERRAL_CONTEXT_CHARS:
                break
            kept.append(line)
            total += added
        return "\n".join(kept)


orientation_referral_memory = OrientationReferralMemory()
