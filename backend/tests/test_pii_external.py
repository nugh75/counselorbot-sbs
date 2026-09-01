"""Test — anonimizzazione PII verso provider esterni (layer deterministico).

Copre l'estensione di `backend.pii` con validazione checksum (IBAN mod-97,
PIVA, Luhn, codice fiscale) e la modalita' placeholder reversibile
(`find_pii` / `anonymize`). Test PUR0: nessuna rete, nessun DB.

Eseguibile con pytest:
    docker exec counselorbot_backend python -m pytest backend/tests/test_pii_external.py -q
"""

import httpx

from backend import pii


# --- Implementazioni di riferimento (indipendenti dal codice di produzione) --

def _iban_to_number(iban: str) -> int:
    rearranged = iban[4:] + iban[:4]
    digits = ""
    for ch in rearranged:
        if ch.isdigit():
            digits += ch
        else:
            digits += str(ord(ch) - 55)
    return int(digits)


def _make_valid_iban() -> str:
    bban = "X0542811101000000123456"
    check = 98 - (_iban_to_number("IT00" + bban) % 97)
    return f"IT{check:02d}{bban}"


def _piva_control(base10: str) -> int:
    total = 0
    for i, ch in enumerate(base10, start=1):
        d = int(ch)
        total += d * 2 if i % 2 == 1 else d
        if i % 2 == 1 and d * 2 > 9:
            total -= 9
    return (10 - total % 10) % 10


def _make_valid_piva() -> str:
    base = "1234567890"
    return base + str(_piva_control(base))


def _luhn_valid(number: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


_CF_ODD = {
    "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17,
    "8": 19, "9": 21, "A": 1, "B": 0, "C": 5, "D": 7, "E": 9, "F": 13,
    "G": 15, "H": 17, "I": 19, "J": 21, "K": 2, "L": 4, "M": 18, "N": 20,
    "O": 11, "P": 3, "Q": 6, "R": 8, "S": 12, "T": 14, "U": 16, "V": 10,
    "W": 22, "X": 25, "Y": 24, "Z": 23,
}


def _cf_control(base15: str) -> str:
    total = 0
    for i, ch in enumerate(base15, start=1):
        if i % 2 == 1:
            total += _CF_ODD[ch]
        elif ch.isdigit():
            total += int(ch)
        else:
            total += ord(ch) - 65
    return chr(65 + total % 26)


def _make_valid_cf() -> str:
    base = "RSSMRA80A01H501"
    return base + _cf_control(base)


# --- find_pii ---------------------------------------------------------------

def test_find_pii_detects_valid_iban():
    iban = _make_valid_iban()
    assert _iban_to_number(iban) % 97 == 1  # sanity: fixture valida
    found = pii.find_pii(f"mando bonifico su {iban}")
    assert ("iban", iban) in found


def test_find_pii_rejects_iban_with_bad_checksum():
    iban = _make_valid_iban()
    broken = iban[:-1] + ("0" if iban[-1] != "0" else "1")
    assert pii.find_pii(f"iban {broken}") == []


def test_find_pii_detects_valid_piva():
    piva = _make_valid_piva()
    found = pii.find_pii(f"la mia partita iva e' {piva}")
    assert ("piva", piva) in found


def test_find_pii_rejects_piva_with_bad_checksum():
    piva = _make_valid_piva()
    broken = piva[:-1] + str((int(piva[-1]) + 1) % 10)
    assert pii.find_pii(f"piva {broken}") == []


def test_find_pii_detects_luhn_card():
    assert _luhn_valid("4111111111111111")  # sanity
    found = pii.find_pii("carta 4111111111111111")
    assert ("card", "4111111111111111") in found


def test_find_pii_rejects_non_luhn_card():
    assert not _luhn_valid("4111111111111112")  # sanity
    assert pii.find_pii("carta 4111111111111112") == []


def test_find_pii_detects_targa():
    found = pii.find_pii("l'auto ha targa AA123BB")
    assert ("targa", "AA123BB") in found


def test_find_pii_rejects_bad_targa_format():
    assert pii.find_pii("targa AA1234BB") == []


def test_find_pii_validates_cf_checksum():
    cf = _make_valid_cf()
    found = pii.find_pii(f"il mio cf e' {cf}")
    assert ("cf", cf) in found


def test_find_pii_rejects_cf_with_bad_checksum():
    cf = _make_valid_cf()
    broken = cf[:-1] + chr(65 + (ord(cf[-1]) - 65 + 1) % 26)
    assert pii.find_pii(f"cf {broken}") == []


def test_find_pii_keeps_email_and_phone():
    found = pii.find_pii("scrivi a mario.rossi@example.com o 333 1234567")
    assert ("email", "mario.rossi@example.com") in found
    assert any(t == "telefono" for t, _ in found)


def test_find_pii_detects_foreign_ibans():
    """Gli IBAN esteri (DE/ES/FR/GB/SE) passano con mod-97: il formato
    e' internazionale, non serve una regex per nazione."""
    for iban in [
        "DE89370400440532013000",
        "ES9121000418450200051332",
        "FR1420041010050500013M02606",
        "GB29NWBK60161331926819",
        "SE4550000000058398257466",
    ]:
        assert _iban_to_number(iban) % 97 == 1  # sanity: fixture valide
        assert ("iban", iban) in pii.find_pii(f"iban {iban}")


def test_find_pii_detects_international_phones():
    """Telefoni internazionali con prefisso + (formato usato dagli studenti
    non italiani) vanno rilevati; senza prefisso no (falsi positivi)."""
    for phone in [
        "+46 70 123 45 67",        # Svezia
        "+1 (555) 123-4567",       # USA
        "+49 170 1234567",         # Germania
        "+34 612 345 678",         # Spagna
    ]:
        found = pii.find_pii(f"chiamami al {phone}")
        assert any(t == "telefono" for t, _ in found), phone


def test_find_pii_ignores_plus_without_enough_digits():
    assert pii.find_pii("faccio +3 ore di sport") == []
    assert pii.find_pii("numero 1234567 senza prefisso") == []


def test_anonymize_roundtrip_multilingual_text():
    """Testo non italiano con IBAN estero, telefono internazionale ed email:
    roundtrip esatto (il layer deterministico e' language-neutral)."""
    text = (
        "My name is John, my IBAN is DE89370400440532013000, "
        "call me at +46 70 123 45 67 or john.doe@example.com"
    )
    anonymized, mapping = pii.anonymize(text)
    assert "DE89370400440532013000" not in anonymized
    assert "+46 70 123 45 67" not in anonymized
    assert "john.doe@example.com" not in anonymized
    assert pii.restore(anonymized, mapping) == text


# --- anonymize / restore (roundtrip) ----------------------------------------

def test_anonymize_roundtrip_restores_original():
    text = (
        "Mi chiamo Mario Rossi, il mio cf e' " + _make_valid_cf() +
        " e l'iban " + _make_valid_iban() + ". Mail: mario.rossi@example.com"
    )
    anonymized, mapping = pii.anonymize(text)
    # nessun valore reale residuo
    assert _make_valid_cf() not in anonymized
    assert _make_valid_iban() not in anonymized
    assert "mario.rossi@example.com" not in anonymized
    # mapping popolato con token placeholder
    assert mapping, "mapping vuoto"
    for token, value in mapping.items():
        assert token.startswith("[[PII:") and token.endswith("]]")
        assert value in text
    # roundtrip esatto
    assert pii.restore(anonymized, mapping) == text


def test_anonymize_without_pii_returns_unchanged():
    text = "Il questionario QSA misura le strategie di apprendimento."
    anonymized, mapping = pii.anonymize(text)
    assert anonymized == text
    assert mapping == {}


def test_restore_ignores_unknown_tokens():
    mapping = {"[[PII:CF:1]]": "X"}
    assert pii.restore("cf [[PII:CF:1]] e [[PII:NOME:9]]", mapping) == \
        "cf X e [[PII:NOME:9]]"


# --- redact distruttivo (regressione audit) ---------------------------------

def test_redact_destructive_still_covers_new_types():
    pii.set_pii_redact_enabled(True)
    try:
        text = f"iban {_make_valid_iban()} piva {_make_valid_piva()} carta 4111111111111111"
        out = pii.redact(text)
        assert _make_valid_iban() not in out
        assert _make_valid_piva() not in out
        assert "4111111111111111" not in out
    finally:
        pii.set_pii_redact_enabled(True)


# --- pii_ner: anonymize_texts / restore / StreamRestorer --------------------

from backend import pii_ner  # noqa: E402


def test_anonymize_texts_unique_tokens_across_texts():
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(False)  # test puro del layer deterministico
    try:
        cf = _make_valid_cf()
        texts = [f"il mio cf {cf}", f"ripeto: {cf}"]
        anon, mapping, ner_ok = pii_ner.anonymize_texts(texts)
        assert ner_ok
        assert cf not in anon[0] and cf not in anon[1]
        assert pii_ner.restore_text(anon[0], mapping).endswith(cf)
        assert pii_ner.restore_text(anon[1], mapping).endswith(cf)
    finally:
        pii_ner.set_ner_enabled(prev)


def test_anonymize_texts_ner_disabled_leaves_names():
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(False)
    try:
        anon, mapping, ner_ok = pii_ner.anonymize_texts(["mi chiamo Marco Rossi"])
        assert ner_ok
        assert anon[0] == "mi chiamo Marco Rossi"
        assert mapping == {}
    finally:
        pii_ner.set_ner_enabled(prev)


def test_parse_entities_valid_and_invalid_json():
    good = '{"entities": [{"type": "nome", "value": "Marco Rossi"}]}'
    assert pii_ner._parse_entities(good) == [("nome", "Marco Rossi")]
    assert pii_ner._parse_entities("non-json") == []
    assert pii_ner._parse_entities('{"entities": 42}') == []


def test_anonymize_texts_with_ner_fake_detector(monkeypatch):
    def fake_entities(text, base_url, model):
        return [("nome", "Marco Rossi")]
    monkeypatch.setattr(pii_ner, "_ner_entities", fake_entities)
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(True)
    try:
        anon, mapping, ner_ok = pii_ner.anonymize_texts(["mi chiamo Marco Rossi"])
        assert ner_ok
        assert "Marco Rossi" not in anon[0]
        token = [t for t in mapping if t.startswith("[[PII:NOME:")][0]
        assert mapping[token] == "Marco Rossi"
        assert pii_ner.restore_text(anon[0], mapping) == "mi chiamo Marco Rossi"
    finally:
        pii_ner.set_ner_enabled(prev)


def test_anonymize_texts_ner_failure_returns_deterministic_and_ner_not_ok(monkeypatch):
    def broken_entities(text, base_url, model):
        raise httpx.ConnectError("connection refused")
    monkeypatch.setattr(pii_ner, "_ner_entities", broken_entities)
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(True)
    try:
        cf = _make_valid_cf()
        anon, mapping, ner_ok = pii_ner.anonymize_texts([f"cf {cf}, sono Marco Rossi"])
        assert ner_ok is False
        # layer deterministico comunque applicato
        assert cf not in anon[0]
        assert pii_ner.restore_text(anon[0], mapping) == f"cf {cf}, sono Marco Rossi"
    finally:
        pii_ner.set_ner_enabled(prev)


def test_anonymize_texts_ner_overlap_keeps_outer_span(monkeypatch):
    """Il modello puo' restituire span sovrapposti (indirizzo che contiene la
    citta'): va tenuto lo span esterno, altrimenti la strada resta visibile
    verso il provider esterno (leak)."""
    def fake_entities(text, base_url, model):
        return [
            ("indirizzo", "via Garibaldi 12 a Torino"),
            ("citta", "Torino"),
        ]
    monkeypatch.setattr(pii_ner, "_ner_entities", fake_entities)
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(True)
    try:
        anon, mapping, ner_ok = pii_ner.anonymize_texts(
            ["abito in via Garibaldi 12 a Torino"])
        assert ner_ok
        # nessun pezzo dell'indirizzo deve restare visibile
        assert "via Garibaldi" not in anon[0]
        assert "Torino" not in anon[0]
        assert pii_ner.restore_text(anon[0], mapping) == \
            "abito in via Garibaldi 12 a Torino"
    finally:
        pii_ner.set_ner_enabled(prev)


def test_anonymize_texts_ner_never_overrides_deterministic(monkeypatch):
    """Se il NER copre un identificatore deterministico (es. CF dentro un
    indirizzo inventato), il deterministico vince e il NER salta."""
    cf = _make_valid_cf()

    def fake_entities(text, base_url, model):
        return [("indirizzo", f"via Roma 1 {cf} Torino")]
    monkeypatch.setattr(pii_ner, "_ner_entities", fake_entities)
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(True)
    try:
        anon, mapping, ner_ok = pii_ner.anonymize_texts([f"via Roma 1 {cf} Torino"])
        assert ner_ok
        assert cf not in anon[0]  # token deterministico presente
        assert pii_ner.restore_text(anon[0], mapping) == f"via Roma 1 {cf} Torino"
    finally:
        pii_ner.set_ner_enabled(prev)


def test_stream_restorer_reassembles_split_token():
    mapping = {"[[PII:CF:1]]": "ABCDEF12A34B567C"}
    restorer = pii_ner.StreamRestorer(mapping)
    # il token arriva spezzato su tre chunk
    out = restorer.feed("il cf e' [[PII:CF:")
    out += restorer.feed("1]] ok")
    out += restorer.flush()
    assert out == "il cf e' ABCDEF12A34B567C ok"


def test_stream_restorer_reassembles_token_split_before_colon():
    """Il chunk puo' spezzare il placeholder anche PRIMA dei due punti
    ('[[PII' + ':NOME:1]]'): ogni prefisso di token va tenuto in buffer."""
    mapping = {"[[PII:NOME:1]]": "Marco Rossi"}
    restorer = pii_ner.StreamRestorer(mapping)
    out = ""
    for chunk in ["nome ", "[[PII", ":NOME", ":1]]", " ok"]:
        out += restorer.feed(chunk)
    out += restorer.flush()
    assert out == "nome Marco Rossi ok"


def test_stream_restorer_passthrough_without_mapping():
    restorer = pii_ner.StreamRestorer({})
    out = restorer.feed("nessun token")
    out += restorer.flush()
    assert out == "nessun token"


def test_stream_restorer_tiny_chunks_like_real_deepseek():
    """Chunk minuscoli e spezzati dentro il prefisso, come li produce
    deepseek reale: la coda bufferizzata deve essere una SUBSTRING del token,
    non solo un suo prefisso."""
    mapping = {
        "[[PII:NOME:1]]": "Marco Rossi",
        "[[PII:CF:1]]": "RSSMRA80A01H501U",
        "[[PII:CITTA:1]]": "Torino",
    }
    restorer = pii_ner.StreamRestorer(mapping)
    out = ""
    for chunk in [
        "- nome", " [", "[", "P", "II", ":", "NOME", ":", "1", "]]\n",
        "- cf", " [", "[", "P", "II", ":", "CF", ":", "1", "]]\n",
        "- citt", "a", " [", "[", "P", "II", ":", "CIT", "TA", ":", "1", "]]",
    ]:
        out += restorer.feed(chunk)
    out += restorer.flush()
    assert out == (
        "- nome Marco Rossi\n"
        "- cf RSSMRA80A01H501U\n"
        "- citta Torino"
    )


# --- ai_service: wrapper anonimizzazione provider esterni --------------------

import pytest  # noqa: E402
from backend.ai_service import AIService, AIError  # noqa: E402


class _FakeDB:
    """DB stub minimale: nessuna config, nessun budget, nessun log."""

    def query(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return []

    def scalar(self):
        return None


def _fake_provider(svc, name, fn):
    svc._providers[name] = {
        "call": fn, "stream": None, "call_max": None, "stream_max": None,
    }


def test_stream_response_external_anonymizes_and_restores():
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(False)
    try:
        svc = AIService(_FakeDB())
        seen = {}

        def fake_call(user_message, system_prompt, model, max_tokens=None, history=None):
            seen["user_message"] = user_message
            return "ok: " + user_message

        _fake_provider(svc, "deepseek", fake_call)
        cf = _make_valid_cf()
        out = list(svc.stream_response(
            user_message=f"il mio cf {cf}",
            system_prompt="sistema",
            mode="generic",
            provider="deepseek",
            model="x",
        ))
        text = "".join(i["text"] for i in out if i["type"] == "content")
        assert cf not in seen["user_message"]  # inviato anonimizzato
        assert cf in text                      # ripristinato nella risposta
        assert text == f"ok: il mio cf {cf}"
    finally:
        pii_ner.set_ner_enabled(prev)


def test_stream_response_local_provider_untouched():
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(False)
    try:
        svc = AIService(_FakeDB())
        seen = {}

        def fake_call(user_message, system_prompt, model, max_tokens=None, history=None):
            seen["user_message"] = user_message
            return user_message

        _fake_provider(svc, "ollama", fake_call)
        cf = _make_valid_cf()
        list(svc.stream_response(
            user_message=f"il mio cf {cf}",
            system_prompt="sistema",
            mode="generic",
            provider="ollama",
            model="x",
        ))
        assert seen["user_message"] == f"il mio cf {cf}"
    finally:
        pii_ner.set_ner_enabled(prev)


def test_stream_response_external_block_when_ner_down(monkeypatch):
    def broken_entities(text, base_url, model):
        raise httpx.ConnectError("connection refused")
    monkeypatch.setattr(pii_ner, "_ner_entities", broken_entities)
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(True)
    try:
        svc = AIService(_FakeDB())  # default fallback = block
        _fake_provider(svc, "deepseek", lambda *a, **k: "x")
        with pytest.raises(AIError):
            list(svc.stream_response(
                user_message="messaggio qualsiasi",
                system_prompt="sistema",
                mode="generic",
                provider="deepseek",
                model="x",
            ))
    finally:
        pii_ner.set_ner_enabled(prev)


def test_stream_response_external_send_raw_when_ner_down(monkeypatch):
    def broken_entities(text, base_url, model):
        raise httpx.ConnectError("connection refused")
    monkeypatch.setattr(pii_ner, "_ner_entities", broken_entities)
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(True)
    try:
        svc = AIService(_FakeDB())
        svc.external_pii_fallback = "send_raw"
        seen = {}

        def fake_call(user_message, system_prompt, model, max_tokens=None, history=None):
            seen["user_message"] = user_message
            return user_message

        _fake_provider(svc, "deepseek", fake_call)
        out = list(svc.stream_response(
            user_message="messaggio qualsiasi",
            system_prompt="sistema",
            mode="generic",
            provider="deepseek",
            model="x",
        ))
        assert "".join(i["text"] for i in out if i["type"] == "content") == "messaggio qualsiasi"
        assert seen["user_message"] == "messaggio qualsiasi"
    finally:
        pii_ner.set_ner_enabled(prev)


def test_call_model_external_anonymizes_and_restores():
    prev = pii_ner.is_ner_enabled()
    pii_ner.set_ner_enabled(False)
    try:
        svc = AIService(_FakeDB())
        seen = {}

        def fake_call(user_message, system_prompt, model, max_tokens=None, history=None):
            seen["user_message"] = user_message
            return "risposta su " + user_message

        _fake_provider(svc, "deepseek", fake_call)
        cf = _make_valid_cf()
        result = svc.call_model("deepseek", "x", f"cf {cf}", "sistema")
        assert cf not in seen["user_message"]
        assert result == f"risposta su cf {cf}"
    finally:
        pii_ner.set_ner_enabled(prev)
