import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { PRACTICE_NOTEBOOK_FIELDS, parsePracticeNotebooks, practiceNotebookBody } from './practice-notebooks.ts';

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
        { id: 1, title: 'A', data: { goal: 'g' } },
        { id: 'x', title: 'B' },
        null,
        { id: 2, title: 'C', data: null },
    ]);
    assert.deepEqual(rows.map((row: { id: number }) => row.id), [1, 2]);
    assert.deepEqual(rows[1].data, {});
    assert.deepEqual(parsePracticeNotebooks({}), []);
});
