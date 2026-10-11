"""#200: one choice per counselor between a personal API connection and a ChatGPT model."""
import hashlib
import os
import uuid
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError

from backend import models, personal_api
from backend import chatgpt_connections as accounts
from backend.ai_service import AIService
from backend.tests.test_personal_api import db, client, identity  # noqa: F401
from backend.tests.test_chatgpt_subscription import connect, signed  # noqa: F401

migration = import_module("backend.migrations.20261011_unified_ai_sources")
reasoning_migration = import_module("backend.migrations.20261011_reasoning_levels")


@pytest.fixture
def chatgpt(db, signed):
    connect(db, signed)
    row = db.query(models.ChatGPTConnection).one()
    row.catalog = [{"slug": "fixture-model", "display_name": "Fixture"}]
    db.add_all([models.Counselor(id=10, name="One", slug="one", is_active=True),
                models.Counselor(id=11, name="Two", slug="two", is_active=True)])
    db.commit()
    return row


def api_connection(client):
    response = client.post("/user/api-connections", json=dict(name="Mine", provider="openai", model="own-model", api_key="fake-test-key"))
    assert response.status_code == 200, response.text
    return response.json()["connections"][0]["id"]


def route(client, **values):
    return client.put("/user/api-routing", json={"enabled": True, "bindings": [], **values})


def targets(db, counselor_id):
    personal_api.bind_counselor(db, counselor_id)
    return AIService(db)._targets("ollama", "institution-model")


def test_each_counselor_uses_its_own_source(client, db, chatgpt):
    cid = api_connection(client)
    response = route(client, default_connection_id=cid, bindings=[{"counselor_id": 11, "chatgpt_model": "fixture-model"}])
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["chatgpt_models"] == [{"slug": "fixture-model", "display_name": "Fixture", "reasoning_levels": []}]
    assert {"counselor_id": 11, "connection_id": None, "chatgpt_model": "fixture-model", "reasoning": None} in state["bindings"]
    assert targets(db, 10) == [("openai", "own-model")]
    assert targets(db, 11) == [("openai_chatgpt", "fixture-model")]
    assert accounts.status(db, "alice")["use_subscription"] is True


def test_chatgpt_default_with_an_api_counselor(client, db, chatgpt):
    cid = api_connection(client)
    assert route(client, default_chatgpt_model="fixture-model", bindings=[{"counselor_id": 10, "connection_id": cid}]).status_code == 200
    assert targets(db, 10) == [("openai", "own-model")]
    assert targets(db, 11) == [("openai_chatgpt", "fixture-model")]


def test_invalid_choices_are_refused(client, db, chatgpt):
    cid = api_connection(client)
    assert route(client, default_chatgpt_model="not-in-catalog").json()["detail"] == "chatgpt.errors.model"
    both = route(client, bindings=[{"counselor_id": 10, "connection_id": cid, "chatgpt_model": "fixture-model"}])
    assert both.status_code == 422
    assert route(client, default_connection_id=cid, default_chatgpt_model="fixture-model").status_code == 422


def test_chatgpt_only_installation_can_route(client, db, chatgpt):
    db.query(models.Config).filter_by(key=personal_api.POLICY_KEY).update({"value": "false"})
    db.commit()
    state = client.get("/user/api-connections").json()
    assert state["available"] and not state["api_enabled"] and state["chatgpt_enabled"]
    assert route(client, bindings=[{"counselor_id": 11, "chatgpt_model": "fixture-model"}]).status_code == 200
    assert targets(db, 10) == [("ollama", "institution-model")]
    assert targets(db, 11) == [("openai_chatgpt", "fixture-model")]


def test_panel_switch_and_disconnect_keep_api_choices(client, db, chatgpt):
    cid = api_connection(client)
    assert route(client, default_connection_id=cid).status_code == 200
    accounts.set_preference(db, "alice", True, "fixture-model")
    assert targets(db, 10) == [("openai_chatgpt", "fixture-model")]
    assert route(client, default_chatgpt_model="fixture-model", bindings=[{"counselor_id": 10, "connection_id": cid}]).status_code == 200
    accounts.disconnect(db, "alice")
    # ChatGPT is gone; the API counselor keeps working, the rest returns to the institution.
    assert targets(db, 10) == [("openai", "own-model")]
    assert targets(db, 11) == [("ollama", "institution-model")]
    assert accounts.status(db, "alice")["use_subscription"] is False


@pytest.fixture
def scratch_engine():
    # Never run against an operational database.
    assert os.environ["DATABASE_URL"].rsplit("/", 1)[-1].endswith("_test")
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "ai200_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
        # The schema before #200.
        connection.execute(text("ALTER TABLE personal_ai_routing DROP COLUMN default_chatgpt_model"))
        connection.execute(text("ALTER TABLE personal_counselor_connections DROP COLUMN chatgpt_model"))
        connection.execute(text("ALTER TABLE personal_counselor_connections ALTER COLUMN connection_id SET NOT NULL"))
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def test_migration_moves_the_global_chatgpt_choice(scratch_engine):
    with scratch_engine.begin() as connection:
        connection.execute(text("""INSERT INTO chatgpt_connections (username, use_subscription, preferred_model) VALUES
            ('alice', true, 'fixture-model'), ('bob', false, 'other-model')"""))
        connection.execute(text("""INSERT INTO personal_api_settings (username, provider, model_name, encrypted_key, enabled)
            VALUES ('alice', 'openai', 'own-model', 'sealed', false)"""))
    migration.migrate(scratch_engine)
    migration.migrate(scratch_engine)  # Replay-safe.
    with scratch_engine.begin() as connection:
        assert connection.execute(text("SELECT username, enabled, default_connection_id, default_chatgpt_model FROM personal_ai_routing")).all() \
            == [("alice", True, None, "fixture-model")]
        legacy = hashlib.sha256(b"legacy:alice").hexdigest()[:32]
        assert connection.execute(text("SELECT id, encrypted_key FROM personal_api_connections")).all() == [(legacy, "sealed")]
        assert connection.execute(text("SELECT count(*) FROM chatgpt_connections WHERE use_subscription")).scalar() == 0
        # The check runs before the counselor foreign key, so no counselor is needed.
        with pytest.raises(IntegrityError, match="personal_counselor_one_source"):
            with connection.begin_nested():
                connection.execute(text("INSERT INTO personal_counselor_connections (username, counselor_id) VALUES ('alice', 10)"))


# #202: reasoning level per source.

def test_reasoning_level_reaches_the_api_plan_over_the_preset(client, db, chatgpt):
    cid = api_connection(client)
    response = route(client, default_connection_id=cid, bindings=[{"counselor_id": 10, "connection_id": cid, "reasoning": "none"}])
    assert response.status_code == 200, response.text
    assert response.json()["bindings"][0]["reasoning"] == "none"
    personal_api.bind_counselor(db, 10)
    service = AIService(db)
    service.disable_thinking = False  # The counselor preset applies after creation.
    service.reasoning_budget_override = 999
    assert service.disable_thinking is True
    assert route(client, default_connection_id=cid, default_reasoning="high").status_code == 200
    personal_api.bind_counselor(db, 11)
    service = AIService(db)
    service.reasoning_budget_override = 999
    assert service.disable_thinking is False and service.reasoning_budget_override == 12000
    # Without a personal source the preset keeps working.
    assert route(client, enabled=False).status_code == 200
    service = AIService(db)
    service.reasoning_budget_override = 999
    assert service.personal_reasoning is None and service.reasoning_budget_override == 999


def test_chatgpt_effort_is_sent_and_dropped_when_refused(client, db, chatgpt, monkeypatch):
    from openai import APIStatusError
    import httpx
    from backend import chatgpt_responses
    chatgpt.catalog = [{"slug": "fixture-model", "display_name": "Fixture", "reasoning_levels": ["low", "high"]}]
    db.commit()
    assert route(client, default_chatgpt_model="fixture-model", default_reasoning="medium").status_code == 422
    assert route(client, default_chatgpt_model="fixture-model", default_reasoning="high").status_code == 200
    assert route(client, default_reasoning="high").status_code == 422  # A level needs a source.
    sent = []

    class Events:
        def __init__(self, body):
            self.body = body

        def __enter__(self):
            sent.append(self.body)
            if "reasoning" in self.body:
                raise APIStatusError("unsupported", response=httpx.Response(400, request=httpx.Request("POST", "https://x")), body=None)
            return iter([type("E", (), {"type": "response.output_text.delta", "delta": "ok"})(),
                         type("E", (), {"type": "response.completed", "response": None})()])

        def __exit__(self, *args):
            return False

    class Client:
        def __init__(self, **kwargs):
            self.responses = type("R", (), {"create": staticmethod(lambda **body: Events(body))})()

        def close(self):
            pass

    monkeypatch.setattr(chatgpt_responses, "OpenAI", Client)
    personal_api.bind_counselor(db, 10)
    service = AIService(db)
    assert service.personal_reasoning == "high"
    assert "".join(service._stream_chatgpt("hi", "instructions", "fixture-model")) == "ok"
    assert sent[0]["reasoning"] == {"effort": "high"} and "reasoning" not in sent[1]
    assert chatgpt_responses.preview("fixture-model", "hi", "i", effort="high")["body"]["reasoning"] == {"effort": "high"}


def test_catalog_keeps_only_known_levels():
    assert accounts._reasoning_levels({"supported_reasoning_levels": [{"effort": "high"}, {"effort": "turbo"}, "low"]}) == ["low", "high"]
    assert accounts._reasoning_levels({}) == []


def test_reasoning_migration_limits_the_levels(scratch_engine):
    reasoning_migration.migrate(scratch_engine)
    reasoning_migration.migrate(scratch_engine)  # Replay-safe.
    with scratch_engine.begin() as connection:
        connection.execute(text("INSERT INTO personal_ai_routing (username, enabled, default_reasoning) VALUES ('alice', false, 'high')"))
        with pytest.raises(IntegrityError, match="personal_routing_reasoning_level"):
            with connection.begin_nested():
                connection.execute(text("UPDATE personal_ai_routing SET default_reasoning = 'turbo'"))
