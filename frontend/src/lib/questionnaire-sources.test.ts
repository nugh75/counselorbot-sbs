import assert from 'node:assert/strict';
import test from 'node:test';

// Node's built-in TypeScript runner requires the explicit extension; the app's
// bundler configuration intentionally does not enable TS extension imports.
// @ts-expect-error -- executed directly by `node --test`.
import { questionnaireSource } from './questionnaire-sources.ts';

test('Italian sends the student to the external site, with the site credentials', () => {
    const source = questionnaireSource('QSA', 'it');
    assert.equal(source?.kind, 'external');
    assert.equal(source?.href, 'https://www.competenzestrategiche.it/QSA/');
    assert.equal(source?.code, '1087');
    assert.equal(source?.password, 'counselor');
});

test('the other five languages fill the questionnaire in, in app', () => {
    for (const lang of ['en', 'es', 'fr', 'de', 'sv']) {
        const source = questionnaireSource('QSA', lang);
        assert.equal(source?.kind, 'in-app');
        assert.equal(source?.href, `/somministrazione/QSA/${lang}`);
    }
});

test('agent-led tools have nothing to fill in beforehand', () => {
    // Le credenziali valgono solo per il ramo italiano, e SAVICKAS e IDEA non
    // sono questionari: non devono offrire nessuna sorgente, in nessuna lingua.
    for (const id of ['SAVICKAS', 'IDEA']) {
        assert.equal(questionnaireSource(id, 'it'), null);
        assert.equal(questionnaireSource(id, 'en'), null);
    }
});

test('an unknown instrument has no source', () => {
    assert.equal(questionnaireSource('NOPE', 'it'), null);
    assert.equal(questionnaireSource('NOPE', 'en'), null);
});
