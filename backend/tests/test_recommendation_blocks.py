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


def test_notes_listed_directly_under_recommendations_do_not_leak():
    # Shape seen in production (Gemini 2.5 Flash): the notes array sits
    # directly under "recommendations" inside a ```json fence.
    import json
    from backend.recommendation_blocks import extract_notes
    question = 'Che cosa fai quando la concentrazione cala?'
    reading = 'Forse conosci bene i tuoi obiettivi ma fatichi a mantenerli.'
    prefix = reading + ' ' + question + '\n'
    raw = prefix + '```json\n' + json.dumps({'recommendations': [
        {'kind': 'hypothesis', 'lens': 'C1', 'text': reading},
        {'kind': 'question', 'text': question},
    ]}) + '\n```'
    for end in range(len(prefix), len(raw) + 1):
        assert strip_for_display(raw[:end]).strip() == prefix.strip()
    visible, selected = extract(raw)
    assert visible == prefix.strip()
    assert selected == {'reading': [], 'strategy': []}
    notes = extract_notes(raw, visible, advice_allowed=False, hypothesis_allowed=True)
    assert [note['kind'] for note in notes] == ['hypothesis', 'question']
    ordinary = 'Esempio:\n```json\n{"recommendations": ["leggi di piu"]}\n```'
    assert extract(ordinary)[0] == ordinary


# Shape seen in production (Gemini 2.5 Flash, QSAr factor step, continuation
# turn): the reply in prose, then the same reply again inside a bare
# {"answer", "recommendations"} object with no fence.
ENVELOPE_TEXT = ('Ora vediamo i Fattori Affettivi del tuo profilo QSAr.\n\n'
                 'Poi c\'è Volizione, con un punteggio di 7 su 9, che indica una tua "Forza". '
                 'Questi sono i tuoi Fattori Affettivi.')


def _envelope(answer, recommendations):
    import json
    return json.dumps({'answer': answer, 'recommendations': recommendations}, ensure_ascii=False)


def test_bare_answer_envelope_after_the_same_text_never_reaches_the_student():
    raw = ENVELOPE_TEXT + _envelope(ENVELOPE_TEXT, [])
    for end in range(len(ENVELOPE_TEXT), len(raw) + 1):
        visible = strip_for_display(raw[:end])
        assert visible == ENVELOPE_TEXT, raw[:end][-40:]
    assert extract(raw) == (ENVELOPE_TEXT, {'reading': [], 'strategy': []})


def test_answer_envelope_alone_streams_its_answer_only():
    raw = _envelope(ENVELOPE_TEXT, [])
    for end in range(len(raw) + 1):
        visible = strip_for_display(raw[:end])
        assert ENVELOPE_TEXT.startswith(visible), raw[:end][-40:]
        assert '{' not in visible and '"answer"' not in visible
    assert strip_for_display(raw) == ENVELOPE_TEXT
    assert extract('```json\n' + raw + '\n```')[0] == ENVELOPE_TEXT


def test_answer_envelope_keeps_a_continuation_suffix():
    head = 'Studia ogni giorno e'
    assert extract(head + _envelope(' verifica i progressi.', []))[0] == head + ' verifica i progressi.'


def test_answer_envelope_recommendations_are_recorded_within_the_catalogue():
    readings = {'book': 'Il libro della prova'}
    strategies = {'active': 'Recupero attivo'}
    text = 'Prova il Recupero attivo e leggi Il libro della prova.'
    for recommendations, expected in (
        ({'reading': ['book'], 'strategy': ['active', 'foreign']}, {'reading': ['book'], 'strategy': ['active']}),
        (['active', 'book', 'foreign'], {'reading': ['book'], 'strategy': ['active']}),
        ([{'id': 'active'}, {'slug': 'book'}], {'reading': ['book'], 'strategy': ['active']}),
        ([], {'reading': [], 'strategy': []}),
    ):
        visible, selected = extract(text + '\n' + _envelope(text, recommendations),
                                    readings=readings, strategies=strategies)
        assert visible == text
        assert selected == expected


def test_ordinary_json_and_braces_stay_visible():
    for text in ('Usa la formula {a + b}.', 'Esempio:\n```json\n{"name": "Ada"}\n```', 'Un insieme {1, 2}'):
        assert strip_for_display(text) == text
        assert extract(text)[0] == text


# Shape seen in production (Gemini 2.5 Flash, QPCC step opening in voice mode):
# the private block arrives first, as bare JSON or in a fence with no label.
STEP_OPENING_TEXT = ("Con un'auto-percezione di 7 su 9 per l'**A1 (Ansia di parlare in pubblico)**, "
                     "potresti descrivere cosa fai quando senti che il disagio sale?")


def test_bare_recommendations_json_at_the_start_never_reaches_the_student():
    block = '{\n "recommendations": []\n}'
    for raw in ('\n' + block + '\n\n' + STEP_OPENING_TEXT,
                '```\n' + block + '\n```\n' + STEP_OPENING_TEXT,
                '```json\n' + block + '\n```\n' + STEP_OPENING_TEXT,
                STEP_OPENING_TEXT + '\n' + block):
        for end in range(len(raw) + 1):
            visible = strip_for_display(raw[:end])
            assert 'recommendations' not in visible and '{' not in visible, raw[:end][-40:]
            assert '`' not in visible, raw[:end][-40:]
        assert extract(raw) == (STEP_OPENING_TEXT, {'reading': [], 'strategy': []})


def test_bare_recommendations_are_still_recorded():
    import json
    from backend.recommendation_blocks import extract_notes
    hypothesis = 'Sembra che il tuo senso di inadeguatezza emerga quando ti senti valutato.'
    text = hypothesis + ' Come si manifesta nel lavoro?'
    note = {'kind': 'hypothesis', 'lens': 'A3', 'text': hypothesis}
    for recommendations in ([note], note):
        raw = json.dumps({'recommendations': recommendations}, indent=1) + '\n' + text
        visible, _ = extract(raw)
        assert visible == text
        notes = extract_notes(raw, visible, advice_allowed=False, hypothesis_allowed=True)
        assert [(n['kind'], n['lens']) for n in notes] == [('hypothesis', 'A3')]
    raw = '{"reading": ["book"], "strategy": []}\nLeggi Il libro della prova.'
    assert extract(raw, readings={'book': 'Il libro della prova'}) == (
        'Leggi Il libro della prova.', {'reading': ['book'], 'strategy': []})


def test_ordinary_bare_json_and_unlabelled_code_stay_visible():
    for text in ('Il formato è {"name": "Ada"} e basta.', 'Codice:\n```\nprint(1)\n```',
                 'Esempio:\n```\n{"name": "Ada"}\n```'):
        assert strip_for_display(text) == text
        assert extract(text)[0] == text
