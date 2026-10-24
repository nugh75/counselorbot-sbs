"""No bypass of the AI gateway (P6, docs/privacy/02-progettazione.md §6.2).

Static test, no imports of the scanned modules: provider SDK clients and AI
endpoints may appear only in the closed list below. Every transport module
must pass its data through ``backend.privacy.gateway``; the other entries
carry no personal data or are internal to the Privacy Layer. A new module, a
new client or a stale entry fails the test: update the list on purpose.
"""
import ast
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]

#: Client constructors of the provider SDKs (``genai.Client`` checked by owner).
SDK_CALLS = {"OpenAI", "AsyncOpenAI", "Anthropic", "AsyncAnthropic", "Mistral", "Communicate"}
#: Endpoints of model servers and external AI services.
ENDPOINTS = (
    "/api/chat", "/api/generate", "/api/embed", "/chat/completions", "/embeddings", "/synthesize",
    "api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com", "api.mistral.ai",
    "openrouter.ai", "api.groq.com", "api.cerebras.ai", "api.deepseek.com", "api.together.xyz",
    "api.fireworks.ai", "api.deepinfra.com", "speech.platform.bing.com", "api.telegram.org",
)

#: module -> (role, marker the source must contain for transports)
GATEWAY = "privacy.gateway import AIGateway"
ALLOWED = {
    "ai_service.py": ("transport", GATEWAY),             # provider facade: chat, stream, summary
    "vision_service.py": ("transport", GATEWAY),         # kind="vision"
    "qsa_extractor.py": ("transport", GATEWAY),          # kind="ocr"
    "pqbl_generator.py": ("transport", GATEWAY),         # kind="ocr"
    "embedding_service.py": ("transport", GATEWAY),      # kind="embedding"
    "routes/voice_reader.py": ("transport", GATEWAY),    # kind="tts" (Edge, Piper)
    "routes/chat.py": ("transport", "speech_text(clean_text"),  # /chat/tts through voice_reader
    "telegram_bot.py": ("transport", GATEWAY),           # kind="notify"
    # Responses transport of AIService (openai_chatgpt): its envelope is filtered upstream.
    "chatgpt_responses.py": ("facade", ""),
    "chatgpt_connections.py": ("no personal data", ""),  # OAuth tokens and model catalog
    "openrouter_capabilities.py": ("no personal data", ""),  # public model catalog
    "local_llm.py": ("no personal data", ""),            # URL helpers and probes, no prompt
    "pii_ner.py": ("privacy internal", ""),             # local NER detector, trusted host only
    "prompt_lab/local_models.py": ("lab", ""),           # synthetic cases, excluded from teacher-pc
}
#: Only the facade may call the facade-only transports.
FACADE_IMPORTERS = {"chatgpt_responses.py": {"stream": {"ai_service.py"}}}


def _modules():
    for path in sorted(BACKEND.rglob("*.py")):
        rel = path.relative_to(BACKEND).as_posix()
        if rel.startswith("tests/") or "/node_modules/" in rel:
            continue
        yield rel, path.read_text(encoding="utf-8")


def _strings(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        yield node.value
    elif isinstance(node, ast.JoinedStr):
        for value in node.values:
            yield from _strings(value)


def _hits(source):
    found = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call):
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
            owner = func.value.id if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) else ""
            if name in SDK_CALLS or (name == "Client" and owner == "genai"):
                found.add(f"{owner + '.' if owner else ''}{name}(")
        for text in _strings(node):
            found.update(endpoint for endpoint in ENDPOINTS if endpoint in text)
    return found


SCAN = {rel: (source, _hits(source)) for rel, source in _modules()}


def test_sdk_clients_and_ai_endpoints_only_in_the_closed_list():
    outside = {rel: sorted(hits) for rel, (_source, hits) in SCAN.items() if hits and rel not in ALLOWED}
    assert outside == {}, "AI egress outside the gateway modules: route it through AIGateway"


@pytest.mark.parametrize("rel", sorted(ALLOWED))
def test_closed_list_has_no_stale_entries(rel):
    assert SCAN.get(rel, ("", set()))[1], f"{rel} no longer calls a provider: remove it from ALLOWED"


@pytest.mark.parametrize("rel", sorted(r for r, (role, _m) in ALLOWED.items() if role == "transport"))
def test_transport_modules_pass_through_the_gateway(rel):
    assert ALLOWED[rel][1] in SCAN[rel][0]


def test_facade_transports_are_called_only_by_the_facade():
    for module, names in FACADE_IMPORTERS.items():
        target = module.removesuffix(".py").replace("/", ".")
        for rel, (source, _hits) in SCAN.items():
            for node in ast.walk(ast.parse(source)):
                if isinstance(node, ast.ImportFrom) and (node.module or "").endswith(target):
                    for alias in node.names:
                        allowed = names.get(alias.name)
                        assert allowed is None or rel in allowed, f"{rel} imports {alias.name} from {module}"


def test_tls_verification_is_never_disabled():
    disabled = []
    for rel, (source, _hits) in SCAN.items():
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.keyword) and node.arg == "verify" and \
                    isinstance(node.value, ast.Constant) and node.value.value is False:
                disabled.append(rel)
    assert disabled == []


def test_guard_detects_a_new_bypass():
    source = 'import httpx\nfrom openai import OpenAI\nOpenAI(api_key="k")\nhttpx.post(f"{base}/api/chat")\n'
    assert _hits(source) == {"OpenAI(", "/api/chat"}
