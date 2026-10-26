import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { barPercent, classNoticingQuery, parseClassNoticing, pendingCompilations } from './class-noticing.js';

const payload = {
    status: 'ready', generated_at: null, instruments: ['QSA'], suggestions: ['Routine', '', 3],
    charts: { kinds: { revisit: 1, resource: 0, difficulty: 2, attention: 0 }, students: 4, students_with_chat: 3 },
    compilations: [
        { id: 1, username: 'a', status: 'ready' }, { id: 2, username: 'b', status: 'missing' },
        { id: 3, username: 'c', status: 'stale' }, { id: 4, username: 'd', status: 'empty' }, { id: 'x', username: 'e', status: 'ready' },
    ],
    themes: [{ title: 'Distrazioni', kind: 'difficulty', suggestion: '', student_count: 2, students: [] }, { title: 'No', kind: 'other', students: [] }],
};

test('class noticing keeps valid rows and lists compilations still to analyse', () => {
    const data = parseClassNoticing(payload);
    assert.deepEqual(data.compilations.map((row: { id: number }) => row.id), [1, 2, 3, 4]);
    assert.deepEqual(data.themes.map((theme: { title: string }) => theme.title), ['Distrazioni']);
    assert.deepEqual(data.suggestions, ['Routine']);
    assert.deepEqual(pendingCompilations(data).map((row: { id: number }) => row.id), [2, 3]);
    assert.throws(() => parseClassNoticing({ ...payload, charts: null }));
    assert.throws(() => parseClassNoticing({ ...payload, status: 'other' }));
});

test('bars and filters', () => {
    assert.equal(barPercent(2, 3), 67);
    assert.equal(barPercent(1, 0), 0);
    assert.equal(barPercent(5, 3), 100);
    assert.equal(classNoticingQuery('it', '', 0), 'lang=it');
    assert.equal(classNoticingQuery('en', 'QSA', 30), 'lang=en&instrument=QSA&days=30');
});
