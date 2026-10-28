import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { parseDraft, parseRecommendationDoc, parseRecommendationList } from './orientation-recommendation.ts';

test('the recommendation list keeps only valid rows and tolerates documents starting empty', () => {
    const rows = parseRecommendationList([
        { username: 'alice', display_name: 'Alice', status: 'final', revision: 3, ai_draft_used: true },
        { username: 'bob', display_name: 'Bob', status: null, revision: 0, ai_draft_used: false },
        { username: 7 },
        null,
    ]);
    assert.deepEqual(rows.map(row => row.username), ['alice', 'bob']);
    assert.throws(() => parseRecommendationList({}));
    assert.throws(() => parseRecommendationList('no'));
});

test('the single document parser requires content and the class name', () => {
    const doc = parseRecommendationDoc({
        group_id: 5, username: 'alice', display_name: 'Alice', group_name: '3B',
        content: 'Parere', status: 'draft', revision: 1, ai_draft_used: false,
        updated_by: null, final_at: null, created_at: null, updated_at: null,
    });
    assert.equal(doc.status, 'draft');
    assert.throws(() => parseRecommendationDoc({ content: 'x', group_name: 3 }));
    assert.throws(() => parseRecommendationDoc({ content: 5, group_name: '3B' }));
    assert.throws(() => parseRecommendationDoc(null));
});

test('an AI draft is a non-empty model proposal string', () => {
    assert.equal(parseDraft({ draft: ' Prima bozza ' }), ' Prima bozza ');
    assert.throws(() => parseDraft({ draft: '   ' }));
    assert.throws(() => parseDraft({}));
});

test('the six-language texts cover the tab, the statuses and the PDF download', () => {
    const source = readFileSync(new URL('./i18n-orientation-rec.ts', import.meta.url), 'utf8');
    assert.match(source, /satisfies Record<string, Localized>/);
    for (const key of ['title', 'intro', 'statusDraft', 'statusFinal', 'generate', 'download', 'internalBadge']) {
        assert.match(source, new RegExp(`${key}: \\[`), key);
    }
    const settings = readFileSync(new URL('./i18n-class-settings.ts', import.meta.url), 'utf8');
    assert.match(settings, /orientation: \['Consiglio orientativo', 'Guidance recommendation'/);
});
