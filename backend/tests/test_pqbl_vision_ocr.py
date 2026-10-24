"""OCR dei PDF scansionati pQBL tramite un provider di visione configurabile.

Nessuna chiamata di rete: la rasterizzazione, l'OCR locale e i client dei provider sono
finti e ogni trasporto HTTP è vietato. Verifica il contratto del compito:
- il PDF con testo nativo continua a essere letto senza alcun OCR;
- il PDF scansionato usa il provider di visione configurato via
  `AIService.call_vision` (stessa policy privacy esterna della chat);
- senza provider utilizzabile l'esito è un errore chiaro e classificato.
"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pypdf
import pymupdf4llm
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend import models, pqbl_generator as pqbl, vision_service
from backend.ai_service import AIService
from backend.api_secrets import API_KEY_ENV_MAP

#: Testo finto restituito dal client del provider di visione (mai rete reale).
VISION_TEXT = " ".join(["Testo riconosciuto dal provider di visione."] * 8)


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
    """AIService reale sulla config di prova, senza avviare il servizio completo."""
    for key, value in config.items():
        db.merge(models.Config(key=key, value=str(value)))
    db.commit()
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


def fake_provider(monkeypatch, text=VISION_TEXT):
    client = Mock()
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
    )
    constructor = Mock(return_value=client)
    monkeypatch.setattr(vision_service, "OpenAI", constructor)
    return constructor, client


@pytest.fixture
def scanned_pdf(monkeypatch, tmp_path):
    """PDF senza testo nativo: estrazione nativa vuota, due pagine da OCR."""
    def no_markdown(*args, **kwargs):
        raise RuntimeError("pymupdf4llm non disponibile (test)")

    monkeypatch.setattr(pymupdf4llm, "to_markdown", no_markdown)
    page = SimpleNamespace(extract_text=lambda: "")
    monkeypatch.setattr(
        pypdf, "PdfReader", lambda path: SimpleNamespace(pages=[page, page]))
    monkeypatch.setattr(
        pqbl, "render_pages_to_images", lambda path, start, end: [object(), object()])
    monkeypatch.setattr(pqbl, "_page_image_base64", lambda image: "ZmFrZS1pbWFnZQ==")

    def ollama_down(*args, **kwargs):
        raise RuntimeError("Ollama non raggiungibile (test)")

    monkeypatch.setattr(pqbl, "_local_ollama_ocr", ollama_down)
    path = tmp_path / "scansione.pdf"
    path.write_bytes(b"%PDF-1.4 scanned")
    return str(path)


def test_native_text_pdf_is_read_without_any_ocr(monkeypatch, tmp_path):
    native = "# Capitolo 1\n" + "Testo nativo del PDF, leggibile senza OCR. " * 20
    monkeypatch.setattr(pymupdf4llm, "to_markdown", lambda path, pages=None: native)
    calls = []
    monkeypatch.setattr(pqbl, "ocr_pdf_pages", lambda *a, **k: calls.append(1) or "")
    path = tmp_path / "nativo.pdf"
    path.write_bytes(b"%PDF-1.4 native")

    result = pqbl.extract_pdf_text_range(
        str(path), 0, 2, vision_call=lambda prompt, image: VISION_TEXT)

    assert result.startswith("# Capitolo 1")
    assert calls == []  # nessun OCR, nessun provider contattato


def test_local_ocr_is_preferred_over_the_vision_provider(monkeypatch, tmp_path):
    monkeypatch.setattr(
        pqbl, "render_pages_to_images", lambda path, start, end: [object()])
    monkeypatch.setattr(
        pqbl, "_local_ollama_ocr", lambda images, url, model: "Testo locale Ollama. " * 20)
    vision = Mock()

    result = pqbl.ocr_pdf_pages(str(tmp_path / "x.pdf"), 0, 1, vision_call=vision)

    assert result.startswith("Testo locale Ollama.")
    vision.assert_not_called()


def test_scanned_pdf_uses_the_configured_trusted_local_vision_provider(db, monkeypatch, scanned_pdf):
    ai = service(db, vision_provider="ollama", vision_model="local-vision-x",
                 ollama_ip="http://127.0.0.1:11434",
                 external_pii_redact="true", external_pii_fallback="block",
                 pii_ner_enabled="false")
    response = Mock()
    response.json.return_value = {"response": VISION_TEXT}
    post = Mock(return_value=response)
    monkeypatch.setattr(vision_service.httpx, "post", post)

    anonymize_calls = []
    original = ai._anonymize_external

    def spy(provider, message, system, history):
        anonymize_calls.append(provider)
        return original(provider, message, system, history)

    monkeypatch.setattr(ai, "_anonymize_external", spy)

    result = pqbl.extract_pdf_text_range(
        scanned_pdf, 0, 2, vision_call=ai.call_vision)

    # Due pagine scansionate: il testo delle due pagine viene unito.
    assert result.count(VISION_TEXT) == 2
    assert anonymize_calls == ["ollama", "ollama"]
    assert ai.last_provider == "ollama" and ai.last_model == "local-vision-x"
    assert post.call_args.args[0] == "http://127.0.0.1:11434/api/generate"
    prompt = post.call_args.kwargs["json"]["prompt"]
    assert "Markdown" in prompt  # prompt OCR, nessun modello cablato
    assert post.call_count == 2


def test_missing_vision_provider_is_a_clear_classified_error(db, monkeypatch, scanned_pdf):
    ai = service(db, vision_provider="none")
    constructor, _client = fake_provider(monkeypatch)

    with pytest.raises(pqbl.OcrUnavailableError) as error:
        pqbl.extract_pdf_text_range(scanned_pdf, 0, 2, vision_call=ai.call_vision)

    assert error.value.code == "vision_not_configured"
    assert "visione" in str(error.value)
    constructor.assert_not_called()  # nessun provider: nessuna chiamata


def test_scanned_pdf_without_vision_call_reports_a_clear_error(scanned_pdf):
    with pytest.raises(pqbl.OcrUnavailableError) as error:
        pqbl.extract_pdf_text_range(scanned_pdf, 0, 2)

    assert error.value.code == pqbl.OCR_UNAVAILABLE_CODE
    assert "scansione" in str(error.value)


def test_ocr_error_stays_a_valueerror_for_segment_tolerance():
    # `routes/pqbl.py` tollera i guasti di un segmento con `except (AIError, ValueError)`.
    assert issubclass(pqbl.OcrUnavailableError, ValueError)


def test_generator_has_no_hardcoded_vision_endpoint():
    source = Path(pqbl.__file__).read_text(encoding="utf-8")
    assert "openrouter.ai" not in source
    assert "api.openai.com" not in source
