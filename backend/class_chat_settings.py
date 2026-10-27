"""Chat policy for actual, active enrolments, including teachers as learners."""
from . import models

PARAMETERS = {
    "response_format": ("response_format", "standard"),
    "response_length": ("response_length", "medium"),
    "response_reasoning": ("reasoning_effort", "standard"),
}


def resolve_class_chat_settings(db, identity):
    username = identity.get("username") if identity.get("authenticated") else None
    rows = []
    if username:
        rows = (db.query(models.StudentGroup.id, models.ClassSettings)
                .join(models.GroupMembership, models.GroupMembership.group_id == models.StudentGroup.id)
                .outerjoin(models.ClassSettings, models.ClassSettings.group_id == models.StudentGroup.id)
                .filter(models.GroupMembership.username == username, models.StudentGroup.is_active.is_(True))
                .order_by(models.StudentGroup.id).all())
    settings = [setting for _, setting in rows if setting is not None]
    result = {"group_ids": [group_id for group_id, _ in rows]}
    for field, (_, fallback) in PARAMETERS.items():
        permission = f"allow_student_{field}"
        locked = [setting for setting in settings if not getattr(setting, permission)]
        result[permission] = not locked
        # A permissive class cannot supply the value of another class's lock.
        # Conflicting locks use the oldest class (lowest stable ID).
        result[field] = (getattr(locked[0], field) or fallback) if locked else next(
            (getattr(setting, field) for setting in settings if getattr(setting, field) is not None), None)
    return result


def apply_class_chat_settings(db, identity, request):
    from .class_access import is_staff
    if request.preview and identity.get("is_admin"):
        return request
    step = db.get(models.GuidedStep, request.phase) if request.phase else None
    instrument = step.questionnaire_type if step else request.questionnaire_type
    # Teacher work uses its explicitly selected classes, not learner enrolments.
    if instrument == "OBIETTIVO_DOCENZA" and is_staff(identity):
        return request
    policy = resolve_class_chat_settings(db, identity)
    updates = {}
    for field, (request_field, _) in PARAMETERS.items():
        if not policy[f"allow_student_{field}"]:
            updates[request_field] = policy[field]
        elif (request_field not in request.model_fields_set or getattr(request, request_field) is None) and policy[field] is not None:
            updates[request_field] = policy[field]
    return request.model_copy(update=updates) if updates else request
