"""Static prompt health check (#760): registry vs database, reviewed baseline, warnings on save.

Uses its own Postgres database (`counselorbot_test_prompt_health`), recreated
at import with the factory texts only, so the baseline does not depend on
what other suites leave in `counselorbot_test`. No model is called.

    python -m pytest backend/tests/test_prompt_health.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import auth, chat_logic, database, models, prompt_health, prompt_revisions
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS
from backend.prompt_registry import is_prompt_config_key

TEST_DB_NAME = "counselorbot_test_prompt_health"
_base = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_base.scheme, _base.netloc, f"/{TEST_DB_NAME}", _base.query, _base.fragment))
_admin_url = urlunsplit((_base.scheme, _base.netloc, "/postgres", _base.query, _base.fragment))

INSTRUMENTS = (
    "QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP", "IDEA",
    "EVENTO_STUDIO", "EVENTO_PROFESSIONALE", "OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA",
)

# Findings on the factory texts of today's main, reviewed in PR #760. The list
# can only shrink: fix the prompt, then remove its line.
KNOWN_BASELINE = {
    ("rule_conflict", ("code:turn_contract", "guided_step:evprof-criticita")),
    ("rule_conflict", ("code:turn_contract", "guided_step:evstudio-criticita")),
    ("number_mismatch", ("guided_step:savickas-intro",)),
}


def _recreate_database():
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)')
            cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_recreate_database()
_engine = create_engine(_test_url)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)


def _seed_factory():
    db = _Session()
    try:
        for definition in ALL_CONFIG_TEXT_DEFINITIONS:
            db.add(models.Config(key=definition["key"], value=definition.get("default") or "",
                                 description=definition.get("description")))
        db.commit()
        for instrument in INSTRUMENTS:
            chat_logic._ensure_questionnaire_guided_steps(db, instrument)
    finally:
        db.close()


_seed_factory()


class _Edit:
    """Change a prompt for one test and put the factory text back afterwards."""

    def __init__(self, db, scope, key, value, *, admin=False):
        self.db, self.scope, self.key, self.value, self.admin = db, scope, key, value, admin

    def _row(self):
        if self.scope == "config":
            return self.db.query(models.Config).filter(models.Config.key == self.key).first()
        return self.db.query(models.GuidedStep).filter(models.GuidedStep.id == self.key).first()

    def __enter__(self):
        row = self._row()
        if row is None:
            row = models.Config(key=self.key, value="")
            self.db.add(row)
            self.created = True
        else:
            self.created = False
        field = "value" if self.scope == "config" else "prompt"
        self.before = getattr(row, field)
        setattr(row, field, self.value)
        if self.admin:
            prompt_revisions.record(self.db, self.scope, self.key, self.value, prompt_revisions.ORIGIN_ADMIN, author="admin")
        self.db.commit()
        return self

    def __exit__(self, *exc):
        self.db.rollback()
        row = self._row()
        if self.created:
            self.db.delete(row)
        else:
            setattr(row, "value" if self.scope == "config" else "prompt", self.before)
        self.db.query(models.PromptRevision).filter(models.PromptRevision.target_key == self.key).delete()
        self.db.commit()


def _codes(findings):
    return {(f["code"], tuple(f["prompts"])) for f in findings}


def test_factory_database_has_only_registered_prompts():
    db = _Session()
    try:
        texts = prompt_health.active_texts(db)
        assert any(pid.startswith("guided_step:") for pid in texts)
        keys = [row.key for row in db.query(models.Config).all() if is_prompt_config_key(row.key)]
        assert keys and all(f"config:{k}" in texts for k in keys)
        assert prompt_health._registration_findings(texts) == []
    finally:
        db.close()


def test_baseline_of_factory_texts_matches_the_reviewed_list():
    db = _Session()
    try:
        findings = prompt_health.compute_findings(db)
    finally:
        db.close()
    assert _codes(findings) == KNOWN_BASELINE, sorted(_codes(findings))
    conflict = next(f for f in findings if f["code"] == "rule_conflict")
    assert len(conflict["sentences"]) == 2 and all(s["text"] for s in conflict["sentences"])
    assert conflict["surfaces"], "a conflict names the turns where it happens"


def test_run_is_stored_by_text_hash_and_reused():
    db = _Session()
    try:
        first, _ = prompt_health.run_check(db, trigger="manual")
        again, previous = prompt_health.run_check(db, trigger="manual")
        assert again.id == first.id and previous.id == first.id
        assert first.counts["total"] == len(first.findings)
        with _Edit(db, "config", "prompt_custom_unregistered", "Say hello."):
            changed, previous = prompt_health.run_check(db, trigger="save")
            assert changed.id != first.id and changed.texts_hash != first.texts_hash
            fresh = prompt_health.new_findings(changed, previous, "config:prompt_custom_unregistered")
            assert _codes(fresh) == {("unregistered_prompt", ("config:prompt_custom_unregistered",))}
    finally:
        db.close()


def test_dynamic_keys_are_registered_by_family():
    db = _Session()
    try:
        with _Edit(db, "config", "rag_chat_context_custom", "Context of a custom collection."), \
                _Edit(db, "config", "prompt_meta_QSA_sl-social__level_compact", "Short theory."), \
                _Edit(db, "config", "prompt_components_QSA_intro", "{}"):
            assert prompt_health._registration_findings(prompt_health.active_texts(db)) == []
    finally:
        db.close()


def test_prompts_that_never_arrive():
    db = _Session()
    try:
        with _Edit(db, "guided_step", "sl-social", ""):
            assert ("step_without_prompt", ("guided_step:sl-social",)) in _codes(prompt_health.check_prompt(db, "guided_step:sl-social"))
        with _Edit(db, "config", "directive_affirmative", ""):
            assert ("empty_prompt", ("config:directive_affirmative",)) in _codes(prompt_health.check_prompt(db, "config:directive_affirmative"))
        # Different from the factory and not marked as customised by an admin.
        with _Edit(db, "config", "prompt_meta_QSA", "Old theory text."):
            assert ("unmarked_difference", ("config:prompt_meta_QSA",)) in _codes(prompt_health.check_prompt(db, "config:prompt_meta_QSA"))
        # Customised by an admin: no drift warning, but the declared rules can no longer be verified.
        with _Edit(db, "config", "prompt_qpcc_summary", "Write a short summary.", admin=True):
            codes = _codes(prompt_health.check_prompt(db, "config:prompt_qpcc_summary"))
            assert ("rules_unverified", ("config:prompt_qpcc_summary",)) in codes
            assert not any(code == "unmarked_difference" for code, _ in codes)
    finally:
        db.close()


def test_wrong_references_in_a_customised_text():
    db = _Session()
    try:
        text = "Read C1 and C9 together, greet {student_name} and go back to sl-nonexistent."
        with _Edit(db, "guided_step", "sl-elaboration", text, admin=True):
            findings = prompt_health.check_prompt(db, "guided_step:sl-elaboration")
            by_code = {f["code"]: f for f in findings}
            assert by_code["unknown_placeholder"]["params"]["names"] == ["student_name"]
            assert by_code["unknown_factor"]["params"]["codes"] == ["C9"]
            assert by_code["unknown_step"]["params"]["steps"] == ["sl-nonexistent"]
    finally:
        db.close()


def test_conflict_shows_both_sentences_side_by_side():
    db = _Session()
    try:
        text = "Read C1 with the student. Close by asking exactly THREE open questions about study habits."
        with _Edit(db, "guided_step", "sl-elaboration", text, admin=True):
            findings = prompt_health.check_prompt(db, "guided_step:sl-elaboration")
        conflict = next(f for f in findings if f["code"] == "rule_conflict")
        assert conflict["params"]["field"] == "questions"
        sentences = {s["prompt"]: s["text"] for s in conflict["sentences"]}
        assert sentences["guided_step:sl-elaboration"] == "exactly THREE open questions"
        assert "code:turn_contract" in sentences
        assert any("sl-elaboration" in surface for surface in conflict["surfaces"])
    finally:
        db.close()


def _client():
    import backend.main as main_module
    from backend.routes import prompt_health as routes

    def _override_get_db():
        db = _Session()
        try:
            yield db
        finally:
            db.close()

    def _fake_admin():
        return {"email": "admin@example.test", "username": "admin", "name": "Admin", "groups": ["admins"],
                "is_admin": True, "is_researcher": True, "authenticated": True}

    def _rerun():
        db = _Session()
        try:
            prompt_health.run_check(db, trigger="save")
        finally:
            db.close()

    routes._rerun_after_save = _rerun
    main_module.app.dependency_overrides[database.get_db] = _override_get_db
    main_module.app.dependency_overrides[auth.get_current_active_admin] = _fake_admin
    return TestClient(main_module.app)


def test_admin_api_lists_findings_and_never_blocks_a_save():
    client = _client()
    response = client.post("/admin/prompt-health/run")
    assert response.status_code == 200, response.text
    run = response.json()["run"]
    assert run["counts"]["total"] == len(run["findings"]) and run["current"] is True
    assert client.get("/admin/prompt-health").json()["run"]["id"] == run["id"]

    db = _Session()
    original = db.query(models.Config).filter(models.Config.key == "prompt_meta_QSA").first().value
    db.close()
    try:
        # Saving a prompt with a problem is accepted: the check only warns.
        saved = client.post("/admin/config", json={"key": "prompt_meta_QSA", "value": "Greet {student_name}.", "description": ""})
        assert saved.status_code == 200, saved.text
        assert client.get("/admin/prompt-health").json()["run"]["current"] is False
        checked = client.post("/admin/prompt-health/check-prompt", json={"prompt_id": "config:prompt_meta_QSA"})
        assert checked.status_code == 200, checked.text
        assert "unknown_placeholder" in {f["code"] for f in checked.json()["new"]}
        # The background run refreshed the stored result for the saved text.
        assert client.get("/admin/prompt-health").json()["run"]["current"] is True
        assert client.post("/admin/prompt-health/check-prompt", json={"prompt_id": "nope"}).status_code == 422
    finally:
        client.post("/admin/config", json={"key": "prompt_meta_QSA", "value": original, "description": ""})
        db = _Session()
        db.query(models.PromptRevision).filter(models.PromptRevision.target_key == "prompt_meta_QSA").delete()
        db.commit()
        db.close()



# --- Phase 2 (#761): positions, draft evaluation, acknowledgements, restore -------

def test_findings_carry_the_exact_position_of_each_sentence():
    db = _Session()
    try:
        text = "Read C1 with the student. Close by asking exactly THREE open questions about study habits."
        with _Edit(db, "guided_step", "sl-elaboration", text, admin=True):
            findings = prompt_health.check_prompt(db, "guided_step:sl-elaboration")
    finally:
        db.close()
    conflict = next(f for f in findings if f["code"] == "rule_conflict")
    own = next(s for s in conflict["sentences"] if s["prompt"] == "guided_step:sl-elaboration")
    assert text[own["start"]:own["end"]] == "exactly THREE open questions"
    contract = next(s for s in conflict["sentences"] if s["prompt"] == "code:turn_contract")
    assert contract["start"] is None, "code prompts have no editable text"
    assert conflict["editable"] == ["guided_step:sl-elaboration"]


def test_token_findings_point_at_the_wrong_tokens():
    db = _Session()
    try:
        text = "Read C1 and C9 together, greet {student_name}."
        with _Edit(db, "guided_step", "sl-elaboration", text, admin=True):
            by_code = {f["code"]: f for f in prompt_health.check_prompt(db, "guided_step:sl-elaboration")}
    finally:
        db.close()
    factor = by_code["unknown_factor"]["sentences"][0]
    assert text[factor["start"]:factor["end"]] == "C9"
    placeholder = by_code["unknown_placeholder"]["sentences"][0]
    assert text[placeholder["start"]:placeholder["end"]] == "{student_name}"


def test_draft_is_evaluated_without_saving_and_highlights_follow_the_draft():
    db = _Session()
    original = db.query(models.GuidedStep).filter(models.GuidedStep.id == "sl-elaboration").first().prompt
    revisions = db.query(models.PromptRevision).count()
    try:
        draft = "Read C1 with the student.\nClose by asking exactly THREE open questions."
        result = prompt_health.evaluate(db, drafts={"guided_step:sl-elaboration": draft},
                                        surface="QSA · sl-elaboration · entry")
        conflict = next(f for f in result["findings"] if f["code"] == "rule_conflict")
        own = next(s for s in conflict["sentences"] if s["prompt"] == "guided_step:sl-elaboration")
        assert draft[own["start"]:own["end"]] == "exactly THREE open questions"
        assert "exactly THREE open questions" in result["assembled"], "the turn is assembled with the draft"
        # A draft is never an unmarked difference: saving it makes it the admin's text.
        assert not any(f["code"] == "unmarked_difference" for f in result["findings"])
        # The factory text of the same prompt has no conflict on that turn.
        clean = prompt_health.evaluate(db, prompt_ids=["guided_step:sl-elaboration"], surface="QSA · sl-elaboration · entry")
        assert not any(f["code"] == "rule_conflict" for f in clean["findings"])
    finally:
        db.close()
    db = _Session()
    try:
        assert db.query(models.GuidedStep).filter(models.GuidedStep.id == "sl-elaboration").first().prompt == original
        assert db.query(models.PromptRevision).count() == revisions, "evaluation never writes"
    finally:
        db.close()


def test_turn_map_lists_steps_with_their_prompts_and_turns():
    db = _Session()
    try:
        paths = prompt_health.turn_map(db)
    finally:
        db.close()
    qsa = next(p for p in paths if p["instrument"] == "QSA")
    step = next(s for s in qsa["steps"] if s["id"] == "sl-elaboration")
    assert "guided_step:sl-elaboration" in step["prompts"]
    assert step["surfaces"] == ["QSA · sl-elaboration · entry", "QSA · sl-elaboration · follow_up",
                                "QSA · sl-elaboration · advice"]


def test_admin_api_compare_actions():
    client = _client()
    run = client.post("/admin/prompt-health/run").json()["run"]
    finding = run["findings"][0]
    total = run["counts"]["total"]

    # Mark as intended: excluded from the counter, note kept, can be undone.
    acked = client.post("/admin/prompt-health/acks", json={"finding_id": finding["id"], "note": "Voluto: il contratto prevale."})
    assert acked.status_code == 200, acked.text
    latest = client.get("/admin/prompt-health").json()["run"]
    assert latest["counts"]["total"] == total - 1 and latest["counts"]["acknowledged"] == 1
    marked = next(f for f in latest["findings"] if f["id"] == finding["id"])
    assert marked["ack"]["note"] == "Voluto: il contratto prevale."
    assert client.delete(f"/admin/prompt-health/acks/{finding['id']}").status_code == 200
    assert client.get("/admin/prompt-health").json()["run"]["counts"]["total"] == total

    # Prompt card: text, factory text, findings, turns where it arrives.
    card = client.get("/admin/prompt-health/prompt", params={"id": "guided_step:savickas-intro"}).json()
    assert card["text"] == card["factory"] and card["differs_from_factory"] is False
    assert any(f["code"] == "number_mismatch" for f in card["findings"])
    assert card["surfaces"] and card["editable"] is True

    # Draft evaluation, save (warn only) and restore of the factory text.
    draft = "Greet {student_name}."
    evaluated = client.post("/admin/prompt-health/evaluate", json={"drafts": {"config:prompt_meta_QSA": draft}})
    assert evaluated.status_code == 200, evaluated.text
    assert "unknown_placeholder" in {f["code"] for f in evaluated.json()["findings"]}
    saved = client.post("/admin/prompt-health/save", json={"prompt_id": "config:prompt_meta_QSA", "text": draft})
    assert saved.status_code == 200, saved.text
    assert "unknown_placeholder" in {f["code"] for f in saved.json()["findings"]}
    assert client.get("/admin/prompt-health/prompt", params={"id": "config:prompt_meta_QSA"}).json()["text"] == draft
    restored = client.post("/admin/prompt-health/restore-factory", json={"prompt_id": "config:prompt_meta_QSA"})
    assert restored.status_code == 200, restored.text
    card = client.get("/admin/prompt-health/prompt", params={"id": "config:prompt_meta_QSA"}).json()
    assert card["text"] == card["factory"] and card["customised"] is False
    assert client.post("/admin/prompt-health/save", json={"prompt_id": "code:turn_contract", "text": "x"}).status_code == 422
    assert client.get("/admin/prompt-health/map").json()["paths"]
    db = _Session()
    db.query(models.PromptRevision).filter(models.PromptRevision.target_key == "prompt_meta_QSA").delete()
    db.commit()
    db.close()


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
