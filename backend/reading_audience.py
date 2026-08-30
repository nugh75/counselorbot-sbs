"""Fascia di pubblico dello studente, per filtrare le letture certificate.

Il sistema non chiede l'eta' per personalizzare: la ricava da quello che lo
studente ha gia' scritto nel taccuino, dove `age`, `school_year` e `school_class`
sono campi dell'intake. In assenza di quello guarda la classe e il piano di
somministrazione, dove il livello lo dichiara un adulto.

Quando i segnali si contraddicono vince il piu' protettivo: se anche uno solo
dice «secondaria», la fascia e' quella. Meglio non proporre un saggio per adulti
a un minorenne che il contrario.
"""
from __future__ import annotations

import re
import unicodedata

# Ordinate dalla piu' protettiva alla meno.
AUDIENCE_BANDS = ("secondaria", "universita", "adulti")
_RANK = {band: index for index, band in enumerate(AUDIENCE_BANDS)}

# Testo libero: il taccuino accetta prosa in qualsiasi lingua, quindi solo
# parole chiave robuste e senza ambiguita'.
_SECONDARY_WORDS = ("liceo", "superiori", "superiore", "scuola secondaria", "istituto tecnico",
                    "professionale", "high school", "secondary school", "gymnasium", "lycee",
                    "instituto", "bachillerato", "abitur", "maturita", "quinta", "terza media")
_UNIVERSITY_WORDS = ("universita", "university", "universidad", "universite", "hochschule",
                     "laurea", "bachelor", "master", "triennale", "magistrale", "college",
                     "dottorato", "phd", "doctoral", "postdoc")


def _plain(text) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or "").casefold())
    return "".join(c for c in normalized if not unicodedata.combining(c))


def band_from_age(value) -> str | None:
    """Fascia da un'eta' numerica. Testo non numerico: nessun segnale."""
    match = re.search(r"\d{1,3}", str(value or ""))
    if not match:
        return None
    age = int(match.group(0))
    if age < 6 or age > 110:
        return None
    if age <= 18:
        return "secondaria"
    if age <= 25:
        return "universita"
    return "adulti"


def band_from_text(text) -> str | None:
    """Fascia da un campo libero (classe, anno, contesto)."""
    plain = _plain(text)
    if not plain.strip():
        return None
    if any(word in plain for word in _SECONDARY_WORDS):
        return "secondaria"
    if any(word in plain for word in _UNIVERSITY_WORDS):
        return "universita"
    return None


def most_protective(bands) -> str | None:
    """Fra segnali discordanti tiene il piu' cautelativo."""
    known = [b for b in bands if b in _RANK]
    if not known:
        return None
    return min(known, key=lambda b: _RANK[b])


def audience_allows(entry_audience, band: str | None) -> bool:
    """Una voce e' proponibile a quella fascia?

    Una voce senza `audience` vale per tutti. Fascia ignota: nessun filtro, e'
    il chiamante a decidere che fare (il contratto della skill chiede al modello
    di domandarlo prima di proporre).
    """
    declared = [str(a).strip() for a in (entry_audience or []) if str(a).strip()]
    if not declared or band is None:
        return True
    return band in declared


def resolve_audience_band(db, username: str) -> str | None:
    """Fascia dello studente dai dati gia' presenti. `None` = non ricavabile."""
    owner = (username or "").strip()
    if db is None or not owner:
        return None
    from . import models

    signals: list[str | None] = []

    revision = (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == owner)
        .order_by(models.LearnerProfileRevision.id.desc())
        .first()
    )
    if revision and isinstance(revision.data, dict):
        data = revision.data
        signals.append(band_from_age(data.get("age")))
        for key in ("school_year", "school_class", "context"):
            signals.append(band_from_text(data.get(key)))

    if not any(signals):
        membership = (
            db.query(models.GroupMembership)
            .filter(models.GroupMembership.username == owner)
            .order_by(models.GroupMembership.id.desc())
            .first()
        )
        group = (
            db.query(models.StudentGroup)
            .filter(models.StudentGroup.id == membership.group_id)
            .first()
            if membership else None
        )
        if group is not None:
            signals.append(group.school_level if group.school_level in _RANK else None)
            signals.append(band_from_text(group.name))

        result = (
            db.query(models.QuestionnaireResult)
            .filter(models.QuestionnaireResult.username == owner,
                    models.QuestionnaireResult.administration_plan_id.isnot(None))
            .order_by(models.QuestionnaireResult.id.desc())
            .first()
        )
        plan = (
            db.query(models.AdministrationPlan)
            .filter(models.AdministrationPlan.id == result.administration_plan_id)
            .first()
            if result else None
        )
        if plan is not None and plan.school_level in _RANK:
            signals.append(plan.school_level)

    return most_protective(signals)
