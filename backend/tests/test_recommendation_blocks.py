from backend.recommendation_blocks import extract, strip_for_display, build_directive, retain_visible


def test_candidates_are_not_recommendations_and_negative_mentions_do_not_count():
    for text in ('Prima dimmi cosa stai cercando.', 'Non ti consiglio Il libro della prova.'):
        cleaned, ids = extract(text, readings={'book': 'Il libro della prova'})
        assert cleaned == text
        assert ids == {'reading': [], 'strategy': []}


def test_only_explicit_whitelisted_ids_are_saved():
    text = 'Prova il recupero attivo.\n```recommendations\n{"reading":["foreign"],"strategy":["active","foreign","active"]}\n```'
    cleaned, ids = extract(text, readings={'book': 'Il libro della prova'}, strategies={'active': 'Recupero attivo'})
    assert cleaned == 'Prova il recupero attivo.'
    assert ids == {'reading': [], 'strategy': ['active']}


def test_private_metadata_never_flashes_at_any_stream_boundary():
    prefix = 'Una proposta utile.\n'
    raw = prefix + '```recommendations\n{"reading":["book"],"strategy":[]}\n```'
    for end in range(len(prefix), len(raw) + 1):
        visible = strip_for_display(raw[:end])
        assert visible.strip() == prefix.strip()
    assert strip_for_display('Un esempio:\n```python\nprint(1)\n```').endswith('```')


def test_incomplete_or_malformed_blocks_are_hidden_without_phantom_items():
    for suffix in ('```recommendations\n{bad', '```recommendations\n{"reading": ["book"]', '```Recommendations\nnot json\n```', '```recomm'):
        cleaned, ids = extract('Risposta.\n' + suffix, readings={'book': 'Il libro della prova'})
        assert cleaned == 'Risposta.'
        assert ids == {'reading': [], 'strategy': []}


def test_valid_json_at_truncated_closing_fence_is_recovered():
    cleaned, ids = extract('Risposta.\n```recommendations\n{"reading":["book"]}', readings={'book':'Libro'})
    assert cleaned == 'Risposta.' and ids['reading'] == ['book']


def test_directive_is_absent_without_candidates():
    assert build_directive({}, {}) == ''


def test_length_cut_does_not_record_a_proposal_the_student_cannot_see():
    from backend.chat_logic import _limit_visible_words

    raw = 'Prova il **recupero attivo**. ' + 'Contesto. ' * 400 + 'Leggi Libro finale.\n```recommendations\n{"reading":["book"],"strategy":["active"]}\n```'
    readings, strategies = {'book': 'Libro finale'}, {'active': 'Recupero attivo'}
    text, selected = extract(raw, readings=readings, strategies=strategies)
    visible, truncated = _limit_visible_words(text, 'short')
    assert truncated
    assert retain_visible(selected, visible, readings=readings, strategies=strategies) == {'reading': [], 'strategy': ['active']}


def test_notes_require_visible_text_and_respect_advice_gate():
    import json
    from backend.recommendation_blocks import extract_notes
    question = "Quale episodio ti viene in mente?"
    advice = "Riserva dieci minuti al progetto."
    raw = question + " " + advice + '\n```recommendations\n' + json.dumps({"notes": [
        {"kind": "question", "text": question}, {"kind": "advice", "text": advice},
    ]}) + '\n```'
    visible = question + " " + advice
    assert [x['kind'] for x in extract_notes(raw, visible, advice_allowed=True)] == ['question', 'advice']
    assert [x['kind'] for x in extract_notes(raw, visible, advice_allowed=False)] == ['question']
    assert extract_notes(raw, 'Testo tagliato.', advice_allowed=True) == []
    assert extract_notes('```recommendations\n{bad\n```', visible, advice_allowed=True) == []
    assert extract_notes(raw, visible, advice_allowed=True)[0]['slug'] == extract_notes(raw, visible, advice_allowed=False)[0]['slug']


def test_real_model_json_fence_does_not_leak_or_lose_notes():
    import json
    from backend.recommendation_blocks import extract_notes
    question = 'Quale episodio ti viene in mente?'
    prefix = question + '\n'
    raw = prefix + '```json\n' + json.dumps({'reading': [], 'strategy': [], 'notes': [{'kind': 'question', 'text': question}]}) + '\n```'
    for end in range(len(prefix), len(raw) + 1):
        assert strip_for_display(raw[:end]).strip() == question
    visible, _ = extract(raw)
    assert visible == question
    assert extract_notes(raw, visible, advice_allowed=False)[0]['name'] == question
    ordinary = 'Esempio:\n```json\n{"name": "Ada", "year": 2026}\n```'
    assert strip_for_display(ordinary) == ordinary
    assert extract(ordinary)[0] == ordinary
