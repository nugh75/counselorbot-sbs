"""Ripiego OCR QSA via AIService: provider vision configurabile e filtro privacy.

Nessuna chiamata di rete: il client del provider e' finto e ogni trasporto HTTP
e' vietato. Verifica il contratto del compito:
- il ripiego passa da `AIService.call_vision` e applica `_anonymize_external`;
- senza provider vision l'esito e' un errore chiaro (codice + messaggio localizzato);
- nessun modello/endpoint e' cablato nel modulo di estrazione.
"""

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend import models, pii_ner, qsa_extractor as qsa, vision_service
from backend.ai_service import AIService
from backend.api_secrets import API_KEY_ENV_MAP

QSA_SCORES = {f"C{i}": (i % 9) + 1 for i in range(1, 8)}
QSA_SCORES.update({f"A{i}": (i % 9) + 1 for i in range(1, 8)})


@pytest.fixture
def db(monkeypatch):
    for names in API_KEY_ENV_MAP.values():
        for name in names:
            monkeypatch.delenv(name, raising=False)
    engine = create_engine("sqlite:///:memory:")
    models.Config.__table__.create(engine)
    models.Log.__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Real HTTP transport forbidden")

    monkeypatch.setattr(httpx.Client, "send", forbidden)
    monkeypatch.setattr(httpx, "post", forbidden)


def service(db, **config):
    for key, value in config.items():
        db.merge(models.Config(key=key, value=str(value)))
    db.commit()
    # Esercita il vero caricamento config evitando le tabelle non necessarie.
    ai = AIService.__new__(AIService)
    ai.db = db
    ai.config = ai._load_config()
    ai.personal_error = None
    ai.personal_error_code = "personalAPI.errors.configuration"
    ai.external_pii_redact = str(ai.config.get("external_pii_redact", "true")).lower() not in (
        "0", "false", "no", "off")
    ai.external_pii_fallback = (ai.config.get("external_pii_fallback") or "block").strip().lower()
    ai.last_provider = ai.last_model = None
    return ai


def forced_fallback(monkeypatch, tmp_path):
    """Rende Ollama irraggiungibile: l'estrazione deve usare il ripiego."""
    def ollama_down(*args, **kwargs):
        raise RuntimeError("Ollama non raggiungibile (test)")

    monkeypatch.setattr(qsa, "_run_ocr", ollama_down)
    monkeypatch.setattr(qsa, "_encode_document_pages", lambda path: ["ZmFrZS1pbWFnZQ=="])
    path = tmp_path / "profile.png"
    path.write_bytes(b"fake")
    return str(path)


def fake_provider(monkeypatch, scores=None, content=None):
    client = Mock()
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(
            content=json.dumps(scores if scores is not None else QSA_SCORES) if content is None else content))]
    )
    constructor = Mock(return_value=client)
    monkeypatch.setattr(vision_service, "OpenAI", constructor)
    return constructor, client


def test_fallback_routes_through_aiservice_and_applies_privacy_filter(db, monkeypatch, tmp_path):
    ai = service(db, vision_provider="openrouter", vision_model="vendor/vision-x",
                 external_pii_redact="true", external_pii_fallback="block", pii_ner_enabled="false")
    monkeypatch.setenv("API_KEY_OPENROUTER", "fake-system-key")
    constructor, client = fake_provider(monkeypatch)
    path = forced_fallback(monkeypatch, tmp_path)

    anonymize_calls = []
    original = ai._anonymize_external

    def spy(provider, message, system, history):
        anonymize_calls.append(provider)
        return original(provider, message, system, history)

    monkeypatch.setattr(ai, "_anonymize_external", spy)

    result = qsa.extract_questionnaire_data(path, vision_call=ai.call_vision)

    assert result == QSA_SCORES
    # Il filtro privacy esterno della chat e' stato applicato al provider vision.
    assert anonymize_calls == ["openrouter"]
    assert ai.last_provider == "openrouter" and ai.last_model == "vendor/vision-x"
    # La chiamata e' passata dal client del provider configurato, con la chiave di sistema.
    assert constructor.call_args.kwargs["api_key"] == "fake-system-key"
    assert constructor.call_args.kwargs["base_url"] == "https://openrouter.ai/api/v1"
    prompt = client.chat.completions.create.call_args.kwargs["messages"][0]["content"][0]["text"]
    assert "vendor/vision-x" not in prompt and "C1" in prompt


def test_block_policy_stops_external_vision_before_any_provider_call(db, monkeypatch, tmp_path):
    ai = service(db, vision_provider="openrouter", vision_model="vendor/vision-x",
                 external_pii_redact="true", external_pii_fallback="block", pii_ner_enabled="true")
    monkeypatch.setenv("API_KEY_OPENROUTER", "fake-system-key")

    def ner_unavailable(*args, **kwargs):
        raise ConnectionError("Local detector unavailable")

    monkeypatch.setattr(pii_ner, "_ner_entities", ner_unavailable)
    constructor, _client = fake_provider(monkeypatch)
    path = forced_fallback(monkeypatch, tmp_path)

    result = qsa.extract_questionnaire_data(path, vision_call=ai.call_vision)

    assert result.get("error_code") == "personalAPI.errors.privacy"
    constructor.assert_not_called()  # il documento non esce con policy `block`


def test_missing_vision_provider_is_a_clear_classified_error(db, monkeypatch, tmp_path):
    ai = service(db, vision_provider="none")
    constructor, _client = fake_provider(monkeypatch)
    path = forced_fallback(monkeypatch, tmp_path)

    result = qsa.extract_questionnaire_data(path, vision_call=ai.call_vision)

    assert result.get("error_code") == "vision_not_configured"
    assert "vision" in result["error"].lower()
    constructor.assert_not_called()


def test_absent_vision_call_reports_unavailable_code(db, monkeypatch, tmp_path):
    path = forced_fallback(monkeypatch, tmp_path)
    result = qsa.extract_questionnaire_data(path, vision_call=None)
    assert result.get("error_code") == qsa.VISION_UNAVAILABLE_CODE


@pytest.mark.parametrize("provider,model,code", [
    ("none", "vendor/vision-x", "vision_not_configured"),
    ("bogus", "vendor/vision-x", "vision_unsupported_provider"),
    ("openrouter", "", "vision_model_missing"),
])
def test_resolve_requires_a_configured_model_without_defaults(provider, model, code):
    with pytest.raises(vision_service.VisionError) as error:
        vision_service.resolve({"vision_provider": provider, "vision_model": model})
    assert error.value.code == code


def test_extraction_module_has_no_hardcoded_model_or_endpoint():
    source = Path(qsa.__file__).read_text(encoding="utf-8")
    assert "preview-09-2025" not in source
    assert "openrouter.ai" not in source


def test_upload_error_maps_codes_to_localized_messages():
    from backend.routes import chat as chat_routes

    for code in (qsa.VISION_UNAVAILABLE_CODE, "vision_not_configured"):
        error = chat_routes._qsa_extraction_error({"error": "raw", "error_code": code}, "en")
        assert error.status_code == 400
        assert "vision" in error.detail.lower() and "raw" not in error.detail
    italian = chat_routes._qsa_extraction_error({"error": "raw", "error_code": "vision_not_configured"}, "it")
    assert italian.detail != chat_routes._qsa_extraction_error(
        {"error": "raw", "error_code": "vision_not_configured"}, "en").detail
    privacy = chat_routes._qsa_extraction_error(
        {"error": "raw", "error_code": qsa.PRIVACY_BLOCKED_CODE}, "it")
    assert "protezione" in privacy.detail.lower()
    technical = chat_routes._qsa_extraction_error({"error": "technical detail"}, "it")
    assert technical.detail == "technical detail"
