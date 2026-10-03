"""SIWC contract tests: signed fixtures and disposable PostgreSQL data only."""
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import time
import threading
import urllib.parse
import urllib.request
import uuid
from unittest.mock import Mock

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
from jose import jwt
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend import auth, database, models, schemas
from backend import chatgpt_connections as accounts, chatgpt_responses as responses
from backend.ai_service import AIService, AIError
from backend.chatgpt_i18n import error_message
from backend.model_pricing import price_for
from backend.prompt_audit import build_prompt_audit
from backend.routes import chatgpt
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def signed(monkeypatch):
    monkeypatch.setenv("CHATGPT_ENABLED", "true")
    monkeypatch.setenv("CHATGPT_CREDENTIAL_KEY", Fernet.generate_key().decode())
    monkeypatch.delenv("CHATGPT_CREDENTIAL_KEY_FILE", raising=False)
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public = private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    monkeypatch.setattr(accounts, "_keys", lambda **kwargs: public)
    # _verify accepts PEM in tests, but its kid lookup normally reads a JWKS.
    from jose import jwk
    jwks = {"keys": [{**jwk.construct(public, "RS256").to_dict(), "kid": "fixture"}]}
    monkeypatch.setattr(accounts, "_keys", lambda **kwargs: jwks)

    def tokens(nonce, *, subject="alice-openai", client_id="issued-alice", expires=3600, **overrides):
        claims = dict(iss=accounts.ISSUER, sub=subject, iat=int(time.time()), exp=int(time.time()) + expires)
        access = dict(claims, aud=accounts.RESOURCE, client_id=client_id, scope="resource.invoke chatgpt.tokens.use.direct")
        access.update(overrides.pop("access_claims", {}))
        identity = dict(claims, aud=client_id, nonce=nonce, email=subject + "@example.test")
        identity.update(overrides.pop("identity_claims", {}))
        result = dict(access_token=jwt.encode(access, key, algorithm="RS256", headers={"kid": "fixture"}),
                      id_token=jwt.encode(identity, key, algorithm="RS256", headers={"kid": "fixture"}),
                      refresh_token="refresh-" + subject, token_type="Bearer", scope=access["scope"])
        result.update(overrides)
        return result
    return tokens


def connect(db, signed, username="alice", *, expires=3600):
    code = accounts.start_link(db, username)["pairing_code"]
    parameters = accounts.link_parameters(db, code)
    credentials = signed(parameters["nonce"], subject=username + "-openai", client_id="issued-" + username, expires=expires)
    accounts.complete_link(db, code, "issued-" + username, credentials)
    accounts.bind_identity(db, {"authenticated": True, "username": username}, "en")
    return credentials


@contextmanager
def client_for(db, username="alice", *, authenticated=True):
    app = FastAPI()
    app.include_router(chatgpt.router, prefix="/api")
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity] = lambda: {"username": username, "authenticated": authenticated}
    with TestClient(app) as client:
        yield client


def test_disabled_and_unconfigured_are_fail_closed(monkeypatch):
    monkeypatch.setenv("CHATGPT_ENABLED", "false")
    with pytest.raises(accounts.ChatGPTError, match="disabled"):
        accounts.require_ready()
    monkeypatch.setenv("CHATGPT_ENABLED", "true")
    monkeypatch.setenv("CHATGPT_CREDENTIAL_KEY", "wrong-key")
    monkeypatch.delenv("CHATGPT_CREDENTIAL_KEY_FILE", raising=False)
    with pytest.raises(accounts.ChatGPTError, match="notConfigured"):
        accounts.require_ready()


def test_pairing_is_single_use_private_encrypted_and_opt_in(signed):
    with artifact_session() as db:
        credentials = connect(db, signed)
        row = db.query(models.ChatGPTConnection).one()
        assert not row.use_subscription
        assert credentials["refresh_token"] not in row.encrypted_credentials
        assert credentials["access_token"] not in row.encrypted_credentials
        assert accounts._credentials(row)["access_token"] == credentials["access_token"]
        assert db.query(models.ChatGPTLink).count() == 0
        assert accounts.preference(db) is None
        public = json.dumps(accounts.status(db, "alice"))
        assert "token" not in public and "issued-alice" not in public
        with pytest.raises(accounts.ChatGPTError, match="model"):
            accounts.set_preference(db, "alice", True, "arbitrary-model")


@pytest.mark.parametrize("tampering", [
    {"identity_claims": {"nonce": "wrong"}}, {"identity_claims": {"aud": "wrong"}},
    {"identity_claims": {"iss": "https://evil.example"}}, {"identity_claims": {"sub": "another"}},
    {"access_claims": {"aud": "wrong"}}, {"access_claims": {"client_id": "wrong"}},
    {"scope": "openid"}, {"refresh_token": ""}, {"access_token": None},
])
def test_signed_identity_and_resource_permissions_are_verified(signed, tampering):
    with artifact_session() as db:
        code = accounts.start_link(db, "alice")["pairing_code"]
        data = signed(accounts.link_parameters(db, code)["nonce"], **tampering)
        with pytest.raises(accounts.ChatGPTError):
            accounts.complete_link(db, code, "issued-alice", data)
        assert not db.query(models.ChatGPTConnection).one().encrypted_credentials
        assert db.query(models.ChatGPTLink).count() == 1


def test_expired_renewed_and_replayed_pairing_codes(signed):
    with artifact_session() as db:
        old = accounts.start_link(db, "alice")["pairing_code"]
        current = accounts.start_link(db, "alice")["pairing_code"]
        with pytest.raises(accounts.ChatGPTError, match="linkExpired"):
            accounts.link_parameters(db, old)
        params = accounts.link_parameters(db, current)
        assert params["client_id"] == "dynamic_agent_client"
        accounts.complete_link(db, current, "issued-alice", signed(params["nonce"]))
        with pytest.raises(accounts.ChatGPTError, match="linkExpired"):
            accounts.complete_link(db, current, "issued-alice", signed(params["nonce"]))
        reconnect = accounts.start_link(db, "alice")["pairing_code"]
        assert accounts.link_parameters(db, reconnect)["client_id"] == "issued-alice"
        db.query(models.ChatGPTLink).one().expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        with pytest.raises(accounts.ChatGPTError, match="linkExpired"):
            accounts.link_parameters(db, reconnect)


def mock_http(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(accounts.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def test_accounts_catalogs_and_provider_selection_are_isolated(signed, monkeypatch):
    with artifact_session() as db:
        alice = connect(db, signed)
        bob = connect(db, signed, "bob")
        sent = []
        def handle(request):
            sent.append(request.headers["Authorization"])
            assert request.url == accounts.RESOURCE + "/models"
            return httpx.Response(200, json={"models": [
                {"slug": "gpt-account", "display_name": "Account model", "visibility": "list"},
                {"slug": "hidden", "visibility": "hidden"}]})
        mock_http(monkeypatch, handle)
        accounts.bind_identity(db, {"authenticated": True, "username": "alice"})
        assert accounts.list_models(db) == [{"slug": "gpt-account", "display_name": "Account model"}]
        accounts.set_preference(db, "alice", True, "gpt-account")
        assert sent == ["Bearer " + alice["access_token"]]
        assert accounts.status(db, "bob")["models"] == []
        assert not accounts.status(db, "bob")["use_subscription"]
        db.add(models.Config(key="ai_fallback_targets", value='[{"provider":"openai","model":"paid"}]'))
        db.commit()
        ai = AIService(db)
        assert ai._targets("ollama", "school-local") == [("openai_chatgpt", "gpt-account")]
        monkeypatch.setenv("CHATGPT_ENABLED", "false")
        assert AIService(db)._targets(None, None) == [("openai_chatgpt", "gpt-account")]
        accounts.bind_identity(db, {"authenticated": True, "username": "bob"})
        assert accounts.preference(db) is None
        monkeypatch.setenv("CHATGPT_ENABLED", "true")
        assert accounts.access_token(db) == bob["access_token"]
        assert price_for("openai_chatgpt", "gpt-4o") is None


def test_refresh_rotates_without_committing_pending_chat_writes(signed, monkeypatch):
    with artifact_session() as db:
        previous = connect(db, signed, expires=30)
        next_tokens = signed("unused", refresh_token="rotated-refresh")
        requests = []
        def handle(request):
            requests.append(request)
            assert b"rotated-refresh" not in request.content
            assert b"refresh-alice-openai" in request.content
            return httpx.Response(200, json=next_tokens)
        mock_http(monkeypatch, handle)
        pending = models.Config(key="pending-chat-write", value="not committed")
        db.add(pending)
        assert accounts.access_token(db) == next_tokens["access_token"]
        assert accounts.access_token(db) == next_tokens["access_token"]
        assert len(requests) == 1
        assert pending in db.new
        db.expire_all()
        row = db.query(models.ChatGPTConnection).one()
        assert accounts._credentials(row)["refresh_token"] == "rotated-refresh"
        assert previous["refresh_token"] not in row.encrypted_credentials


@pytest.mark.parametrize("code,status,erased", [("invalid_grant",400,True), ("refresh_token_reused",400,True),
    ("invalid_client",400,False), ("server_error",503,False)])
def test_refresh_only_erases_explicitly_invalid_grants(signed, monkeypatch, code, status, erased):
    with artifact_session() as db:
        connect(db, signed, expires=30)
        mock_http(monkeypatch, lambda request: httpx.Response(status, json={"error": code}))
        with pytest.raises(accounts.ChatGPTError, match="reconnect" if erased else "unavailable"):
            accounts.access_token(db)
        db.expire_all()
        assert bool(db.query(models.ChatGPTConnection).one().encrypted_credentials) is not erased


def test_disconnect_clears_locally_even_if_remote_revocation_fails(signed, monkeypatch):
    with artifact_session() as db:
        connect(db, signed)
        row = db.query(models.ChatGPTConnection).one()
        row.catalog = [{"slug": "model"}]; db.commit()
        accounts.set_preference(db, "alice", True, "model")
        mock_http(monkeypatch, lambda request: httpx.Response(503))
        assert accounts.disconnect(db, "alice") == {"disconnected": True, "revocation_confirmed": False}
        status = accounts.status(db, "alice")
        assert not status["connected"] and not status["use_subscription"]
        assert row.client_id == "issued-alice"
        row.use_subscription = True; row.last_error = "reconnect"; db.commit()
        accounts.disconnect(db, "alice")
        assert not accounts.status(db, "alice")["use_subscription"]


def test_auth_csrf_view_as_and_validation_never_echo_secrets(signed):
    with artifact_session() as db, client_for(db) as client:
        assert client.post("/api/user/chatgpt/link").status_code == 403
        headers = {"X-Requested-With": "CounselorBot"}
        assert client.post("/api/user/chatgpt/link", headers={**headers,"X-View-As":"studente.demo"}).status_code == 403
        code = client.post("/api/user/chatgpt/link", headers=headers).json()["pairing_code"]
        reply = client.post("/api/chatgpt/link/complete", headers={"Authorization":"Bearer " + code},
                            json={"username":"bob", "access_token":"SECRET-INPUT"})
        assert reply.status_code == 422 and "SECRET-INPUT" not in reply.text
        assert reply.headers["Cache-Control"] == "no-store"
        assert client.get("/api/chatgpt/helper").text.startswith("#!/usr/bin/env python3")
    with artifact_session() as db, client_for(db, authenticated=False) as client:
        assert client.get("/api/user/chatgpt").status_code == 401


def test_demo_and_anonymous_sessions_cannot_use_subscriptions(signed):
    with artifact_session() as db:
        connect(db, signed, "studente.demo2")
        assert accounts.owner(db) is None
        with pytest.raises(accounts.ChatGPTError, match="signIn"):
            accounts.access_token(db)
        accounts.bind_identity(db, {"username":"alice", "authenticated":False})
        assert accounts.preference(db) is None


def test_responses_transport_exact_payload_completion_usage_and_close(monkeypatch):
    calls, closes = [], []
    monkeypatch.setattr(responses, "require_ready", lambda db: None)
    monkeypatch.setattr(responses, "access_token", lambda db: "fixture-oauth")
    monkeypatch.setattr(responses, "preference", lambda db: "model")
    events = [SimpleNamespace(type="response.output_text.delta", delta="Hello"),
              SimpleNamespace(type="response.completed", response=SimpleNamespace(usage=SimpleNamespace(model_dump=lambda: {"input_tokens":10,"output_tokens":2})))]
    @contextmanager
    def create(**kwargs):
        calls.append(kwargs)
        yield iter(events)
    def client(**kwargs):
        assert kwargs["api_key"] == "fixture-oauth" and kwargs["max_retries"] == 0
        return SimpleNamespace(responses=SimpleNamespace(create=create), close=lambda: closes.append(True))
    monkeypatch.setattr(responses, "OpenAI", client)
    history = [{"role":"user","content":"Before"}, {"role":"assistant","content":"Reply"}, {"role":"system","content":"ignored"}]
    output = list(responses.stream(None, "model", "Now", "English instructions", history))
    assert output == ["Hello", {"type":"usage","usage":{"input_tokens":10,"output_tokens":2}}]
    assert calls == [responses.preview("model", "Now", "English instructions", history)["body"]]
    assert calls[0]["input"] == history[:2] + [{"role":"user","content":"Now"}]
    assert calls[0]["store"] is False and calls[0]["stream"] is True
    assert not {"temperature","max_output_tokens","previous_response_id","messages"} & calls[0].keys()
    assert closes == [True]
    events.pop()
    with pytest.raises(accounts.ChatGPTError, match="incomplete"):
        list(responses.stream(None, "model", "Now", "English instructions"))
    assert closes == [True, True]
    events[:] = [SimpleNamespace(type="response.failed", response=SimpleNamespace(error=SimpleNamespace(code="subscription_sharing_usage_limit_reached")))]
    with pytest.raises(accounts.ChatGPTError, match="quota"):
        list(responses.stream(None, "model", "Now", "English instructions"))


@pytest.mark.parametrize("language", ["it","en","es","fr","de","sv"])
def test_subscription_failure_is_localized_and_never_falls_back(signed, monkeypatch, language):
    with artifact_session() as db:
        connect(db, signed)
        row=db.query(models.ChatGPTConnection).one(); row.catalog=[{"slug":"model"}]; db.commit()
        accounts.set_preference(db,"alice",True,"model")
        accounts.bind_identity(db,{"username":"alice","authenticated":True},language)
        ai=AIService(db)
        monkeypatch.setattr(ai,"_anonymize_external",lambda provider,message,system,history:(message,system,history,{}))
        paid=Mock(side_effect=AssertionError("Paid fallback must not run"))
        ai._providers["openai"]["call"]=paid
        def failed(*args,**kwargs):
            raise accounts.ChatGPTError("quota")
            yield "unreachable"
        monkeypatch.setattr(responses,"stream",failed)
        with pytest.raises(AIError) as failure:
            ai.get_response("User", "English instructions", "generic")
        assert str(failure.value)==error_message("quota",language)
        with pytest.raises(AIError) as failure:
            list(ai.stream_response("User", "English instructions", "generic"))
        assert str(failure.value)==error_message("quota",language)
        paid.assert_not_called()


def test_prompt_audit_shows_subscription_transport_without_model_calls(signed, monkeypatch):
    with artifact_session() as db:
        connect(db,signed)
        row=db.query(models.ChatGPTConnection).one();row.catalog=[{"slug":"model"}];db.commit()
        accounts.set_preference(db,"alice",True,"model")
        monkeypatch.setattr(responses,"stream",Mock(side_effect=AssertionError("Dry run must not call OpenAI")))
        preview=build_prompt_audit(db,schemas.PromptAuditRequest(questionnaire_type="QSA",mode="generic",message="Example",include_knowledge=False))
        assert preview["resolved"]["provider"]=="openai_chatgpt"
        assert preview["transport"]==responses.preview("model",preview["envelope"]["full_message"],preview["envelope"]["system_prompt_final"],preview["envelope"]["history"])
        assert "Bearer" not in json.dumps(preview["transport"])


def test_parallel_requests_renew_a_rotating_refresh_token_only_once(signed, monkeypatch):
    with artifact_session() as isolated:
        engine = create_engine(isolated.get_bind().engine.url)
        schema = "chatgpt_lock_" + uuid.uuid4().hex
        scoped = engine.execution_options(schema_translate_map={None: schema})
        entered, release, second_started = threading.Event(), threading.Event(), threading.Event()
        calls = []
        try:
            with engine.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            models.Base.metadata.create_all(scoped, tables=[models.Config.__table__, models.ChatGPTConnection.__table__, models.ChatGPTLink.__table__])
            with Session(scoped) as setup:
                connect(setup, signed, expires=30)
            rotated = signed("unused", refresh_token="rotated-only-once")
            def handle(request):
                calls.append(request)
                entered.set()
                assert release.wait(5)
                return httpx.Response(200, json=rotated)
            mock_http(monkeypatch, handle)
            def renew(second=False):
                with Session(scoped) as session:
                    accounts.bind_identity(session, {"authenticated": True, "username": "alice"})
                    if second: second_started.set()
                    return accounts.access_token(session)
            with ThreadPoolExecutor(max_workers=2) as pool:
                first = pool.submit(renew)
                assert entered.wait(5)
                second = pool.submit(renew, True)
                try:
                    assert second_started.wait(5)
                    with pytest.raises(FutureTimeout):
                        second.result(timeout=0.2)
                finally:
                    release.set()
                assert first.result(timeout=5) == second.result(timeout=5) == rotated["access_token"]
            assert len(calls) == 1
        finally:
            release.set()
            with engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            engine.dispose()


def test_account_change_is_explicit_and_opencode_never_uses_a_paid_reserve(signed):
    from backend.routes.opencode import _require_direct_chat
    with artifact_session() as db:
        connect(db, signed)
        row = db.query(models.ChatGPTConnection).one(); row.catalog=[{"slug":"model"}]; db.commit()
        accounts.set_preference(db, "alice", True, "model")
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as failure:
            _require_direct_chat(db, {"authenticated":True,"username":"alice"}, "en")
        assert failure.value.status_code == 409
        assert failure.value.detail == error_message("unsupported", "en")
        # No need for a network revocation when the grant is already gone.
        row.encrypted_credentials = None; db.commit()
        accounts.disconnect(db, "alice", forget=True)
        assert not accounts.status(db, "alice")["registered"]
        code = accounts.start_link(db, "alice")["pairing_code"]
        assert accounts.link_parameters(db, code)["client_id"] == "dynamic_agent_client"


def load_helper():
    path = Path(__file__).resolve().parents[2] / "scripts" / "chatgpt-connect.py"
    spec = importlib.util.spec_from_file_location("chatgpt_connect", path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    return helper


@pytest.mark.parametrize("origin", ["http://remote.example", "https://u:p@server.example", "https://server.example/path", "https://server.example?token=secret", "file:///tmp/helper"])
def test_helper_rejects_insecure_or_ambiguous_server_addresses(origin):
    with pytest.raises(ValueError):
        load_helper().server_origin(origin)


def test_local_helper_pkce_loopback_binding_secure_transfer_and_no_token_output(monkeypatch, capsys):
    helper = load_helper()
    calls, callback_threads = [], []
    captured = {}
    def request_json(url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith("/parameters"):
            assert kwargs["token"] == "fixture-pairing"
            return {"client_id":"dynamic_agent_client", "nonce":"server-nonce", "host_id":"urn:uuid:fixture", "agent_name":"CounselorBot"}
        if url.endswith("/registration"):
            assert kwargs["data"] == {"client_id":"issued-alice"}
            return {"registered":True}
        if url.endswith("/oauth/token"):
            verifier=kwargs["data"]["code_verifier"]
            import base64, hashlib
            assert base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode() == captured["code_challenge"][0]
            assert kwargs["data"]["redirect_uri"] == captured["redirect_uri"][0]
            assert kwargs["data"]["client_id"] == "issued-alice"
            return {"access_token":"SECRET-ACCESS", "refresh_token":"SECRET-REFRESH", "id_token":"SECRET-ID", "token_type":"Bearer"}
        assert url == "https://own.example/api/chatgpt/link/complete"
        assert kwargs["token"] == "fixture-pairing" and kwargs["data"]["access_token"] == "SECRET-ACCESS"
        assert "username" not in kwargs["data"]
        return {"connected":True}
    def browser(url):
        assert url.startswith(helper.ISSUER + "/api/accounts/authorize?")
        captured.update(urllib.parse.parse_qs(urllib.parse.urlsplit(url).query))
        assert captured["nonce"] == ["server-nonce"] and captured["code_challenge_method"] == ["S256"]
        assert captured["agent_name_hint"] == ["CounselorBot"]
        def callback():
            try:
                urllib.request.urlopen(captured["redirect_uri"][0] + "?" + urllib.parse.urlencode({"state":"wrong","code":"untrusted"}), timeout=5)
            except urllib.error.HTTPError as error:
                assert error.code == 400
            with urllib.request.urlopen(captured["redirect_uri"][0] + "?" + urllib.parse.urlencode({
                "state":captured["state"][0], "code":"verified-code", "client_id":"issued-alice"}), timeout=5) as response:
                assert response.headers["Cache-Control"] == "no-store"
        thread=threading.Thread(target=callback); thread.start(); callback_threads.append(thread)
        return True
    monkeypatch.setattr(helper,"request_json",request_json)
    monkeypatch.setattr(helper.webbrowser,"open",browser)
    helper.connect("https://own.example", "fixture-pairing")
    for thread in callback_threads:
        thread.join(timeout=5); assert not thread.is_alive()
    output = capsys.readouterr()
    assert "SECRET" not in output.out + output.err
    assert len(calls) == 4


def test_connection_without_activation_cannot_dispatch_inference(signed, monkeypatch):
    with artifact_session() as db:
        connect(db, signed)
        transport=Mock(side_effect=AssertionError("Unselected subscription must not send requests"))
        monkeypatch.setattr(responses,"OpenAI",transport)
        with pytest.raises(accounts.ChatGPTError,match="model"):
            list(responses.stream(db,"model","User","English instructions"))
        transport.assert_not_called()


def test_server_rejection_is_remembered_but_does_not_erase_newer_credentials(signed, monkeypatch):
    with artifact_session() as db:
        previous=connect(db,signed)
        mock_http(monkeypatch,lambda request:httpx.Response(401,json={"error":{"code":"invalid_authorization_context"}}))
        with pytest.raises(accounts.ChatGPTError,match="reconnect"):
            accounts.list_models(db)
        db.expire_all()
        assert accounts.status(db,"alice")["needs_reconnect"]
        row=db.query(models.ChatGPTConnection).one()
        updated=signed("unused",expires=7200)
        row.encrypted_credentials=accounts._seal(accounts.validate_credentials(updated,"issued-alice")[0])
        row.last_error=None;db.commit()
        accounts.mark_reconnect(db,previous["access_token"])
        assert not accounts.status(db,"alice")["needs_reconnect"]


def test_refresh_respects_the_earliest_permitted_time(signed, monkeypatch):
    with artifact_session() as db:
        connect(db,signed,expires=30)
        row=db.query(models.ChatGPTConnection).one(); data=accounts._credentials(row)
        data["earliest_refresh_at"]=time.time()+20
        row.encrypted_credentials=accounts._seal(data);db.commit()
        mock_http(monkeypatch,lambda request:pytest.fail("Must not refresh before earliest_refresh_at"))
        assert accounts.access_token(db)==data["access_token"]


def test_failed_code_exchange_retains_registration_without_enabling_a_grant(signed):
    with artifact_session() as db:
        code=accounts.start_link(db,"alice")["pairing_code"]
        accounts.remember_registration(db,code,"issued-alice")
        status=accounts.status(db,"alice")
        assert status["registered"] and not status["connected"] and not status["use_subscription"]
        next_code=accounts.start_link(db,"alice")["pairing_code"]
        params=accounts.link_parameters(db,next_code)
        assert params["client_id"]=="issued-alice"
        with pytest.raises(accounts.ChatGPTError,match="invalidCredentials"):
            accounts.remember_registration(db,next_code,"other-client")
        accounts.complete_link(db,next_code,"issued-alice",signed(params["nonce"]))
        assert accounts.status(db,"alice")["connected"]
