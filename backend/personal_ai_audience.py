"""Who may use own AI sources: teachers for their own chats, students in their classes.

Each feature (personal APIs, ChatGPT) has one switch per audience. A switch that was
never saved counts as on, so installations keep today's behaviour until an
administrator turns one off. Staff (administrators and teachers) use the teacher
switch; everyone else the student switch, on top of the per-class permission.
"""
from . import models

FEATURES = ("api", "chatgpt")
AUDIENCES = ("teachers", "students")


def _key(feature, audience):
    return f"personal_ai_{feature}_{audience}_enabled"


def audience_enabled(db, feature, audience):
    with db.no_autoflush:
        row = db.query(models.Config).filter_by(key=_key(feature, audience)).first()
    return row is None or row.value == "true"


def audiences(db):
    return {feature: {audience: audience_enabled(db, feature, audience) for audience in AUDIENCES} for feature in FEATURES}


def set_audiences(db, values):
    for feature, switches in values.items():
        for audience, value in switches.items():
            row = db.query(models.Config).filter_by(key=_key(feature, audience)).first()
            if row is None:
                row = models.Config(key=_key(feature, audience), description=f"Own {feature} sources for {audience}")
                db.add(row)
            row.value = "true" if value else "false"
    db.commit()
    return audiences(db)


def remember(db, identity):
    """Record the bound person's role for nested AI calls of this request."""
    from .auth import is_teacher
    info = getattr(db, "info", None)
    if info is not None and identity and identity.get("authenticated") and identity.get("username"):
        info["personal_ai_staff"] = (identity["username"],
                                        bool(identity.get("is_admin") or is_teacher(identity.get("groups"))))


def is_staff(db, username):
    bound = getattr(db, "info", {}).get("personal_ai_staff")
    if bound and bound[0] == username:
        return bound[1]
    # Without a bound identity (background jobs): whoever manages a class is a teacher.
    with db.no_autoflush:
        return (db.query(models.StudentGroup.id).filter_by(owner_username=username).first() is not None
                or db.query(models.GroupShare.id).filter_by(shared_with_username=username).first() is not None)


def allowed(db, feature, username):
    if not username:
        return False
    return audience_enabled(db, feature, "teachers" if is_staff(db, username) else "students")
