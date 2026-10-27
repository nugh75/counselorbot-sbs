from backend.chat_markdown import normalize_chat_markdown
from backend.recommendation_blocks import extract, extract_notes, strip_for_display


def test_runaway_qpcc_separator_is_bounded_without_changing_the_profile():
    prefix = '| Fattore | Valore | Lettura |\n'
    suffix = '\n| A1 | 5 | Un esempio. |\n\nUna domanda finale?'
    raw = prefix + '| :------- | -------: | :' + '-' * 53776 + '</small>\n' + suffix
    expected = prefix + '| :--- | ---: | :--- |\n' + suffix
    assert normalize_chat_markdown(raw) == expected
    assert normalize_chat_markdown(expected) == expected


def test_public_code_and_visible_small_contents_are_preserved():
    for text in ('```html\n<small>test</small>\n```', '```text\n| X | Y |\n| ----- | ----- |\n```',
                 '---\nUna pausa.', '2 - 3 = -1', 'Il tag `<small>` rimane codice.', '<small-box>Una parola.</small-box>'):
        assert normalize_chat_markdown(text) == text
    assert normalize_chat_markdown('<small>Un dettaglio leggibile.</small>') == 'Un dettaglio leggibile.'


def test_wrapped_json_stays_private_at_every_stream_boundary_and_retains_notes():
    import json
    question = 'Quale episodio ti viene in mente?'
    prefix = question + '\n'
    body = {'recommendations': {'reading': ['book', 'foreign'], 'strategy': [],
                               'notes': [{'kind': 'question', 'text': question}]}}
    raw = prefix + '```json\n' + json.dumps(body) + '\n```'
    for end in range(len(prefix), len(raw) + 1):
        assert strip_for_display(raw[:end]).strip() == question
    visible, selected = extract(raw, readings={'book': 'Libro sintetico'})
    assert visible == question and selected['reading'] == ['book']
    assert extract_notes(raw, visible, advice_allowed=False)[0]['name'] == question
    public = '```json\n{"recommendations":{"public":true},"title":"Example"}\n```'
    assert extract(public)[0] == public


def test_xml_recommendation_blocks_do_not_leak_or_lose_notes():
    raw = 'Risposta.\n<recommendations>{"notes":[]}</recommendations>\nDopo.'
    prefix = "Risposta.\n"
    block = raw.removesuffix("\nDopo.")
    for end in range(len(prefix), len(block) + 1):
        assert strip_for_display(block[:end]).strip() == prefix.strip()
    mixed = 'Risposta.\n<recommendations>{"notes":[]\n```recommendations\n{broken'
    assert strip_for_display(mixed) == "Risposta."
    assert extract(mixed)[0] == "Risposta."
    assert extract(raw)[0] == 'Risposta.\n\nDopo.'
    assert strip_for_display('Risposta.\n<recommendations>{"notes":') == 'Risposta.'
