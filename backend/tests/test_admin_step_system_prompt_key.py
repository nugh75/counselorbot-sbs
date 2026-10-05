"""Chiave del prompt di sistema degli step guidati: una sola fonte (audit B-01, NB-02).

Il pannello admin "Prompt per step" mostrava e salvava la chiave calcolata da
mappe proprie del frontend, non allineate al runtime: per gli step Obiettivo
salvava `prompt_generic`, per gli intro QPCS/QPCC/QAP il prompt di analisi.
Ora `/admin/guided-steps` restituisce la chiave risolta dalla stessa funzione
usata dalla chat, e `/admin/guided-steps/modes` la lista dei mode ammessi.

DB Postgres DEDICATO ai test (`counselorbot_test`), come gli altri.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_admin_step_system_prompt_key
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import auth, chat_logic, database, models
from backend.ai_service import AIService
from backend.prompt_config import MODE_TO_SYSTEM_PROMPT_KEY

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


def test_listed_key_matches_runtime_key_for_every_step():
    _seed_all_instruments()
    response = _client().get("/admin/guided-steps")
    assert response.status_code == 200, response.text
    steps = response.json()
    assert {step["questionnaire_type"] for step in steps} >= set(INSTRUMENTS)

    db = _TestSession()
    try:
        service = AIService(db)
        mismatches = []
        for step in steps:
            # Ingresso nello step: la chat invia phase = id e mode = mode dello step.
            runtime_key, _ = chat_logic._resolve_system_prompt(
                service, step["system_prompt_mode"], step["id"], db,
            )
            if step.get("system_prompt_key") != runtime_key:
                mismatches.append((step["id"], step.get("system_prompt_key"), runtime_key))
        assert not mismatches, mismatches
    finally:
        db.close()


def test_key_for_steps_the_old_panel_got_wrong():
    # Casi del report: Obiettivo (mode obiettivo-*), intro per id, alias storici
    # *-welcome, Idea; mode sconosciuto ripiega su prompt_generic come la chat.
    expected = {
        ("obbstudio-patto", "obiettivo-interview"): "prompt_obiettivo_interview",
        ("obbdocenza-final", "obiettivo-summary"): "prompt_obiettivo_summary",
        ("obbstudio-intro", "intro"): "prompt_obbstudio_intro",
        ("obbdocenza-intro", "intro"): "prompt_obbdocenza_intro",
        ("qpcs-intro", "qpcs-analysis"): "prompt_qpcs_welcome",
        ("qpcc-intro", "qpcc-interview"): "prompt_qpcc_welcome",
        ("qap-intro", "qap-interview"): "prompt_qap_welcome",
        ("qpcs-welcome", "qpcs-analysis"): "prompt_qpcs_welcome",
        ("idea-statement", "idea-focus"): "prompt_idea_focus",
        ("cognitive", "factor"): "prompt_factor",
        ("custom-step", "mode-inesistente"): "prompt_generic",
    }
    for (step_id, mode), key in expected.items():
        step = SimpleNamespace(id=step_id, system_prompt_mode=mode)
        assert chat_logic.guided_step_system_prompt_key(step) == key, (step_id, mode)


def test_modes_endpoint_lists_every_runtime_mode():
    response = _client().get("/admin/guided-steps/modes")
    assert response.status_code == 200, response.text
    modes = {item["mode"]: item["system_prompt_key"] for item in response.json()}
    for mode, key in MODE_TO_SYSTEM_PROMPT_KEY.items():
        assert modes.get(mode) == key, mode
    for mode in ("obiettivo-interview", "obiettivo-summary", "idea-focus"):
        assert mode in modes, mode
    # `intro` sceglie il prompt dall'id dello step, non da una chiave fissa.
    assert "intro" in modes and modes["intro"] is None


def test_saved_mode_change_returns_new_key():
    client = _client()
    step_id = "test-step-key-mode-change"
    db = _TestSession()
    try:
        db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).delete()
        db.commit()
    finally:
        db.close()
    created = client.post("/admin/guided-steps", json={
        "id": step_id, "sort_order": 99, "label": "Prova", "prompt": "istruzione",
        "system_prompt_mode": "generic", "color_theme": "blue", "questionnaire_type": "OBIETTIVO_STUDIO",
    })
    try:
        assert created.status_code == 200, created.text
        assert created.json()["system_prompt_key"] == "prompt_generic"
        updated = client.put(f"/admin/guided-steps/{step_id}", json={"system_prompt_mode": "obiettivo-summary"})
        assert updated.status_code == 200, updated.text
        assert updated.json()["system_prompt_key"] == "prompt_obiettivo_summary"
    finally:
        client.delete(f"/admin/guided-steps/{step_id}")


if __name__ == "__main__":
    test_listed_key_matches_runtime_key_for_every_step()
    test_key_for_steps_the_old_panel_got_wrong()
    test_modes_endpoint_lists_every_runtime_mode()
    test_saved_mode_change_returns_new_key()
    print("OK")
