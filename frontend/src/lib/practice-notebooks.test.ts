import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { PRACTICE_NOTEBOOK_FIELDS, generatePracticeScores, parsePracticeNotebooks, parsePracticeResults, practiceNotebookBody, practiceResultChatHref, practiceNotebookChatHref, parsePracticeEntry, practiceNotebookHref, practiceNotebookIdFromHash, practiceToolEntry } from './practice-notebooks.ts';

test('i campi coincidono con quelli che il server porta nel prompt', () => {
    assert.deepEqual(
        PRACTICE_NOTEBOOK_FIELDS.map((field: { key: string }) => field.key),
        ['age', 'gender', 'school_class', 'school_year', 'context', 'goal', 'main_difficulty', 'strengths', 'weaknesses', 'notes'],
    );
});

test('il corpo inviato è ripulito e limitato', () => {
    const body = practiceNotebookBody('  Giulia  ', { school_class: ' 3ª ', notes: '   ', strengths: 'x'.repeat(700) });
    assert.equal(body.title, 'Giulia');
    assert.deepEqual(Object.keys(body.data), ['school_class', 'strengths']);
    assert.equal(body.data.school_class, '3ª');
    assert.equal(body.data.strengths?.length, 600);
    assert.equal(practiceNotebookBody('y'.repeat(200), {}).title.length, 120);
});

test('la lista scarta righe malformate', () => {
    const rows = parsePracticeNotebooks([
        { id: 1, title: 'A', data: { goal: 'g' }, group_ids: [3, 'x', 4] },
        { id: 'x', title: 'B' },
        null,
        { id: 2, title: 'C', data: null },
    ]);
    assert.deepEqual(rows.map((row: { id: number }) => row.id), [1, 2]);
    assert.deepEqual(rows[0].group_ids, [3, 4]);
    assert.deepEqual(rows[1].data, {});
    assert.deepEqual(rows[1].group_ids, []);
    assert.deepEqual(parsePracticeNotebooks({}), []);
});

test('il profilo generato resta nella scala 1-9 e copre ogni fattore', () => {
    const codes = ['C1', 'C2', 'A1'];
    for (let i = 0; i < 200; i++) {
        const scores = generatePracticeScores(codes);
        assert.deepEqual(Object.keys(scores), codes);
        for (const value of Object.values(scores) as number[]) assert.ok(Number.isInteger(value) && value >= 1 && value <= 9);
    }
    // Estremi deterministici: due tiri minimi danno 1, due massimi 9.
    assert.deepEqual(generatePracticeScores(['X'], () => 0), { X: 1 });
    assert.deepEqual(generatePracticeScores(['X'], () => 0.999), { X: 9 });
});

test('il repertorio scarta righe malformate', () => {
    const rows = parsePracticeResults([
        { id: 1, notebook_id: 2, questionnaire_type: 'QSA', scores: { C1: 7 }, session_id: 's', source: 'manual' },
        { id: 2, questionnaire_type: 'QSA', scores: null },
        { id: 'x', questionnaire_type: 'QSA', scores: {} },
    ]);
    assert.deepEqual(rows.map((row: { id: number }) => row.id), [1]);
    assert.deepEqual(parsePracticeResults(null), []);
});

test('practice chat links identify the saved profile and notebook without scores', () => {
    assert.equal(practiceResultChatHref({ id: 91, notebook_id: 6, questionnaire_type: 'QAP', scores: { AD1: 9 }, session_id: 'original', source: 'manual' }), '/?start=QAP&practice_notebook_id=6&practice_result_id=91');
});

test('il link senza punteggi porta solo strumento e taccuino', () => {
    assert.equal(practiceNotebookChatHref(7, 'SAVICKAS'), '/?start=SAVICKAS&practice_notebook_id=7');
});

test('ingresso in prova: senza punteggi basta il taccuino, con punteggi serve il profilo', () => {
    assert.deepEqual(parsePracticeEntry('7', null, true), { notebookId: 7, resultId: null });
    assert.deepEqual(parsePracticeEntry('7', '3', false), { notebookId: 7, resultId: 3 });
    assert.equal(parsePracticeEntry('7', null, false), null);
});

test('ingresso in prova: parametri non validi vengono rifiutati', () => {
    assert.equal(parsePracticeEntry(null, null, true), null);
    assert.equal(parsePracticeEntry(null, '3', true), null);
    assert.equal(parsePracticeEntry('0', null, true), null);
    assert.equal(parsePracticeEntry('-2', null, true), null);
    assert.equal(parsePracticeEntry('abc', null, true), null);
    assert.equal(parsePracticeEntry('7', 'x', true), null);
    assert.equal(parsePracticeEntry('7', '0', false), null);
});

test('pagina dello studente di prova e vecchie ancore dell\'elenco', () => {
    assert.equal(practiceNotebookHref(4), '/docente/taccuini-prova/4');
    assert.equal(practiceNotebookIdFromHash('#practice-notebook-4'), 4);
    assert.equal(practiceNotebookIdFromHash('#practice-notebook-0'), null);
    assert.equal(practiceNotebookIdFromHash('#altro'), null);
    assert.equal(practiceNotebookIdFromHash(''), null);
});

test('avvia una chat: senza punteggi subito, questionari dal profilo o da uno nuovo', () => {
    const profile = (id: number, type: string) => ({ id, notebook_id: 4, questionnaire_type: type, scores: { C1: 5 }, session_id: 's', source: 'manual' as const });
    assert.deepEqual(practiceToolEntry(4, { id: 'SAVICKAS', agentOnly: true }, []), { kind: 'unscored', href: '/?start=SAVICKAS&practice_notebook_id=4' });
    assert.deepEqual(practiceToolEntry(4, { id: 'QSA' }, [profile(9, 'QSA'), profile(10, 'ZTPI')]), { kind: 'profile', href: '/?start=QSA&practice_notebook_id=4&practice_result_id=9' });
    assert.deepEqual(practiceToolEntry(4, { id: 'QSA' }, [profile(9, 'QSA'), profile(11, 'QSA')]), { kind: 'choose', href: '#practice-profiles', count: 2 });
    assert.deepEqual(practiceToolEntry(4, { id: 'QAP' }, []), { kind: 'new', href: '/docente/taccuini-prova/4?profilo=QAP#practice-profiles' });
    assert.equal(practiceToolEntry(4, { id: 'COMPETENZE' }, []), null);
});
