import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { readingText } from './i18n-reading.ts';

test('the reading card has a complete six-language label set', () => {
    const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];
    const keys = ['title', 'strengths', 'growth', 'note', 'toGoal', 'born', 'save', 'saved'] as const;
    for (const key of keys) {
        for (const lang of languages) {
            const label = readingText(lang, key);
            assert.equal(typeof label, 'string', `${key}/${lang}`);
            assert.ok(label.length > 0, `${key}/${lang} is empty`);
            // The Italian string never leaks into the other languages.
            if (lang !== 'it') assert.notEqual(label, readingText('it', key), `${key}/${lang} falls back to Italian`);
        }
    }
});

test('the Italian anchors match the plan brief verbatim', () => {
    assert.equal(readingText('it', 'title'), 'La mia lettura');
    assert.equal(readingText('it', 'strengths'), 'Punti di forza da valorizzare');
    assert.equal(readingText('it', 'growth'), 'Da far crescere');
    assert.equal(readingText('it', 'note'), 'Cosa mi dice di me');
    assert.equal(readingText('it', 'toGoal'), '→ Rendi obiettivo');
    assert.equal(readingText('it', 'born'), 'Obiettivi nati da qui');
});

test('the English anchors match the plan brief', () => {
    assert.equal(readingText('en', 'title'), 'My reading');
    assert.equal(readingText('en', 'toGoal'), '→ Make it a goal');
    assert.equal(readingText('en', 'born'), 'Goals born from here');
});
