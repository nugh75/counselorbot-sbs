"""Contesto del ruolo docente, in una forma leggibile da un prompt.

Specchio student-side di `student_context`: il taccuino del docente
(auto-descrizione del suo ruolo) e il contesto delle sue classi. Serve alla
chat guidata OBIETTIVO_DOCENZA, che deve parlare di una classe reale e non del
taccuino da studente del docente.

I punteggi e i questionari dello studente-docente non entrano mai: la chat
docenza produce un obiettivo didattico, non un'analisi del profilo personale.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models

TEACHER_PROFILE_LABELS = {
    "subjects": "Discipline insegnate",
    "experience": "Esperienza",
    "methodologies": "Metodologie d'aula",
    "classes_overview": "Classi e istituti",
    "formation_interests": "Interessi di formazione",
    "notes": "Note",
}

# Tetto del blocco taccuino docente nel prompt.
MAX_TEACHER_NOTEBOOK_CHARS = 1200
# Tetto del blocco classi scelte per la chat docenza.
MAX_TEACHER_GROUPS_CHARS = 1200
# Tetto del blocco contesto classe nella chat dello studente.
MAX_STUDENT_CLASS_CONTEXT_CHARS = 600

_GROUP_FIELD_CAP = 600


def latest_teacher_profile(db: Session, username: str) -> models.TeacherProfileRevision | None:
    """Ultima revisione del taccuino docente, o None."""
    if not username:
        return None
    return (
        db.query(models.TeacherProfileRevision)
        .filter(models.TeacherProfileRevision.username == username)
        .order_by(models.TeacherProfileRevision.created_at.desc(), models.TeacherProfileRevision.id.desc())
        .first()
    )


def teacher_notebook_context(db: Session, username: str) -> str:
    """Blocco 'taccuino del docente' per la chat docenza.

    Auto-descrizione del ruolo: disciplina, metodologie, esperienze. Percezione
    soggettiva di chi insegna, non un dato certificato."""
    if not username:
        return ""
    revision = latest_teacher_profile(db, username)
    if revision is None or not revision.data:
        return ""
    lines = [
        "## Taccuino del docente (auto-descrizione del ruolo)",
        "Auto-descrizione del docente come professionista: usala per contestualizzare "
        "l'obiettivo didattico nella sua pratica reale.",
    ]
    for key, label in TEACHER_PROFILE_LABELS.items():
        value = str(revision.data.get(key) or "").strip()
        if value:
            lines.append(f"- {label}: {value}")
    if len(lines) <= 2:
        return ""
    if revision.created_at:
        lines.append(f"- Ultimo aggiornamento: {revision.created_at.date().isoformat()}")
    return "\n".join(lines)[:MAX_TEACHER_NOTEBOOK_CHARS]


def _visible_group_for_teacher(db: Session, username: str, group_id: int) -> models.StudentGroup | None:
    """Classe visibile al docente: sua o condivisa con lui (GroupShare)."""
    group = db.get(models.StudentGroup, group_id)
    if group is None or not group.is_active:
        return None
    if group.owner_username == username:
        return group
    shared = (
        db.query(models.GroupShare.id)
        .filter(
            models.GroupShare.group_id == group_id,
            models.GroupShare.shared_with_username == username,
        )
        .first()
    )
    return group if shared else None


def teacher_groups_context(db: Session, username: str, group_ids: list[int] | None) -> str:
    """Blocco con le classi scelte dal docente per questa conversazione.

    Solo classi di cui il docente e' proprietario o co-docente: ogni turno
    riverifica l'accesso, quindi una condivisione revocata esce dal contesto
    senza richiedere di rifare la selezione. Con group_ids vuoto restituisce ""
    e la chat procede senza contesto di classe specifico."""
    if not username or not group_ids:
        return ""
    lines = ["## Classi di riferimento"]
    for group_id in group_ids:
        group = _visible_group_for_teacher(db, username, group_id)
        if group is None:
            continue
        head = f"- {group.name}"
        if group.school:
            head += f" — {group.school}"
        if group.school_level:
            head += f" ({group.school_level})"
        lines.append(head)
        for field in ("description", "methodologies"):
            value = str(getattr(group, field) or "").strip()
            if value:
                lines.append(f"  {value[:_GROUP_FIELD_CAP]}")
    if len(lines) <= 1:
        return ""
    return "\n".join(lines)[:MAX_TEACHER_GROUPS_CHARS]


def class_context_for_student(db: Session, username: str) -> str:
    """Blocco 'contesto classe' per la chat guidata dello studente.

    Solo classi di cui lo studente e' membro attivo e in cui il docente ha
    attivato la condivisione del contesto. Testo approvato dal docente,
    mai note su singoli studenti (TeacherNote resta fuori)."""
    if not username:
        return ""
    memberships = (
        db.query(models.GroupMembership.group_id)
        .filter(models.GroupMembership.username == username)
        .all()
    )
    group_ids = [row[0] for row in memberships]
    if not group_ids:
        return ""
    groups = (
        db.query(models.StudentGroup)
        .filter(
            models.StudentGroup.id.in_(group_ids),
            models.StudentGroup.is_active.is_(True),
            models.StudentGroup.context_visible_to_students.is_(True),
        )
        .all()
    )
    lines = ["## Contesto della classe"]
    for group in groups:
        head = f"- {group.name}"
        if group.school:
            head += f" — {group.school}"
        lines.append(head)
        for field in ("description", "methodologies"):
            value = str(getattr(group, field) or "").strip()
            if value:
                lines.append(f"  {value[:_GROUP_FIELD_CAP]}")
    if len(lines) <= 1:
        return ""
    return "\n".join(lines)[:MAX_STUDENT_CLASS_CONTEXT_CHARS]
