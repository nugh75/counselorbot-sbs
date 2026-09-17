"""Blocco privato con cui la sintesi dell'Evento significativo precompila il libretto."""
from backend import event_booklet

BLOCK = (
    "```booklet\n"
    '{"title": "La lezione sulle frazioni", "event_date": "2026-03-12", "role": "observer",'
    ' "context": "Tirocinio, seconda media", "worked": ["La tutor ha usato esempi concreti"],'
    ' "did_not_work": ["Poco tempo per le domande", ""], "reading": "Conta il tempo lasciato all\'errore",'
    ' "try": "Lasciare cinque minuti di domande", "how_when": "Alla prossima lezione, giovedi"}\n'
    "```"
)


def test_a_complete_block_leaves_the_reply_and_fills_the_booklet_fields():
    text = "Ecco la sintesi del percorso.\n\n" + BLOCK + "\n[[AVANZA_STEP]]"
    cleaned, draft = event_booklet.extract(text)

    assert "```booklet" not in cleaned
    assert cleaned.startswith("Ecco la sintesi del percorso.")
    assert "[[AVANZA_STEP]]" in cleaned
    assert draft == {
        "title": "La lezione sulle frazioni",
        "bio_date": "2026-03-12",
        "event_role": "observer",
        "bio_context": "Tirocinio, seconda media",
        "strength": ["La tutor ha usato esempi concreti"],
        "growth_area": ["Poco tempo per le domande"],
        "discovery": "Conta il tempo lasciato all'errore",
        "objective": "Lasciare cinque minuti di domande",
        "strategy": "Alla prossima lezione, giovedi",
    }


def test_an_unreadable_block_is_removed_and_proposes_nothing():
    cleaned, draft = event_booklet.extract("Sintesi.\n```booklet\n{not json\n```")
    assert cleaned == "Sintesi."
    assert draft is None


def test_values_outside_the_contract_are_dropped_not_guessed():
    block = '```booklet\n{"title": "Riunione", "event_date": "marzo", "role": "boss", "worked": "non una lista"}\n```'
    _, draft = event_booklet.extract(block)
    assert draft["title"] == "Riunione"
    assert draft["bio_date"] == ""
    assert draft["event_role"] == ""
    assert draft["strength"] == []


def test_a_block_still_streaming_never_reaches_the_screen():
    assert event_booklet.strip_for_display("Sintesi.\n```booklet\n{\"title\": \"Riu") == "Sintesi."
    assert event_booklet.strip_for_display("Sintesi.\n```book") == "Sintesi."
    assert event_booklet.strip_for_display("Sintesi senza blocco.") == "Sintesi senza blocco."


def test_long_values_are_capped():
    block = '```booklet\n{"reading": "' + "a" * 5000 + '", "worked": [' + ",".join(['"x"'] * 20) + "]}\n```"
    _, draft = event_booklet.extract(block)
    assert len(draft["discovery"]) == event_booklet.MAX_TEXT
    assert len(draft["strength"]) == event_booklet.MAX_ITEMS
