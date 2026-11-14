import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { barPercent, classNoticingQuery, parseClassNoticing } from './class-noticing.ts';

const payload = {
    status: 'ready', generated_at: null, instruments: ['QSA'], suggestions: ['Routine', '', 3],
    charts: { kinds: { revisit: 1, resource: 0, difficulty: 2, attention: 0 }, students: 4, students_with_sources: 3 },
    students: [
        { username: 'a', status: 'ready', items: [], pending_chunks: [], total_chunks: 1, source_count: 3, source_counts: {} },
        { username: 'b', status: 'missing', items: [], pending_chunks: ['a'.repeat(64)], total_chunks: 1, source_count: 2, source_counts: {} },
    ],
    themes: [{ title: 'Distrazioni', kind: 'difficulty', suggestion: '', student_count: 2, students: [] }, { title: 'No', kind: 'other', students: [] }],
};

test('class noticing keeps current members and verified themes', () => {
    const data = parseClassNoticing(payload);
    assert.deepEqual(data.students.map((row: { username: string }) => row.username), ['a', 'b']);
    assert.deepEqual(data.themes.map((theme: { title: string }) => theme.title), ['Distrazioni']);
    assert.deepEqual(data.suggestions, ['Routine']);
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
