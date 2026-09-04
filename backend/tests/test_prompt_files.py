"""Test dei testi di prompt tenuti come file in `backend/prompts/`.

I default di fabbrica sono file `.md`, uno per prompt, caricati da
`prompt_config._text`. Qui si controlla che codice e cartella restino
allineati: un file rinominato o cancellato romperebbe l'import dell'app
all'avvio, e un file orfano e' testo che nessuno serve piu'.

Test puri: nessun database.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_prompt_files
"""
import re
from pathlib import Path

from backend import prompt_config

PROMPTS_DIR = Path(prompt_config.__file__).parent / "prompts"
SOURCE = Path(prompt_config.__file__).read_text(encoding="utf-8")
REFERENCED = set(re.findall(r'_text\("([a-z0-9_]+)"\)', SOURCE))


def test_every_referenced_prompt_file_exists():
    missing = sorted(name for name in REFERENCED if not (PROMPTS_DIR / f"{name}.md").exists())
    assert not missing, f"file di prompt mancanti: {missing}"


def test_no_orphan_prompt_files():
    on_disk = {path.stem for path in PROMPTS_DIR.glob("*.md")}
    orphans = sorted(on_disk - REFERENCED)
    assert not orphans, f"file di prompt non usati da nessuno: {orphans}"


def test_no_prompt_file_is_empty():
    empty = sorted(p.name for p in PROMPTS_DIR.glob("*.md") if not p.read_text(encoding="utf-8").strip())
    assert not empty, f"file di prompt vuoti: {empty}"


def test_loaded_text_keeps_no_trailing_newline():
    """`_text` toglie l'a capo finale: gli spazi di raccordo stanno nel codice."""
    for name in sorted(REFERENCED):
        loaded = prompt_config._text(name)
        assert loaded == loaded.rstrip("\n"), f"{name}: a capo finale non rimosso"
        assert loaded.strip(), f"{name}: testo vuoto"


def test_every_guided_step_has_a_prompt():
    """I prompt degli step arrivano dai file: nessuno puo' restare vuoto.

    Le chiavi di `configs` non sono incluse: alcune nascono apposta senza testo
    (i `prompt_meta_*` e `pqbl_model`, riempiti dall'admin quando servono).
    """
    step_lists = (
        prompt_config.DEFAULT_GUIDED_STEPS,
        prompt_config.DEFAULT_QSAR_GUIDED_STEPS,
        prompt_config.DEFAULT_ZTPI_GUIDED_STEPS,
        prompt_config.DEFAULT_SAVICKAS_GUIDED_STEPS,
        prompt_config.DEFAULT_IDEA_GUIDED_STEPS,
        prompt_config.DEFAULT_QPCS_GUIDED_STEPS,
        prompt_config.DEFAULT_QPCC_GUIDED_STEPS,
        prompt_config.DEFAULT_QAP_GUIDED_STEPS,
    )
    for steps in step_lists:
        for step in steps:
            assert (step.get("prompt") or "").strip(), f"step senza prompt: {step['id']}"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
