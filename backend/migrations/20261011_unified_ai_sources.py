"""One choice per counselor between a personal API connection and a ChatGPT model (#200)."""

from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(20020261011)"))
        add_column_if_missing(connection, "personal_ai_routing", "default_chatgpt_model", "VARCHAR(200)")
        add_column_if_missing(connection, "personal_counselor_connections", "chatgpt_model", "VARCHAR(200)")
        connection.execute(text("ALTER TABLE personal_counselor_connections ALTER COLUMN connection_id DROP NOT NULL"))
        connection.execute(text("""
            DO $$ BEGIN
                ALTER TABLE personal_counselor_connections ADD CONSTRAINT personal_counselor_one_source
                    CHECK (num_nonnulls(connection_id, chatgpt_model) = 1);
            EXCEPTION WHEN duplicate_object THEN NULL; END $$"""))
        # The global ChatGPT choice becomes the default source. Saved API bindings
        # were inactive while ChatGPT was on: drop them so nothing starts billing
        # a key the person had switched off.
        active = connection.execute(text("""
            SELECT username, preferred_model FROM chatgpt_connections
            WHERE use_subscription AND preferred_model IS NOT NULL""")).all()
        for username, model in active:
            # A legacy single key (no routing yet) becomes a connection first, with
            # the id `personal_api.migrate_legacy_connections` would give it.
            connection.execute(text("""
                INSERT INTO personal_api_connections (id, username, name, provider, model_name, encrypted_key)
                SELECT left(encode(sha256(convert_to('legacy:' || username, 'UTF8')), 'hex'), 32), username,
                       provider, provider, model_name, encrypted_key
                FROM personal_api_settings s WHERE s.username = :u
                  AND NOT EXISTS (SELECT 1 FROM personal_ai_routing r WHERE r.username = s.username)
                ON CONFLICT (id) DO NOTHING"""), {"u": username})
            connection.execute(text("DELETE FROM personal_counselor_connections WHERE username = :u"), {"u": username})
            connection.execute(text("""
                INSERT INTO personal_ai_routing (username, enabled, default_connection_id, default_chatgpt_model)
                VALUES (:u, true, NULL, :m)
                ON CONFLICT (username) DO UPDATE SET enabled = true, default_connection_id = NULL, default_chatgpt_model = :m"""),
                {"u": username, "m": model})
        # Replay-safe: once moved, the legacy flag no longer selects anything.
        connection.execute(text("UPDATE chatgpt_connections SET use_subscription = false WHERE use_subscription"))
