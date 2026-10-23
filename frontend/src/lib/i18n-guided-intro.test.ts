import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { guidedIntroText } from './i18n-guided-intro.ts';

test('the guided intro has a complete six-language label set', () => {
    const keys = ['title', 'purpose', 'steps', 'deepen', 'buttonsDesktop', 'buttonsMobile', 'dismiss'] as const;
    for (const key of keys) {
        for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
            const label = guidedIntroText(lang, key);
            assert.ok(label && label.length > 0, `${key}/${lang} is empty`);
            if (lang !== 'it') assert.notEqual(label, guidedIntroText('it', key), `${key}/${lang} falls back to Italian`);
        }
    }
});
