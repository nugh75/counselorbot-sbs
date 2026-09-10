"""Explicit owner-only schema setup and least-privilege worker grants."""
from sqlalchemy import text
from . import storage


def provision():
    storage.init_schema()
    with storage.session_factory()() as db:
        if db.bind.dialect.name != 'postgresql':
            raise RuntimeError('Deployment requires the dedicated PostgreSQL database')
        for query in [
            'ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS raw_response TEXT',
            'GRANT USAGE ON SCHEMA public TO prompt_lab_worker',
            'GRANT SELECT ON lab_experiments, lab_runs, lab_results TO prompt_lab_worker',
            'GRANT UPDATE (state, cases, candidates, summary, error) ON lab_experiments TO prompt_lab_worker',
            'GRANT UPDATE (state, started_at, finished_at, heartbeat_at, calls, error, summary) ON lab_runs TO prompt_lab_worker',
            'GRANT INSERT ON lab_results TO prompt_lab_worker',
            'CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_result_cell ON lab_results (run_id, case_id, preset_id, variant_id, repetition)',
            """CREATE OR REPLACE FUNCTION lab_freeze_manifest() RETURNS trigger AS $$
                BEGIN IF NEW.manifest::jsonb IS DISTINCT FROM OLD.manifest::jsonb THEN
                    RAISE EXCEPTION 'A run manifest is immutable';
                END IF; RETURN NEW; END; $$ LANGUAGE plpgsql""",
            'DROP TRIGGER IF EXISTS lab_manifest_immutable ON lab_runs',
            'CREATE TRIGGER lab_manifest_immutable BEFORE UPDATE ON lab_runs FOR EACH ROW EXECUTE FUNCTION lab_freeze_manifest()',
            """CREATE OR REPLACE FUNCTION lab_freeze_snapshot() RETURNS trigger AS $$
                BEGIN IF NEW.snapshot::jsonb IS DISTINCT FROM OLD.snapshot::jsonb OR NEW.payload::jsonb IS DISTINCT FROM OLD.payload::jsonb THEN
                    RAISE EXCEPTION 'An experiment snapshot is immutable';
                END IF; RETURN NEW; END; $$ LANGUAGE plpgsql""",
            'DROP TRIGGER IF EXISTS lab_snapshot_immutable ON lab_experiments',
            'CREATE TRIGGER lab_snapshot_immutable BEFORE UPDATE ON lab_experiments FOR EACH ROW EXECUTE FUNCTION lab_freeze_snapshot()',
        ]:
            db.execute(text(query))
        db.commit()


if __name__ == '__main__':
    provision()
