"""Class council overview (#422): what the class's teacher already sees, read-only.

The overview includes a conversation only when the teacher shared it explicitly
(#1027), with its own expiry and revocation. Private workspaces and goals the
student did not share with the class stay out.
"""
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from . import models
from .goals import descendant_ids
from .test_accounts import real_membership

PDF_SUMMARY_ACTION = "questionnaire_pdf_summary"  # routes.survey


def _iso(value):
    return value.isoformat() if value else None


def _members(db: Session, group_id: int) -> list[str]:
    return [
        username
        for (username,) in db.query(models.GroupMembership.username)
        .filter(models.GroupMembership.group_id == group_id, real_membership())
        .distinct()
        .order_by(models.GroupMembership.username)
    ]


def _plans(db: Session, group_id: int, usernames: list[str]) -> dict[str, list[dict]]:
    from .routes.class_paths import _path_context, _resolve_cells

    by_student: dict[str, list[dict]] = {u: [] for u in usernames}
    paths = (
        db.query(models.ClassPath)
        .filter(
            models.ClassPath.group_id == group_id,
            models.ClassPath.status == "published",
            models.ClassPath.archived_at.is_(None),
        )
        .order_by(models.ClassPath.published_at.asc(), models.ClassPath.id.asc())
        .all()
    )
    for path in paths:
        steps, available, auto, marks = _path_context(db, path, usernames)
        for username in usernames:
            cells, done, total, _next = _resolve_cells(
                db, path, steps, username, available=available, auto=auto, marks=marks)
            by_student[username].append({
                "path_id": path.id,
                "title": path.title,
                "done": done,
                "total": total,
                "steps": [
                    {
                        "title": cell["step"].title,
                        "step_type": cell["step"].step_type,
                        "state": cell["state"],
                        "due_date": _iso(cell["step"].due_date),
                    }
                    for cell in cells
                    if cell["state"] != "unavailable"
                ],
            })
    return by_student


def _summaries(db: Session, session_ids: list[str]) -> dict[str, str]:
    """Latest cached report summary per session: a summary, never the transcript."""
    if not session_ids:
        return {}
    rows = (
        db.query(models.Log.session_id, models.Log.details)
        .filter(models.Log.action == PDF_SUMMARY_ACTION, models.Log.session_id.in_(session_ids))
        .order_by(models.Log.timestamp.asc(), models.Log.id.asc())
        .all()
    )
    summaries = {}
    for session_id, details in rows:
        text = ((details or {}).get("summary") or "").strip()
        if text:
            summaries[session_id] = text
    return summaries


def _results(db: Session, usernames: list[str]) -> dict[str, list[dict]]:
    rows = (
        db.query(models.QuestionnaireResult)
        .filter(models.QuestionnaireResult.username.in_(usernames))
        .order_by(models.QuestionnaireResult.submitted_at.desc())
        .all()
    ) if usernames else []
    summaries = _summaries(db, [row.session_id for row in rows])
    by_student: dict[str, list[dict]] = {u: [] for u in usernames}
    for row in rows:
        by_student[row.username].append({
            "questionnaire_type": row.questionnaire_type,
            "scores": row.scores,
            "submitted_at": _iso(row.submitted_at),
            "summary": summaries.get(row.session_id),
        })
    return by_student


def _assignments(db: Session, group_id: int, usernames: list[str]) -> dict[str, list[dict]]:
    rows = (
        db.query(models.TeacherAssignment)
        .filter(models.TeacherAssignment.group_id == group_id, models.TeacherAssignment.revoked_at.is_(None))
        .order_by(models.TeacherAssignment.id.asc())
        .all()
    )
    by_student: dict[str, list[dict]] = {u: [] for u in usernames}
    for row in rows:
        if row.recipient_username is None:
            recipients = usernames
        else:
            recipients = [
                username for (username,) in db.query(models.AssignmentRecipient.username)
                .filter(models.AssignmentRecipient.assignment_id == row.id)
                if username in by_student
            ]
        settings = db.get(models.AssignmentLearningSettings, row.id)
        # Only the snapshot the student explicitly shared, as the teacher sees it.
        work = {
            w.username: w for w in db.query(models.AssignmentWork)
            .filter(models.AssignmentWork.assignment_id == row.id, models.AssignmentWork.submission.is_not(None))
        }
        for username in recipients:
            shared = work.get(username)
            by_student[username].append({
                "title": (row.snapshot or {}).get("title") or "",
                "intent": settings.intent if settings else "proposal",
                "due_date": _iso(settings.due_date) if settings else None,
                "submission": shared.submission if shared else None,
                "submitted_at": _iso(shared.submitted_at) if shared else None,
                "feedback": shared.feedback if shared else "",
            })
    return by_student


def _goals(db: Session, group_id: int, usernames: list[str]) -> dict[str, list[dict]]:
    # Same rule as the teacher view: a shared goal brings its branch below, never its ancestors.
    seeds = [
        goal_id for (goal_id,) in db.query(models.PersonalGoal.id).filter(
            models.PersonalGoal.shared_group_id == group_id, models.PersonalGoal.username.in_(usernames))
    ] if usernames else []
    visible = set(seeds) | descendant_ids(db, seeds)
    rows = (
        db.query(models.PersonalGoal)
        .filter(models.PersonalGoal.id.in_(visible), models.PersonalGoal.username.in_(usernames))
        .order_by(models.PersonalGoal.username, models.PersonalGoal.id)
        .all()
    ) if visible else []
    by_student: dict[str, list[dict]] = {u: [] for u in usernames}
    for row in rows:
        by_student[row.username].append({
            "title": row.title,
            "status": row.status,
            "criteria": row.criteria,
            "reflection": row.reflection,
            "review_date": row.review_date,
        })
    return by_student


def share_state(share: models.ClassCouncilShare, now: datetime) -> str:
    if share.revoked_at:
        return "revoked"
    return "expired" if share.expires_at <= now else "active"


def share_messages(db: Session, share: models.ClassCouncilShare) -> list[dict]:
    """The conversation the teacher shared, limited to this student's own logs."""
    from .routes.survey import _session_conversation_messages

    messages = _session_conversation_messages(db, share.session_id, share.student_username)
    if share.message_indexes is None:
        return messages
    selected = {index for index in share.message_indexes if isinstance(index, int)}
    return [
        message for index, message in enumerate(messages)
        if index in selected and message.get("role") == "student"
    ]


def serialize_share(share: models.ClassCouncilShare, now: datetime) -> dict:
    return {
        "id": share.id,
        "result_id": share.result_id,
        "session_id": share.session_id,
        "whole_chat": share.message_indexes is None,
        "message_indexes": share.message_indexes,
        "created_at": _iso(share.created_at),
        "expires_at": _iso(share.expires_at),
        "revoked_at": _iso(share.revoked_at),
        "state": share_state(share, now),
    }


def _shared_conversations(db: Session, group_id: int, usernames: list[str]) -> dict[str, list[dict]]:
    now = datetime.now(UTC)
    rows = (
        db.query(models.ClassCouncilShare)
        .filter(
            models.ClassCouncilShare.group_id == group_id,
            models.ClassCouncilShare.student_username.in_(usernames),
            models.ClassCouncilShare.revoked_at.is_(None),
            models.ClassCouncilShare.expires_at > now,
        )
        .order_by(models.ClassCouncilShare.created_at.asc(), models.ClassCouncilShare.id.asc())
        .all()
    ) if usernames else []
    by_student: dict[str, list[dict]] = {username: [] for username in usernames}
    result_ids = {row.result_id for row in rows}
    results = {
        row.id: row for row in db.query(models.QuestionnaireResult)
        .filter(models.QuestionnaireResult.id.in_(result_ids))
    } if result_ids else {}
    for row in rows:
        result = results.get(row.result_id)
        by_student[row.student_username].append({
            "id": row.id,
            "result_id": row.result_id,
            "questionnaire_type": result.questionnaire_type if result else None,
            "shared_at": _iso(row.created_at),
            "expires_at": _iso(row.expires_at),
            "whole_chat": row.message_indexes is None,
            "messages": share_messages(db, row),
        })
    return by_student


def council_overview(db: Session, group: models.StudentGroup) -> dict:
    usernames = _members(db, group.id)
    names = dict(
        db.query(models.UserDisplayName.username, models.UserDisplayName.display_name)
        .filter(models.UserDisplayName.username.in_(usernames))
        .all()
    ) if usernames else {}
    plans = _plans(db, group.id, usernames)
    results = _results(db, usernames)
    assignments = _assignments(db, group.id, usernames)
    goals = _goals(db, group.id, usernames)
    conversations = _shared_conversations(db, group.id, usernames)
    return {
        "group": {"id": group.id, "name": group.name},
        "students": [
            {
                "username": username,
                "display_name": names.get(username) or username,
                "plans": plans[username],
                "results": results[username],
                "assignments": assignments[username],
                "goals": goals[username],
                "shared_conversations": conversations[username],
            }
            for username in sorted(usernames, key=lambda u: (names.get(u) or u).lower())
        ],
    }
