"""The prompt registry is the single source of the prompts sent to a model (#760).

These tests fail when a prompt key exists in the factory, the config
definitions or the request builders without a registry entry, when an entry
has no consumer, or when a rule's evidence is no longer in its factory text.
The database side (keys that exist only in `configs`) is covered by
`test_prompt_health.py`.

Pure: no database, no model.
    python -m pytest backend/tests/test_prompt_registry.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://unused@127.0.0.1:1/unused")

import importlib
import inspect
import re

from backend import prompt_config, prompt_registry
from backend.chat_logic import (
    FOLLOW_UP_MODE_BY_STEP_MODE,
    _system_prompt_key,
    prompt_meta_config_key,
)
from backend.chat_preparation import IDEA_VARIANT_KEYS
from backend.prompt_factory_alignment import factory_catalog
from backend.prompt_registry import (
    REGISTRY,
    RULE_VALUES,
    config_entry,
    factory_text,
    is_prompt_config_key,
)

# Modes the clients send outside the step modes (GuidedChatInterface, FreeChatInterface).
CLIENT_MODES = ("generic", "qsar-generic", "free", "savickas-interview")
# Registered prompts that no flow reads yet. The list can only shrink.
KNOWN_UNCONSUMED: set[str] = set()


def _consumer(entry):
    module_name, func_name = entry.consumer.split(":")
    module = importlib.import_module(module_name)
    return module, getattr(module, func_name)


def _reachable_config_keys():
    """Config keys reached by the runtime resolvers, without reading the registry."""
    _configs, steps = factory_catalog()
    reached = set()
    instruments = {step["questionnaire_type"] for step in steps.values()}
    for step in steps.values():
        row = type("Step", (), step)
        reached.add(_system_prompt_key(step["system_prompt_mode"], step["id"], row))
        follow = FOLLOW_UP_MODE_BY_STEP_MODE.get(step["system_prompt_mode"], step["system_prompt_mode"])
        reached.add(_system_prompt_key(follow, step["id"], row))
        reached.add(prompt_meta_config_key(step["questionnaire_type"], step["id"]))
    for mode in CLIENT_MODES:
        reached.add(_system_prompt_key(mode, None))
    reached.update(d["key"] for d in prompt_config.GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS.values())
    reached.update(prompt_meta_config_key(i) for i in instruments)
    reached.update(d["key"] for d in prompt_config.GLOBAL_DIRECTIVE_DEFINITIONS)
    reached.update(IDEA_VARIANT_KEYS.values())
    reached.update(prompt_config.SITE_CHAT_MODE_TO_PROMPT_KEY.values())
    reached.update(prompt_config.COUNSELORBOT_CHAT_MODE_TO_PROMPT_KEY.values())
    return reached


def test_every_factory_prompt_is_registered():
    configs, steps = factory_catalog()
    missing = [k for k in configs if config_entry(k) is None]
    missing += [s for s in steps if f"guided_step:{s}" not in REGISTRY]
    assert not missing, f"Prompt without registry entry: {missing}"


def test_every_config_definition_that_is_a_prompt_is_registered():
    keys = [d["key"] for d in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS]
    missing = [k for k in keys if is_prompt_config_key(k) and config_entry(k) is None]
    assert not missing, f"Prompt definition without registry entry: {missing}"


def test_every_reachable_key_is_registered():
    missing = sorted(k for k in _reachable_config_keys() if is_prompt_config_key(k) and config_entry(k) is None)
    assert not missing, f"Key read by the runtime without registry entry: {missing}"


def test_every_entry_has_a_consumer_that_reads_it():
    reachable = _reachable_config_keys()
    unconsumed = []
    for entry in REGISTRY.values():
        module, func = _consumer(entry)
        assert callable(func), entry.id
        if entry.kind != "config" or entry.family:
            continue
        if entry.key not in reachable and f'"{entry.key}"' not in inspect.getsource(module):
            unconsumed.append(entry.key)
    assert set(unconsumed) == KNOWN_UNCONSUMED, f"Registered prompt with no consumer: {sorted(unconsumed)}"


def test_rule_evidence_is_in_the_factory_text():
    for entry in REGISTRY.values():
        source = factory_text(entry)
        if entry.kind == "code":
            source = inspect.getsource(_consumer(entry)[0])
        for rule in entry.rules:
            assert source is not None, entry.id
            assert rule.evidence in source, f"{entry.id}: evidence not found: {rule.evidence!r}"


def test_rule_values_are_from_the_vocabulary():
    for entry in REGISTRY.values():
        for rule in entry.rules:
            assert rule.field in RULE_VALUES, (entry.id, rule.field)
            allowed = RULE_VALUES[rule.field]
            if rule.field == "questions":
                lo, hi = rule.value
                assert 0 <= lo <= hi, (entry.id, rule.value)
            elif rule.field == "language":
                assert rule.value == "selected" or re.fullmatch(r"[a-z]{2}", rule.value), entry.id
            else:
                assert rule.value in allowed, (entry.id, rule.value)


def test_factory_placeholders_are_declared():
    for entry in REGISTRY.values():
        text = factory_text(entry) or ""
        found = set(re.findall(r"(?<!\{)\{([a-z_]+)\}(?!\})", text))
        assert found <= entry.placeholders, f"{entry.id}: undeclared placeholders {found - entry.placeholders}"


def test_entries_have_known_surfaces_and_order():
    for entry in REGISTRY.values():
        assert entry.surfaces and set(entry.surfaces) <= set(prompt_registry.SURFACES), entry.id
        assert entry.order in {10, 20, 30, 40, 50, 60, 70, 80}, entry.id


def test_dynamic_keys_resolve_to_families():
    assert config_entry("prompt_meta_QPCC_qpcc-intro") is prompt_registry.META_STEP_FAMILY
    assert config_entry("prompt_meta_NEWTOOL") is prompt_registry.META_INSTRUMENT_FAMILY
    assert config_entry("rag_chat_context_custom") is prompt_registry.RAG_CONTEXT_FAMILY
    assert config_entry("prompt_factor__level_compact").key == "prompt_factor"
    assert not is_prompt_config_key("prompt_components_QSA_intro")
    assert not is_prompt_config_key("prompt_guidance_QSA_intro")
    assert not is_prompt_config_key("text_qsar_conclusion__en")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
