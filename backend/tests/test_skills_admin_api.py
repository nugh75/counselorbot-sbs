"""API admin delle skill: validazione, skill di serie protette, catalogo, preview.

DB SQLite in memoria, solo il router delle skill: niente Postgres. La preview
passa da `prepare_chat_turn` come la chat; il RAG e' spento dai flag dello
step di prova e il router LLM non serve (una sola skill candidata).
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models
from backend.routes import skills as skills_routes
from backend.skills_seed import BUILTIN_SKILL_SLUGS, seed_skills

_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
database.Base.metadata.create_all(bind=_engine)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


def _get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


_app = FastAPI()
_app.include_router(skills_routes.router)
_app.dependency_overrides[skills_routes.get_db] = _get_db
_app.dependency_overrides[auth.get_current_active_admin] = lambda: object()
client = TestClient(_app)

_db = _Session()
seed_skills(_db)
for _key, _value in (("skills_engine_enabled", "true"), ("skills_engine_instruments", '["QSA"]')):
    _db.merge(models.Config(key=_key, value=_value))
_db.commit()
_db.close()


def _by_slug():
    return {skill["slug"]: skill for skill in client.get("/admin/skills").json()}


def _create(slug, **fields):
    body = {"slug": slug, "name": slug, "routing": "always", "slot": "directive_tail", **fields}
    return client.post("/admin/skills", json=body)


def test_list_marks_builtin_skills():
    skills = _by_slug()
    assert {slug for slug, skill in skills.items() if skill["builtin"]} == set(BUILTIN_SKILL_SLUGS)


def test_rename_to_existing_slug_is_a_conflict():
    custom = _create("custom-rename").json()
    response = client.put(f"/admin/skills/{custom['id']}", json={"slug": "reading-guide"})
    assert response.status_code == 409, response.text


def test_builtin_slug_cannot_change():
    builtin = _by_slug()["web-lookup"]
    response = client.put(f"/admin/skills/{builtin['id']}", json={"slug": "web-lookup-2"})
    assert response.status_code == 400, response.text


def test_builtin_skill_cannot_be_deleted_but_can_be_switched_off():
    builtin = _by_slug()["concept-diagram"]
    assert client.delete(f"/admin/skills/{builtin['id']}").status_code == 409
    response = client.put(f"/admin/skills/{builtin['id']}", json={"is_active": False})
    assert response.status_code == 200 and response.json()["is_active"] is False
    client.put(f"/admin/skills/{builtin['id']}", json={"is_active": True})


def test_custom_skill_can_be_deleted():
    custom = _create("custom-delete").json()
    assert client.delete(f"/admin/skills/{custom['id']}").status_code == 200


def test_conditions_are_validated_on_save():
    assert _create("bad-key", conditions={"intent": ["advice"]}).status_code == 400
    assert _create("bad-intent", conditions={"intents": ["advise"]}).status_code == 400
    assert _create("bad-type", conditions={"step_ids": "qsa-1"}).status_code == 400
    assert _create("good", conditions={"intents": ["advice"], "requires_scores": True}).status_code == 200


def test_catalog_lists_what_the_wizard_needs():
    catalog = client.get("/admin/skills/catalog").json()
    summaries = {handler["name"]: handler["summary"] for handler in catalog["handlers"]}
    for name in ("certified_strategies", "reading_sources", "web_lookup_sources", "orientation_referrals"):
        assert summaries[name], name
    assert "intents" in catalog["condition_keys"]
    assert "advice" in catalog["intents"]
    engine = {item["code"]: item["engine_enabled"] for item in catalog["instruments"]}
    assert engine["QSA"] is True and engine["IDEA"] is False


def test_preview_runs_a_draft_skill_and_reports_delivery():
    draft = _create(
        "draft-preview", status="draft",
        instructions_i18n={"en": "## Draft preview marker\nSay hello."},
    ).json()
    response = client.post("/admin/skills/preview", json={
        "questionnaire_type": "QSA", "message": "ciao", "language": "en",
        "include_skill_id": draft["id"],
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["engine_enabled"] is True
    assert {"slug": "draft-preview", "slot": "directive_tail", "chars": len("## Draft preview marker\nSay hello."),
            "in_prompt": True} in data["delivery"]
    assert "knowledge" in data["component_flags"]

    # Senza include_skill_id la bozza non entra: e' la regola della chat.
    plain = client.post("/admin/skills/preview", json={"questionnaire_type": "QSA", "message": "ciao"}).json()
    assert all(entry["slug"] != "draft-preview" for entry in plain["delivery"])


def test_preview_simulates_the_engine_where_it_is_off():
    response = client.post("/admin/skills/preview", json={
        "questionnaire_type": "QPCS", "message": "Non capisco cosa significa questo risultato",
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["engine_enabled"] is False
    assert data["intent"] == "clarify"
    assert any(entry["slug"] == "profile-wayfinder" for entry in data["delivery"])
