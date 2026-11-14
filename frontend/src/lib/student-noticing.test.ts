import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { parseAdvice, parseStudentNoticing, SOURCE_KINDS } from './student-noticing.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { journeyText } from './i18n-journey-noticing.ts';

test('all source kinds are named in six languages and authors stay distinct', () => {
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
        for (const key of [...SOURCE_KINDS, 'student', 'teacher', 'saved_work', 'record', 'advice', 'validate'] as const) {
            assert.ok(journeyText(lang, key).trim());
        }
        assert.notEqual(journeyText(lang, 'student'), journeyText(lang, 'record'));
    }
});

test('student noticing rejects invalid coverage and drops unsupported evidence', () => {
    const source = { id: 'notebook', kind: 'notebook', author: 'student', quote: 'Progetto un laboratorio' };
    const data = { username: 'student', status: 'ready', source_count: 1, source_counts: { notebook: 1 }, total_chunks: 1, pending_chunks: [],
        items: [{ id: 'a', kind: 'resource', text: 'Una risorsa', evidence: [source] },
            { id: 'b', kind: 'resource', text: 'Fonte inventata', evidence: [{ ...source, kind: 'unknown' }] }] };
    assert.deepEqual(parseStudentNoticing(data).items.map((item: { id: string }) => item.id), ['a']);
    assert.throws(() => parseStudentNoticing({ ...data, pending_chunks: ['invalid'] }));
    assert.throws(() => parseStudentNoticing({ ...data, status: 'other' }));
    assert.throws(() => parseStudentNoticing({ ...data, source_count: -1 }));
});

test('an orientation document requires a supported revision and state', () => {
    assert.equal(parseAdvice({ revision: 1, text: 'Bozza', state: 'draft', stale: false }).state, 'draft');
    assert.throws(() => parseAdvice({ revision: '1', text: 'Bozza', state: 'draft' }));
    assert.throws(() => parseAdvice({ revision: 1, text: 'Bozza', state: 'automatic-approved' }));
});
