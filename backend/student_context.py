"""Che cosa lo studente ha già fatto, in una forma leggibile da un prompt.

Serve alla Bussola, che deve scegliere uno strumento: senza questo blocco
raccomandava al buio, e sapeva di un questionario già compilato solo se lo
studente glielo scriveva. Il Libretto resta fuori di proposito — sono
riflessioni per fattore, dettaglio che il routing non usa ed è il blocco più
grosso della chat guidata.

**I punteggi non entrano mai.** La Bussola non produce punteggi e non li
interpreta: quello è il mestiere della chat guidata. Qui passano il fatto e la
data, non i numeri.

Il modulo tiene anche l'elenco dei campi del taccuino, da cui dipende
`chat_logic`: la lista dei campi vive in un posto solo.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models

LEARNER_PROFILE_LABELS = {
    "age": "Età",
    "gender": "Genere",
    "school_class": "Classe / contesto",
    "school_year": "Anno / percorso",
    "context": "Contesto di studio",
    "goal": "Obiettivo attuale",
    "main_difficulty": "Difficoltà principale percepita",
    "strengths": "Punti di forza",
    "weaknesses": "Punti di debolezza",
    "notes": "Note",
}

# Tetto complessivo del blocco. Le sezioni sono ordinate per valore di
# instradamento e il taglio arriva dal fondo: se si sfora cade il portfolio,
# non l'elenco degli strumenti già compilati.
MAX_STUDENT_CONTEXT_CHARS = 2000

_MAX_PORTFOLIO_ITEMS = 8


def latest_learner_profile(db: Session, username: str) -> models.LearnerProfileRevision | None:
    """Ultima revisione del taccuino, o None."""
    if not username:
        return None
    return (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == username)
        .order_by(models.LearnerProfileRevision.created_at.desc(), models.LearnerProfileRevision.id.desc())
        .first()
    )


def _completed_instruments(db: Session, username: str) -> list[str]:
    """Strumento e data dell'ultima compilazione, uno per strumento."""
    rows = (
        db.query(models.QuestionnaireResult.questionnaire_type, models.QuestionnaireResult.submitted_at)
        .filter(models.QuestionnaireResult.username == username)
        .order_by(models.QuestionnaireResult.submitted_at.desc())
        .all()
    )
    seen: dict[str, str] = {}
    for code, submitted_at in rows:
        if not code or code in seen:
            continue
        seen[code] = submitted_at.date().isoformat() if submitted_at else ""
    return [f"- {code}{f' — {day}' if day else ''}" for code, day in seen.items()]


def _frozen_instruments(db: Session, username: str) -> list[str]:
    codes = (
        db.query(models.FrozenSession.questionnaire_type)
        .filter(models.FrozenSession.username == username)
        .order_by(models.FrozenSession.updated_at.desc())
        .all()
    )
    seen: list[str] = []
    for (code,) in codes:
        if code and code not in seen:
            seen.append(code)
    return [f"- {code}" for code in seen]


def _notebook_lines(db: Session, username: str) -> list[str]:
    revision = latest_learner_profile(db, username)
    if revision is None or not revision.data:
        return []
    lines = []
    for key, label in LEARNER_PROFILE_LABELS.items():
        value = str(revision.data.get(key) or "").strip()
        if value:
            lines.append(f"- {label}: {value}")
    return lines


def _portfolio_lines(db: Session, username: str) -> list[str]:
    items = (
        db.query(models.PortfolioItem)
        .filter(models.PortfolioItem.username == username)
        .order_by(models.PortfolioItem.created_at.desc(), models.PortfolioItem.id.desc())
        .limit(_MAX_PORTFOLIO_ITEMS)
        .all()
    )
    lines = []
    for item in items:
        meta = ", ".join(part for part in (item.category, item.item_date) if part)
        lines.append(f"- {item.title or 'Senza titolo'}{f' ({meta})' if meta else ''}")
    return lines


def student_context(db: Session, username: str) -> str:
    """Blocco da iniettare nel prompt. Stringa vuota per uno studente nuovo."""
    if not username:
        return ""

    sections: list[tuple[str, list[str], str]] = [
        (
            "Instruments already completed",
            _completed_instruments(db, username),
            "Recommending one of these opens its guided chat on results that already exist, "
            "so the student does not fill it in again. You never see the scores and never interpret them.",
        ),
        ("Interrupted sessions that can be resumed", _frozen_instruments(db, username), ""),
        ("The student's notebook, in their own words", _notebook_lines(db, username), ""),
        ("Portfolio", _portfolio_lines(db, username), ""),
    ]

    body: list[str] = []
    for title, lines, note in sections:
        if not lines:
            continue
        body.append(f"### {title}")
        body.extend(lines)
        if note:
            body.append(note)

    if not body:
        return ""

    header = [
        "",
        "## THE STUDENT SO FAR",
        "Context for choosing a tool, not material to recite: refer to it naturally when it "
        "explains your suggestion, never list it back, and never offer to change it — these "
        "spaces belong to the student.",
    ]
    return "\n".join(header + body)[:MAX_STUDENT_CONTEXT_CHARS] + "\n"
