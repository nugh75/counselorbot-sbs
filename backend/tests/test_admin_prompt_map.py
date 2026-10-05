"""Mappa dei prompt delle chat guidate, dal comune al particolare (admin).

`/admin/prompt-map?instrument=<id>` restituisce i quattro livelli (comune,
gruppi, strumento, step). Ogni testo compare una sola volta, al livello a cui
appartiene; ai livelli inferiori compare come riferimento. Il livello si
calcola dai dati (quanti strumenti e step usano la chiave) con le stesse
funzioni del runtime: questi test confrontano la mappa con quelle funzioni.

DB Postgres DEDICATO ai test (`counselorbot_test`), come gli altri.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_admin_prompt_map
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from collections import Counter
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import auth, chat_logic, database, models
from backend.ai_service import AIService
from backend.prompt_config import GLOBAL_DIRECTIVE_DEFINITIONS
from backend.routes.chat import guided_phase_text_keys

TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))


def _ensure_test_database():
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_ensure_test_database()
_engine = create_engine(_test_url)
_TestSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)

INSTRUMENTS = (
    "QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP", "IDEA",
    "EVENTO_STUDIO", "EVENTO_PROFESSIONALE", "OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA",
)
PHASE_IDS = ("questions", "conclusion")


def _client():
    import backend.main as main_module

    def _override_get_db():
        db = _TestSession()
        try:
            yield db
        finally:
            db.close()

    def _fake_admin():
        return {
            "email": "admin@example.test",
            "username": "admin",
            "name": "Admin",
            "groups": ["admins"],
            "is_admin": True,
            "is_researcher": True,
            "authenticated": True,
        }

    main_module.app.dependency_overrides[database.get_db] = _override_get_db
    main_module.app.dependency_overrides[auth.get_current_active_admin] = _fake_admin
    return TestClient(main_module.app)


def _seed_all_instruments():
    db = _TestSession()
    try:
        for questionnaire_type in INSTRUMENTS:
            chat_logic._ensure_questionnaire_guided_steps(db, questionnaire_type)
    finally:
        db.close()


def _map(client, instrument):
    response = client.get("/admin/prompt-map", params={"instrument": instrument})
    assert response.status_code == 200, response.text
    return response.json()


def _entries(prompt_map):
    """Tutte le voci della mappa con il livello in cui compaiono."""
    levels = prompt_map["levels"]
    for entry in levels["common"]:
        yield "common", entry
    for group in levels["groups"]:
        for entry in group["entries"]:
            yield "group", entry
    for entry in levels["instrument"]:
        yield "instrument", entry
    for step in levels["steps"]:
        for entry in step["entries"]:
            yield "step", entry


def _runtime_config_keys(db, instrument):
    """Chiavi di config che la chat legge per lo strumento, dalle funzioni del runtime."""
    service = AIService(db)
    keys = {d["key"] for d in GLOBAL_DIRECTIVE_DEFINITIONS}
    keys.add(chat_logic.prompt_meta_config_key(instrument))
    keys.update(key for key in guided_phase_text_keys(instrument).values() if key)
    # Fase fissa Domande: prompt per id di fase, qualunque sia il mode.
    question_key = chat_logic._resolve_system_prompt(service, "generic", "questions", db)[0]
    keys.add(question_key)
    steps = (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == instrument)
        .all()
    )
    for step in steps:
        # Ingresso nello step: phase = id, mode = mode dello step.
        entry_key = chat_logic._resolve_system_prompt(service, step.system_prompt_mode, step.id, db)[0]
        keys.add(entry_key)
        # Turno libero dello studente nello step.
        follow_up_mode = chat_logic.guided_step_follow_up_mode(step)
        follow_up_key = chat_logic._resolve_system_prompt(service, follow_up_mode, step.id, db)[0]
        keys.add(follow_up_key)
        keys.add(chat_logic.prompt_component_config_key(instrument, step.id))
        if chat_logic._instrument_meta_system_prompt(db, instrument, step.id) != \
                chat_logic._instrument_meta_system_prompt(db, instrument):
            keys.add(chat_logic.prompt_meta_config_key(instrument, step.id))
    if instrument == "IDEA":
        from backend.chat_preparation import IDEA_VARIANT_KEYS
        keys.update(IDEA_VARIANT_KEYS.values())
    return keys


def test_instruments_endpoint_lists_seeded_instruments():
    _seed_all_instruments()
    response = _client().get("/admin/prompt-map/instruments")
    assert response.status_code == 200, response.text
    listed = {item["id"]: item for item in response.json()}
    assert set(INSTRUMENTS) <= set(listed)
    assert listed["QSA"]["step_count"] > 0


def test_every_runtime_key_appears_once_at_one_level():
    _seed_all_instruments()
    client = _client()
    db = _TestSession()
    try:
        for instrument in INSTRUMENTS:
            prompt_map = _map(client, instrument)
            config_entries = [(level, e) for level, e in _entries(prompt_map) if e["kind"] == "config"]
            counts = Counter(e["key"] for _, e in config_entries)
            duplicates = [key for key, n in counts.items() if n > 1]
            assert not duplicates, (instrument, duplicates)
            # Il livello dichiarato dalla voce coincide con la sezione in cui compare.
            misplaced = [(level, e["key"], e["level"]) for level, e in config_entries if e["level"] != level]
            assert not misplaced, (instrument, misplaced)
            assert all(set(e['variants']) >= {'ristretto', 'minimo'} for _, e in config_entries if e['destination'] == 'model')
            missing = _runtime_config_keys(db, instrument) - set(counts)
            assert not missing, (instrument, sorted(missing))
    finally:
        db.close()


def test_step_fields_and_fixed_phases_are_on_the_step_level():
    _seed_all_instruments()
    prompt_map = _map(_client(), "QSA")
    steps = prompt_map["levels"]["steps"]
    ids = [step["id"] for step in steps]
    assert ids[-2:] == list(PHASE_IDS), ids
    first = steps[0]
    fields = {e["field"]: e for e in first["entries"] if e["kind"] == "guided_step"}
    assert {"label", "color_theme", "prompt"} <= set(fields)
    assert fields["label"]["destination"] == "student"
    assert fields["prompt"]["destination"] == "model"
    assert fields["prompt"]["when"] == "entry"
    assert fields["prompt"]["editor"] == {"method": "PUT", "path": f"/admin/guided-steps/{first['id']}", "field": "prompt"}


def test_qsa_factor_prompt_is_instrument_level_and_inherited_by_its_steps():
    _seed_all_instruments()
    prompt_map = _map(_client(), "QSA")
    instrument_keys = {e["key"]: e for e in prompt_map["levels"]["instrument"]}
    factor = instrument_keys["prompt_factor"]
    assert factor["destination"] == "model"
    assert len(factor["used_by"]["steps"]) >= 2
    assert "prompt_factor_qa" in instrument_keys
    assert instrument_keys["prompt_factor_qa"]["when"] == "follow_up"
    assert "prompt_meta_QSA" in instrument_keys

    factor_steps = [
        step for step in prompt_map["levels"]["steps"]
        if any(ref["key"] == "prompt_factor" for ref in step["refs"])
    ]
    assert len(factor_steps) >= 2
    for step in factor_steps:
        ref = next(ref for ref in step["refs"] if ref["key"] == "prompt_factor")
        assert ref["level"] == "instrument"
        assert ref["role"] == "system_prompt"
        assert step["follow_up_mode"] == "factor-qa"


def test_step_components_carry_runtime_flags_and_meta_override_key():
    _seed_all_instruments()
    prompt_map = _map(_client(), "EVENTO_STUDIO")
    db = _TestSession()
    try:
        for step in prompt_map["levels"]["steps"]:
            if step["fixed"]:
                continue
            components = next(e for e in step["entries"] if e["role"] == "components")
            assert components["destination"] == "context_filter"
            assert components["effective"] == chat_logic.get_prompt_component_flags(db, "EVENTO_STUDIO", step["id"])
            meta_ref = next(ref for ref in step["refs"] if ref["role"] == "meta")
            assert meta_ref["override_key"] == chat_logic.prompt_meta_config_key("EVENTO_STUDIO", step["id"])
    finally:
        db.close()


def test_shared_event_prompts_are_group_level():
    _seed_all_instruments()
    client = _client()
    for instrument in ("EVENTO_STUDIO", "EVENTO_PROFESSIONALE"):
        prompt_map = _map(client, instrument)
        groups = prompt_map["levels"]["groups"]
        group_keys = {e["key"]: (group, e) for group in groups for e in group["entries"]}
        for key in ("prompt_evento_interview", "prompt_evento_summary"):
            group, entry = group_keys[key]
            assert entry["level"] == "group"
            assert {"EVENTO_STUDIO", "EVENTO_PROFESSIONALE"} <= set(group["instruments"])
            assert {"EVENTO_STUDIO", "EVENTO_PROFESSIONALE"} <= set(entry["used_by"]["instruments"])
            assert entry["shared"] is True


def test_each_group_lists_exactly_the_instruments_that_use_its_entries():
    _seed_all_instruments()
    client = _client()
    db = _TestSession()
    try:
        runtime_keys = {i: _runtime_config_keys(db, i) for i in INSTRUMENTS}
        for instrument in ("EVENTO_STUDIO", "QSA", "IDEA"):
            groups = _map(client, instrument)["levels"]["groups"]
            sets = [frozenset(group["instruments"]) for group in groups]
            # Un riquadro per insieme di strumenti, e lo strumento scelto ne fa parte.
            assert len(sets) == len(set(sets)), (instrument, sets)
            for group in groups:
                assert instrument in group["instruments"]
                for entry in group["entries"]:
                    users = {i for i in INSTRUMENTS if entry["key"] in runtime_keys[i]}
                    assert set(group["instruments"]) == users, (instrument, entry["key"])
                    assert entry["used_by"]["instruments"] == group["instruments"]

        groups = _map(client, "EVENTO_STUDIO")["levels"]["groups"]
        event = next(g for g in groups if any(e["key"] == "prompt_evento_interview" for e in g["entries"]))
        assert event["instruments"] == ["EVENTO_STUDIO", "EVENTO_PROFESSIONALE"]
        assert {e["key"] for e in event["entries"]} >= {"prompt_evento_interview", "prompt_evento_summary"}
        # Gli step di "usato da" portano nome tradotto e tipo (fase fissa o step).
        interview = next(e for e in event["entries"] if e["key"] == "prompt_evento_interview")
        steps = interview["used_by"]["steps"]
        assert {s["instrument"] for s in steps} == {"EVENTO_STUDIO", "EVENTO_PROFESSIONALE"}
        rows = {
            (r.questionnaire_type, r.id): r
            for r in db.query(models.GuidedStep).filter(
                models.GuidedStep.questionnaire_type.in_(("EVENTO_STUDIO", "EVENTO_PROFESSIONALE"))
            )
        }
        for step in steps:
            assert step["fixed"] is False
            assert step["label_i18n"] == dict(rows[(step["instrument"], step["step_id"])].label_i18n or {})
        questions = next(
            e for g in _map(client, "QSA")["levels"]["groups"] for e in g["entries"] if e["key"] == "label_guided_questions"
        )
        assert all(s["fixed"] and s["step_id"] == "questions" for s in questions["used_by"]["steps"])
    finally:
        db.close()


def test_common_level_has_all_six_directives_and_persona():
    _seed_all_instruments()
    prompt_map = _map(_client(), "QSA")
    common = {e["key"]: e for e in prompt_map["levels"]["common"]}
    for definition in GLOBAL_DIRECTIVE_DEFINITIONS:
        entry = common[definition["key"]]
        assert entry["destination"] == "model"
        assert entry["when"] == "every_turn"
        assert entry["editor"] == {"method": "POST", "path": "/admin/config"}
    persona = common["counselor_persona"]
    assert persona["kind"] == "counselor_persona"
    assert persona["editor"]["path"] == "/admin/counselors/{id}"
    assert persona["read_only"] is True


def test_value_reflects_db_and_save_through_config_api():
    _seed_all_instruments()
    client = _client()
    db = _TestSession()
    try:
        row = db.query(models.Config).filter(models.Config.key == "prompt_meta_QSA").first()
        previous = row.value if row else None
    finally:
        db.close()
    try:
        saved = client.post("/admin/config", json={"key": "prompt_meta_QSA", "value": "META PROVA MAPPA"})
        assert saved.status_code == 200, saved.text
        instrument_keys = {e["key"]: e for e in _map(client, "QSA")["levels"]["instrument"]}
        assert instrument_keys["prompt_meta_QSA"]["value"] == "META PROVA MAPPA"
        assert instrument_keys["prompt_meta_QSA"]["stored"] is True
    finally:
        db = _TestSession()
        try:
            row = db.query(models.Config).filter(models.Config.key == "prompt_meta_QSA").first()
            if previous is None:
                if row:
                    db.delete(row)
            else:
                row.value = previous
            db.commit()
        finally:
            db.close()


def test_suggested_questions_are_editable_through_the_questions_api():
    _seed_all_instruments()
    prompt_map = _map(_client(), "QSA")
    for step in prompt_map["levels"]["steps"]:
        entries = [e for e in step["entries"] if e["kind"] == "step_questions"]
        if step["id"] == "conclusion":
            assert not entries
            continue
        (entry,) = entries
        assert entry["read_only"] is False
        # Stessa API della scheda "Domande suggerite step": nessuna seconda fonte.
        assert entry["editor"] == {
            "method": "POST", "path": "/admin/guided-step-questions", "panel": "guided-step-questions",
            "questionnaire_type": "QSA", "step_id": step["id"],
        }
        assert entry["used_by"]["steps"][0]["label"] == step["label"]


def test_context_components_come_right_after_the_step_fields():
    _seed_all_instruments()
    client = _client()
    for instrument in ("QSA", "EVENTO_STUDIO", "IDEA"):
        for step in _map(client, instrument)["levels"]["steps"]:
            if step["fixed"]:
                continue
            fields = [e.get("field") if e["kind"] == "guided_step" else e["role"] for e in step["entries"]]
            # Nome, colore, istruzione, poi il contesto; prompt, meta, note e domande dopo.
            assert fields[:4] == ["label", "color_theme", "prompt", "components"], (instrument, step["id"], fields)
            assert fields[-1] == "suggested_questions", (instrument, step["id"], fields)


def test_unknown_instrument_is_404():
    response = _client().get("/admin/prompt-map", params={"instrument": "NOPE"})
    assert response.status_code == 404


def test_follow_up_mode_mirrors_guided_chat():
    def step(mode):
        return SimpleNamespace(id="x", system_prompt_mode=mode)

    assert chat_logic.guided_step_follow_up_mode(step("factor")) == "factor-qa"
    assert chat_logic.guided_step_follow_up_mode(step("second-level")) == "factor-qa"
    assert chat_logic.guided_step_follow_up_mode(step("qsar-factor")) == "qsar-factor-qa"
    assert chat_logic.guided_step_follow_up_mode(step("evento-interview")) == "evento-interview"


if __name__ == "__main__":
    test_instruments_endpoint_lists_seeded_instruments()
    test_every_runtime_key_appears_once_at_one_level()
    test_step_fields_and_fixed_phases_are_on_the_step_level()
    test_qsa_factor_prompt_is_instrument_level_and_inherited_by_its_steps()
    test_step_components_carry_runtime_flags_and_meta_override_key()
    test_shared_event_prompts_are_group_level()
    test_common_level_has_all_six_directives_and_persona()
    test_value_reflects_db_and_save_through_config_api()
    test_unknown_instrument_is_404()
    test_follow_up_mode_mirrors_guided_chat()
    print("OK")
