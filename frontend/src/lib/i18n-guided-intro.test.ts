import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { guidedIntroText, guideSectionFor } from './i18n-guided-intro.ts';

test('the guided intro has a complete six-language label set', () => {
    const keys = ['title', 'purpose', 'duration', 'todo', 'buttonsDesktop', 'buttonsMobile', 'close', 'openGuide', 'fullGuide', 'closeGuide', 'dismiss'] as const;
    for (const key of keys) {
        for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
            const label = guidedIntroText(lang, key);
            assert.ok(label && label.length > 0, `${key}/${lang} is empty`);
            if (lang !== 'it') assert.notEqual(label, guidedIntroText('it', key), `${key}/${lang} falls back to Italian`);
        }
    }
});

test('each guided chat opens the guide section that describes it', () => {
    assert.equal(guideSectionFor('EVENTO_STUDIO'), 10);
    assert.equal(guideSectionFor('EVENTO_PROFESSIONALE'), 11);
    assert.equal(guideSectionFor('OBIETTIVO_STUDIO'), 12);
    for (const type of ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP', 'SAVICKAS', 'IDEA', 'OBIETTIVO_DOCENZA']) {
        assert.equal(guideSectionFor(type), 7, type);
    }
});
