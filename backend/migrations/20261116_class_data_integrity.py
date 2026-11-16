"""Class data integrity (#1000): one membership per student, cascading local tables,
consistent goal catalog targets.

`create_all` adds none of this to tables that already exist. Each step checks the
live schema first, so the migration is idempotent and safe to run on every start.
"""
from sqlalchemy import inspect, text

MEMBERSHIP_CONSTRAINT = "uq_group_membership_user"
CASCADE_TABLES = ("class_pairing_codes", "local_students")
TARGET_CHECK = "ck_goal_catalog_target_recipient"
TARGET_INDEXES = {
    "uq_goal_catalog_target_class":
        "ON goal_catalog_targets (catalog_id, group_id) WHERE username IS NULL AND practice_notebook_id IS NULL",
    "uq_goal_catalog_target_student":
        "ON goal_catalog_targets (catalog_id, group_id, username) WHERE username IS NOT NULL",
    "uq_goal_catalog_target_practice":
        "ON goal_catalog_targets (catalog_id, practice_notebook_id) WHERE practice_notebook_id IS NOT NULL",
}


def merge_duplicate_memberships(conn):
    """Keep the oldest row of each (group_id, username), then add the unique constraint."""
    if MEMBERSHIP_CONSTRAINT in {c["name"] for c in inspect(conn).get_unique_constraints("group_memberships")}:
        return
    conn.execute(text(
        """
        DELETE FROM group_memberships
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY group_id, username ORDER BY created_at, id
                ) AS position
                FROM group_memberships
            ) ranked
            WHERE position > 1
        )
        """
    ))
    conn.execute(text(
        f"ALTER TABLE group_memberships ADD CONSTRAINT {MEMBERSHIP_CONSTRAINT} UNIQUE (group_id, username)"
    ))


def cascade_local_class_keys(conn):
    """Deleting a class must not fail on the local profile's pairing codes and students."""
    for table in CASCADE_TABLES:
        if not inspect(conn).has_table(table):
            continue
        for fk in inspect(conn).get_foreign_keys(table):
            if fk["referred_table"] != "student_groups" or (fk.get("options") or {}).get("ondelete") == "CASCADE":
                continue
            conn.execute(text(f'ALTER TABLE {table} DROP CONSTRAINT "{fk["name"]}"'))
            conn.execute(text(
                f'ALTER TABLE {table} ADD CONSTRAINT "{fk["name"]}" FOREIGN KEY (group_id) '
                "REFERENCES student_groups (id) ON DELETE CASCADE"
            ))


def constrain_goal_catalog_targets(conn):
    """Drop rows naming nobody and duplicates (oldest kept), then add check and partial unique indexes."""
    if not inspect(conn).has_table("goal_catalog_targets"):
        return
    names = {i["name"] for i in inspect(conn).get_indexes("goal_catalog_targets")}
    checks = {c["name"] for c in inspect(conn).get_check_constraints("goal_catalog_targets")}
    if TARGET_CHECK not in checks:
        conn.execute(text("DELETE FROM goal_catalog_targets WHERE group_id IS NULL AND practice_notebook_id IS NULL"))
        conn.execute(text(
            f"ALTER TABLE goal_catalog_targets ADD CONSTRAINT {TARGET_CHECK} "
            "CHECK (group_id IS NOT NULL OR practice_notebook_id IS NOT NULL)"
        ))
    if not set(TARGET_INDEXES) <= names:
        conn.execute(text(
            """
            DELETE FROM goal_catalog_targets
            WHERE id IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY catalog_id, group_id, username, practice_notebook_id ORDER BY id
                    ) AS position
                    FROM goal_catalog_targets
                ) ranked
                WHERE position > 1
            )
            """
        ))
        for name, clause in TARGET_INDEXES.items():
            conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {name} {clause}"))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_goal_catalog_targets_practice_notebook_id "
        "ON goal_catalog_targets (practice_notebook_id)"
    ))


def migrate(engine):
    if engine.dialect.name != "postgresql" or not inspect(engine).has_table("group_memberships"):
        return
    with engine.begin() as conn:
        merge_duplicate_memberships(conn)
        cascade_local_class_keys(conn)
        constrain_goal_catalog_targets(conn)
