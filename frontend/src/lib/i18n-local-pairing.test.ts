import assert from 'node:assert/strict';
import test from 'node:test';
import { localPairingText, localPairingTexts } from './i18n-local-pairing.ts';

test('local pairing labels are complete in all six languages', () => {
    for (const [key, translations] of Object.entries(localPairingTexts)) {
        assert.equal(translations.length, 6, key);
        for (const [index, lang] of ['it', 'en', 'es', 'fr', 'de', 'sv'].entries()) {
            const label = localPairingText(lang, key as keyof typeof localPairingTexts);
            assert.equal(label, translations[index]);
            assert.ok(label.trim().length > 0, `${key}/${lang} is empty`);
        }
    }
});

test('local pairing labels interpolate values and fall back to English', () => {
    assert.equal(localPairingText('it', 'activeBody', { pseudonym: 'Luna' }), 'Sei entrato come Luna. La sessione è personale e il docente può revocare il dispositivo.');
    assert.equal(localPairingText('unknown', 'rateLimited', { seconds: 15 }), 'Too many attempts. Wait 15 seconds before trying again.');
});
