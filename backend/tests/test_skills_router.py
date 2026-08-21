"""Test puri del router delle skill.

`ai_service` e `db` sono finti: si verifica che il router chiami l'LLM solo
oltre soglia, che accetti solo slug esistenti e che qualunque guasto degradi
sul fallback deterministico senza propagare eccezioni.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_router
Con pytest:
    pytest backend/tests/test_skills_router.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from types import SimpleNamespace

from backend.skills.context import SkillContext
from backend.skills.registry import SkillBinding
from backend.skills.router import select


class FakeConfigDB:
    """DB finto: risponde solo alle query di configurazione del router."""

    def __init__(self, values):
        self.values = values
        self._key = None

    def query(self, *_args):
        return self

    def filter(self, *criteria):
        # Estrae il valore letterale confrontato con Config.key.
        for criterion in criteria:
            right = getattr(criterion, "right", None)
            value = getattr(right, "value", None)
            if isinstance(value, str):
                self._key = value
        return self

    def first(self):
        key = self._key
        self._key = None
        if key in self.values:
            return SimpleNamespace(key=key, value=self.values[key])
        return None


def _binding(slug, routing="optional", sort_order=0):
    skill = SimpleNamespace(
        slug=slug, name=slug, description=f"descrizione {slug}", instructions_i18n={"it": slug},
        conditions=None, handler=None, handler_params=None, routing=routing,
        slot="knowledge", max_chars=1400, sort_order=sort_order, is_active=True, status="published",
    )
    return SkillBinding(skill=skill, params={}, sort_order=sort_order)


def _ctx(ai_service=None, config=None):
    return SkillContext(
        questionnaire_type="QSA", step_id="qsa-c6", step_mode="factor", language="it",
        message="come mi organizzo?", db=FakeConfigDB(dict(config or {})), ai_service=ai_service,
    )


class RecordingService:
    config = {"active_provider": "ollama", "model_name": "test-model"}

    def __init__(self, reply):
        self.reply = reply
        self.calls = 0

    def call_model(self, provider, model, user_message, system_prompt, max_tokens=None):
        self.calls += 1
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def test_always_skills_bypass_the_router():
    service = RecordingService('["b"]')
    candidates = [_binding("a", routing="always"), _binding("b"), _binding("c"), _binding("d"), _binding("e")]
    selected, _ = select(candidates, _ctx(service))
    assert "a" in [b.slug for b in selected]


def test_below_threshold_no_llm_call():
    service = RecordingService('["b"]')
    candidates = [_binding("b"), _binding("c")]
    selected, trace = select(candidates, _ctx(service))
    assert service.calls == 0
    assert [b.slug for b in selected] == ["b", "c"]
    assert trace == []


def test_above_threshold_llm_selects():
    service = RecordingService('["c", "e"]')
    candidates = [_binding(s) for s in ("b", "c", "d", "e")]
    selected, trace = select(candidates, _ctx(service))
    assert service.calls == 1
    assert sorted(b.slug for b in selected) == ["c", "e"]
    assert trace[0]["router"] == "llm"


def test_llm_reply_with_unknown_slugs_is_filtered():
    service = RecordingService('["c", "inventata"]')
    candidates = [_binding(s) for s in ("b", "c", "d", "e")]
    selected, _ = select(candidates, _ctx(service))
    assert [b.slug for b in selected] == ["c"]


def test_llm_failure_falls_back_deterministically():
    service = RecordingService(RuntimeError("timeout"))
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, _ctx(service))
    assert [b.slug for b in selected] == ["b", "c", "d"]
    assert trace[0]["router"] == "fallback"


def test_unparsable_reply_falls_back():
    service = RecordingService("non e' json")
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, _ctx(service))
    assert [b.slug for b in selected] == ["b", "c", "d"]
    assert trace[0]["router"] == "fallback"


def test_missing_ai_service_falls_back():
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, _ctx(None))
    assert [b.slug for b in selected] == ["b", "c", "d"]
    assert trace[0]["router"] == "fallback"


def test_slow_service_times_out_to_fallback():
    import time

    class SlowService(RecordingService):
        def call_model(self, provider, model, user_message, system_prompt, max_tokens=None):
            self.calls += 1
            time.sleep(2)
            return '["c"]'

    ctx = _ctx(SlowService('["c"]'), config={"skills_router_timeout_s": "1"})
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, ctx)
    assert trace[0]["router"] == "fallback"
    assert [b.slug for b in selected] == ["b", "c", "d"]


def test_empty_candidates():
    selected, trace = select([], _ctx(None))
    assert selected == [] and trace == []


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
