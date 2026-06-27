"""Guardia anti-drift — i nomi dei fattori QSA devono restare canonici (PDF Pellerey)
e identici nei tre layer: backend `_QSA_FACTOR_NAMES["it"]`, frontend
`i18n-factors.ts` (blocco IT) e `questionnaires.ts` (set QSA).

Fonte: docs/fonti/.../Schede_fattori_QSA.pdf (tabella p.158 + schede). Se qualcuno
ri-allinea male un nome (es. la C5 corta "Organizzatori semantici" o le forme corte
"Collaborazione"/"Mancanza perseveranza" del vecchio qsa-model.ts), questo test rompe.

Test PURO (nessuna rete/DB), ma copre DUE layer che vivono in posti diversi:
- il check backend importa `backend.chat_logic` (serve fastapi) → girare in container;
- i check frontend leggono i file `.ts` → servono i sorgenti frontend (host/repo).
L'immagine baked NON contiene `frontend/`, quindi in container i due check frontend si
auto-SALTANO; sull'host (dove c'è frontend/) si autosalta il check backend. Eseguilo in
ENTRAMBI gli ambienti per coprire tutto:
    docker exec counselorbot_backend python -m backend.tests.test_qsa_factor_names_canonical
    python -m backend.tests.test_qsa_factor_names_canonical    # dalla root del repo (host)
"""
import os
import re
from pathlib import Path

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")


class _Skip(Exception):
    """Segnala che il check non è applicabile in questo ambiente."""

# Nomi canonici italiani dal PDF (unica fonte di verità del test).
CANONICAL_IT = {
    "C1": "Strategie elaborative",
    "C2": "Autoregolazione",
    "C3": "Disorientamento",
    "C4": "Disponibilità alla collaborazione",
    "C5": "Uso di organizzatori semantici",
    "C6": "Difficoltà di concentrazione",
    "C7": "Autointerrogazione",
    "A1": "Ansietà di base",
    "A2": "Volizione",
    "A3": "Attribuzione a cause controllabili",
    "A4": "Attribuzione a cause incontrollabili",
    "A5": "Mancanza di perseveranza",
    "A6": "Percezione di competenza",
    "A7": "Interferenze emotive",
}

_REPO_ROOT = Path(__file__).resolve().parents[2]
_JS_STRING = r"'((?:\\.|[^'\\])*)'"  # stringa single-quote JS con escape


def _unescape(s: str) -> str:
    return s.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")


def _skip(msg: str):
    try:
        import pytest
        pytest.skip(msg)
    except ImportError:
        raise _Skip(msg)


def _read_frontend(rel: str) -> str:
    path = _REPO_ROOT / rel
    if not path.exists():
        _skip(f"sorgente frontend assente ({rel}); check saltato in questo ambiente")
    return path.read_text(encoding="utf-8")


def test_backend_names_canonical():
    try:
        from backend.chat_logic import _qsa_factor_names
    except Exception as exc:  # fastapi & co. assenti (es. host) → salta
        _skip(f"backend non importabile in questo ambiente: {exc}")
    backend = _qsa_factor_names("it", "QSA")
    assert backend == CANONICAL_IT, f"Backend _QSA_FACTOR_NAMES['it'] != PDF: {_diff(CANONICAL_IT, backend)}"


def test_i18n_factors_it_canonical():
    text = _read_frontend("frontend/src/lib/i18n-factors.ts")
    # Isola il blocco IT: da "const it" fino al successivo "const <lang>".
    start = text.index("const it")
    rest = text[start + len("const it"):]
    end = re.search(r"\nconst [a-z]{2}\b", rest)
    it_block = rest[: end.start()] if end else rest
    found = {}
    for code in CANONICAL_IT:
        m = re.search(rf"'factor\.{code}\.name':\s*{_JS_STRING}", it_block)
        assert m, f"factor.{code}.name non trovato nel blocco IT di i18n-factors.ts"
        found[code] = _unescape(m.group(1))
    assert found == CANONICAL_IT, f"i18n-factors.ts (IT) != PDF: {_diff(CANONICAL_IT, found)}"


def test_questionnaires_qsa_canonical():
    text = _read_frontend("frontend/src/lib/questionnaires.ts")
    found = {}
    for code in CANONICAL_IT:
        # i codici bare C1-C7/A1-A7 appartengono al solo set QSA (QSAr usa suffisso r).
        m = re.search(rf"code:\s*'{code}',\s*name:\s*{_JS_STRING}", text)
        assert m, f"code '{code}' non trovato in questionnaires.ts"
        found[code] = _unescape(m.group(1))
    assert found == CANONICAL_IT, f"questionnaires.ts (QSA) != PDF: {_diff(CANONICAL_IT, found)}"


def _diff(expected: dict, actual: dict) -> dict:
    return {k: (expected.get(k), actual.get(k)) for k in expected if expected.get(k) != actual.get(k)}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = skipped = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except _Skip as exc:
            skipped += 1
            print(f"skip {t.__name__}: {exc}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed - skipped}/{len(tests)} passed, {skipped} skipped")
    raise SystemExit(1 if failed else 0)
