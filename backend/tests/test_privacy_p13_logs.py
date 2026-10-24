"""P13: real log files, simulated detector faults, QSA and download boundaries.

All identities/documents are synthetic; no HTTP provider or production DB.
"""
import asyncio
import copy
import json
import logging

import httpx
import pytest

from backend import pii, qsa_extractor as qsa
from backend.log_privacy import RedactingFormatter, install_log_redaction
from backend.privacy.detect import GazetteerLayer, RulesLayer, SchoolContext

SECRETS = (
    "Giulia", "Bianchi", "giulia.bianchi@example.test", "+39 3471234567",
    "RSSMRA80A01H501U", "Liceo Galilei",
)
RAW = "Giulia Bianchi, giulia.bianchi@example.test, +39 3471234567, RSSMRA80A01H501U, Liceo Galilei"
SCHOOL = SchoolContext(people=("Giulia Bianchi",), institutions=("Liceo Galilei",))
SCORES = {factor: 9 for factor in qsa.EXPECTED_FACTORS}


def assert_clean(text):
    for value in SECRETS:
        assert value not in text


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setattr(pii, "_pii_redact_enabled", True)


@pytest.mark.parametrize("redact", [pii.redact, pii.redact_always])
@pytest.mark.parametrize("layer", ["legacy", "rules", "gazetteer", "replacement"])
def test_redaction_fault_never_returns_or_logs_original(monkeypatch, caplog, redact, layer):
    def broken(*args, **kwargs):
        raise RuntimeError(RAW)

    if layer == "legacy":
        monkeypatch.setattr(pii, "find_pii", broken)
    elif layer == "replacement":
        monkeypatch.setattr(pii, "_redact_spans", broken)
    else:
        monkeypatch.setattr(RulesLayer if layer == "rules" else GazetteerLayer, "detect_pii", broken)
    with caplog.at_level(logging.DEBUG):
        assert redact(RAW, school_context=SCHOOL) == pii.REDACTION_ERROR
    assert_clean(caplog.text)
    assert not caplog.records  # even the exception's own message contains PII


@pytest.mark.parametrize("redact", [pii.redact, pii.redact_always])
def test_log_gazetteer_and_extended_identifiers(redact):
    text = RAW + "; prof.ssa Giulia Bianchi; cf rssmra80a01h501u; 347 123 45 67"
    clean = redact(text, school_context=SCHOOL)
    assert_clean(clean)
    assert "rssmra80a01h501u" not in clean
    assert "347 123 45 67" not in clean
    assert redact(None) is None
    assert redact("") == ""


def test_overlap_never_exposes_a_longer_gazetteer_tail():
    # The email rules overlap the gazetteer's longer institution name.
    school = SchoolContext(institutions=("college@example.test Private Campus",))
    assert "Private Campus" not in pii.redact_always("college@example.test Private Campus", school_context=school)


def test_context_resets_after_error_and_does_not_cross_tasks():
    async def run():
        async def known():
            with pii.log_redaction_context(SCHOOL):
                await asyncio.sleep(0)
                return pii.redact("Giulia Bianchi")

        async def other():
            await asyncio.sleep(0)
            return pii.redact("Giulia Bianchi")

        return await asyncio.gather(known(), other())

    masked, other = asyncio.run(run())
    assert "Giulia" not in masked
    assert other == "Giulia Bianchi"
    with pytest.raises(RuntimeError):
        with pii.log_redaction_context(SCHOOL):
            raise RuntimeError("synthetic")
    assert pii.redact("Giulia Bianchi") == other


def test_structured_logs_redact_nested_content_without_mutating_history(monkeypatch):
    original = {"system_prompt_final": RAW, "full_message": RAW,
                "history": [{"role": "user", "content": [{"text": RAW}]}, RAW]}
    before = copy.deepcopy(original)
    assert_clean(json.dumps(pii.redact_envelope(original, school_context=SCHOOL)))
    assert original == before
    details = {"input": {"parts": [RAW]}}
    assert pii.redact_details(details, "input", school_context=SCHOOL) is details
    assert_clean(json.dumps(details))
    monkeypatch.setattr(pii, "_redact_spans", lambda *a, **k: (_ for _ in ()).throw(ValueError(RAW)))
    assert_clean(json.dumps(pii.redact_envelope(original)))
    assert_clean(json.dumps(pii.redact_details({"input": RAW}, "input")))
    assert pii.redact_envelope(RAW) == {"error": pii.REDACTION_ERROR}


@pytest.mark.parametrize("failure", [False, True])
def test_actual_log_file_is_sanitized_including_exceptions_and_extras(tmp_path, monkeypatch, failure):
    monkeypatch.setattr(pii, "_pii_redact_enabled", False)
    path = tmp_path / "application.log"
    logger = logging.getLogger("p13.file")
    handler = logging.FileHandler(path, encoding="utf-8")
    handler.setFormatter(RedactingFormatter(logging.Formatter("%(levelname)s %(message)s %(personal)s")))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    if failure:
        def broken(*args, **kwargs):
            raise ValueError(RAW)
        monkeypatch.setattr(GazetteerLayer, "detect_pii", broken)
    try:
        with pii.log_redaction_context(SCHOOL):
            logger.info("input %s", RAW, extra={"personal": RAW}, stack_info=True)
            try:
                raise ValueError(RAW)
            except ValueError:
                logger.exception("operation failed %s", RAW, extra={"personal": RAW})
        handler.flush()
        content = path.read_text()
        assert_clean(content)
        assert pii.REDACTION_ERROR in content if failure else "[email]" in content
    finally:
        logger.removeHandler(handler)
        handler.close()


def test_log_formatting_failure_and_late_handler_installation(tmp_path):
    path = tmp_path / "broken.log"
    logger = logging.getLogger("p13.late")
    handler = logging.FileHandler(path, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(missing)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        install_log_redaction()
        wrapped = handler.formatter
        install_log_redaction()
        assert handler.formatter is wrapped
        logger.info(RAW)
        handler.flush()
        assert path.read_text().strip() == pii.REDACTION_ERROR
    finally:
        logger.removeHandler(handler)
        handler.close()


@pytest.mark.parametrize("mode", ["local", "fallback", "invalid_json", "invalid_score", "provider_error", "missing"])
def test_qsa_records_never_contain_personal_data_or_scores(tmp_path, monkeypatch, caplog, mode):
    path = tmp_path / "Giulia Bianchi-profile.png"
    if mode != "missing":
        path.write_bytes(b"synthetic document")
    monkeypatch.setattr(qsa, "_encode_document_pages", lambda path: [RAW])

    def local(url, endpoint, payload, timeout):
        if mode in ("fallback", "provider_error"):
            raise RuntimeError(RAW + " C1=9")
        if endpoint == "/api/generate":
            return {"response": RAW + " C1=9"}
        content = (RAW + " C1=9") if mode == "invalid_json" else json.dumps(
            {**SCORES, "C1": RAW} if mode == "invalid_score" else {k: str(v) for k, v in SCORES.items()})
        return {"message": {"content": content}}

    def vision(prompt, image):
        if mode == "provider_error":
            raise ValueError(RAW + " C1=9")
        if mode == "invalid_json":
            return RAW + " C1=9"
        return json.dumps({**SCORES, "C1": RAW} if mode == "invalid_score" else SCORES)

    monkeypatch.setattr(qsa, "_ollama_post", local)
    with caplog.at_level(logging.DEBUG, logger=qsa.__name__):
        result = qsa.extract_qsa_data(str(path), vision_call=vision,
                                      ollama_url=RAW, ocr_model=RAW, parser_model=RAW)
    if mode in ("local", "fallback"):
        assert result == SCORES
    else:
        assert "error" in result
    records = [record for record in caplog.records if record.name == qsa.__name__]
    assert records
    for record in records:
        assert_clean(record.getMessage())
        assert not record.args
        assert record.exc_info is None
        assert not any(factor in record.getMessage() for factor in SCORES)
        assert "9" not in record.getMessage()


@pytest.mark.parametrize("data", [RAW, {"C1": RAW}, {"C1": 99}, {"C1": True}])
def test_qsa_validation_failure_logs_only_operational_event(data, caplog):
    with caplog.at_level(logging.DEBUG, logger=qsa.__name__), pytest.raises(ValueError):
        qsa._validate_scores(data)
    for record in caplog.records:
        if record.name == qsa.__name__:
            assert_clean(record.getMessage())
            assert not record.args
            assert "C1" not in record.getMessage()
            assert "99" not in record.getMessage()


@pytest.fixture
def export_app(tmp_path):
    from fastapi import FastAPI
    from sqlalchemy.orm import Session
    from backend import auth, models
    from backend.routes import admin
    from backend.tests.artifact_database import sqlite_engine

    engine = sqlite_engine(tmp_path / "export.sqlite3")
    models.Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(models.Log(username="synthetic-student", email=SECRETS[2], action="chat",
                          session_id="private-session", conversation_id="private-conversation",
                          details={"user_input": RAW, "nested": [{"text": "Giulia Bianchi"}],
                                   "scores": SCORES, "answers": ["private-answer"]}))
        db.add(models.UserDisplayName(username="synthetic-student", display_name="Giulia Bianchi"))
        db.add(models.Institution(slug="synthetic-school", name="Liceo Galilei"))
        db.commit()
        app = FastAPI()
        app.include_router(admin.router)
        app.dependency_overrides[admin.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_admin] = lambda: {"is_admin": True}
        yield app, db
    engine.dispose()


@pytest.mark.parametrize("format", ["json", "csv"])
@pytest.mark.parametrize("failure", [False, True])
def test_real_backend_export_sanitizes_historical_logs_with_flag_off(export_app, monkeypatch, format, failure):
    app, db = export_app
    monkeypatch.setattr(pii, "_pii_redact_enabled", False)
    if failure:
        def broken(*args, **kwargs):
            raise ValueError(RAW)
        monkeypatch.setattr(pii, "find_pii", broken)

    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.get("/admin/logs/export", params={"format": format})

    response = asyncio.run(request())
    assert response.status_code == (503 if failure else 200)
    assert_clean(response.text)
    for value in ("synthetic-student", "private-session", "private-conversation", "private-answer"):
        assert value not in response.text
    assert json.dumps(SCORES) not in response.text
    if not failure:
        assert "[OMESSO]" in response.text
    from backend import models
    assert db.query(models.Log).one().details["user_input"] == RAW


def test_diagnostic_boundary_rejects_unexpected_values_without_repr():
    class Personal:
        def __str__(self):
            raise RuntimeError(RAW)

    assert pii.redact_diagnostics(Personal()) == pii.REDACTION_ERROR
    assert pii.redact_always(Personal()) == pii.REDACTION_ERROR


def test_export_context_failure_blocks_download_without_exception_text(export_app, monkeypatch):
    app, db = export_app
    from backend import models
    query = db.query

    def broken(*entities, **kwargs):
        if entities[0] is models.UserDisplayName.display_name:
            raise RuntimeError(RAW)
        return query(*entities, **kwargs)

    monkeypatch.setattr(db, "query", broken)

    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.get("/admin/logs/export")

    response = asyncio.run(request())
    assert response.status_code == 503
    assert "privacy.errors.diagnosticsUnavailable" in response.text
    assert "Content-Disposition" not in response.headers
    assert_clean(response.text)
