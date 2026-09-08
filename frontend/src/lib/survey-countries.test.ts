import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { surveyCountries } from './survey-countries.ts';

test('all languages offer every country with translated and sorted labels', () => {
    const expected = surveyCountries('it').map(country => country.value).sort();
    assert.equal(expected.length, 250);
    assert.equal(new Set(expected).size, 250);
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
        const countries = surveyCountries(lang);
        assert.deepEqual(countries.map(country => country.value).sort(), expected);
        assert.ok(countries.every((country, i) => i === 0 || countries[i - 1].label.localeCompare(country.label, lang) <= 0));
        for (const value of ['Brasile', 'Giappone', 'Nigeria', 'Italia', 'Svezia', 'Regno Unito (Inghilterra)', 'Spagna', 'Francia', 'Germania']) {
            assert.ok(countries.some(country => country.value === value), value);
        }
    }
    assert.equal(surveyCountries('en').find(country => country.value === 'Giappone')?.label, 'Japan');
});
