import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { councilErrorKey, councilPath, matchesStudent, parseCouncilLinks, submissionText } from './class-council.ts';

test('council links keep valid rows only and never expect a stored password', () => {
    const rows = parseCouncilLinks([
        { id: 1, token: 'abc', expires_at: '2026-11-01T00:00:00+00:00', state: 'active', revoked_at: null },
        { id: 2, token: 'def', state: 'unknown' },
        null,
    ]);
    assert.deepEqual(rows.map((row: { id: number }) => row.id), [1]);
    assert.throws(() => parseCouncilLinks({}));
    assert.equal(councilPath('a b/c'), '/consiglio/a%20b%2Fc');
});

test('overview errors map to distinct messages', () => {
    assert.equal(councilErrorKey(403), 'wrongPassword');
    assert.equal(councilErrorKey(429), 'locked');
    assert.equal(councilErrorKey(404), 'unavailable');
    assert.equal(councilErrorKey(500), 'networkError');
});

test('a shared submission reads as its text and the chosen portfolio preview', () => {
    assert.equal(submissionText({ text: 'My plan', portfolio: { title: 'Map', description: 'Week 1' } }), 'My plan\n\nMap\n\nWeek 1');
    assert.equal(submissionText({ text: '' }), '');
    assert.equal(submissionText(null), '');
});

test('student search matches display name or username', () => {
    const student = { username: 'alice', display_name: 'Alice Rossi', plans: [], results: [], assignments: [], goals: [] };
    assert.equal(matchesStudent(student, 'ross'), true);
    assert.equal(matchesStudent(student, 'ALI'), true);
    assert.equal(matchesStudent(student, 'bob'), false);
    assert.equal(matchesStudent(student, '  '), true);
});

test('council texts exist in the six languages', () => {
    const source = readFileSync(new URL('./i18n-class-council.ts', import.meta.url), 'utf8');
    assert.match(source, /satisfies Record<string, Localized>/);
    const settings = readFileSync(new URL('./i18n-class-settings.ts', import.meta.url), 'utf8');
    assert.match(settings, /council: \['Consiglio di classe', 'Class council'/);
});
