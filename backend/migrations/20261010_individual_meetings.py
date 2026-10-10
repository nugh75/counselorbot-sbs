"""Individual meetings (#176): host, bookable slots and bookings on class meetings."""

from sqlalchemy import text
from .. import models

CHECKS = {
    "class_meeting_kind": "kind IN ('group', 'individual')",
    "class_meeting_host_kind": "host_kind IN ('teacher', 'referent', 'expert')",
    "class_meeting_group_date": "kind = 'individual' OR starts_at IS NOT NULL",
    "class_meeting_expert_name": "host_kind <> 'expert' OR host_name IS NOT NULL",
}


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(17620261010)"))
        # Existing meetings are group meetings held by the teacher.
        connection.execute(text(
            "ALTER TABLE class_meetings ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'group'"))
        connection.execute(text(
            "ALTER TABLE class_meetings ADD COLUMN IF NOT EXISTS host_kind VARCHAR(20) NOT NULL DEFAULT 'teacher'"))
        connection.execute(text(
            "ALTER TABLE class_meetings ADD COLUMN IF NOT EXISTS referral_id INTEGER "
            "REFERENCES orientation_referrals(id) ON DELETE SET NULL"))
        connection.execute(text("ALTER TABLE class_meetings ADD COLUMN IF NOT EXISTS host_name VARCHAR(200)"))
        connection.execute(text("ALTER TABLE class_meetings ADD COLUMN IF NOT EXISTS host_role VARCHAR(200)"))
        connection.execute(text("ALTER TABLE class_meetings ALTER COLUMN starts_at DROP NOT NULL"))
        present = {name for (name,) in connection.execute(text(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'class_meetings'::regclass"))}
        for name, check in CHECKS.items():
            if name not in present:
                connection.execute(text(f"ALTER TABLE class_meetings ADD CONSTRAINT {name} CHECK ({check})"))
        # create_all already ran at startup; repeat it here so replays and upgrades match.
        models.ClassMeetingSlot.__table__.create(connection, checkfirst=True)
        models.ClassMeetingBooking.__table__.create(connection, checkfirst=True)
