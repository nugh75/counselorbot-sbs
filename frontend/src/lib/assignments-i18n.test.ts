import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { assignmentText } from './i18n-assignments.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { teacherAreaName } from './i18n-teacher-area.ts';

const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;

// #143: the sent list is named in the singular; the teacher area entry and page
// are plural, since a teacher sends more than one assignment (owner, 2026-10-10).
const singular = {
    it: 'Assegnazione', en: 'Assignment', es: 'Asignación',
    fr: 'Attribution', de: 'Zuweisung', sv: 'Tilldelning',
} as const;
const plural = {
    it: 'Assegnazioni', en: 'Assignments', es: 'Asignaciones',
    fr: 'Attributions', de: 'Zuweisungen', sv: 'Tilldelningar',
} as const;

test('the teacher assignment entry is plural and the sent list singular in all six languages', () => {
    for (const lang of languages) {
        assert.equal(assignmentText(lang, 'sent'), singular[lang], `sent/${lang}`);
        assert.equal(teacherAreaName(lang, 'assegnazioni'), plural[lang], `nav/${lang}`);
    }
});

test('the student label stays plural and distinct from the teacher page', () => {
    assert.equal(assignmentText('it', 'received'), 'Assegnazioni ricevute');
    for (const lang of languages) {
        assert.notEqual(assignmentText(lang, 'received'), assignmentText(lang, 'sent'), `received/${lang}`);
    }
});

test('the new assignment flow exposes complete labels in all six languages', () => {
    for (const key of ['newAssignment', 'chooseGoal', 'attachments'] as const) {
        for (const lang of languages) {
            const label = assignmentText(lang, key);
            assert.ok(label.length > 0, `${key}/${lang} is empty`);
            if (lang !== 'it') assert.notEqual(label, assignmentText('it', key), `${key}/${lang} falls back to Italian`);
        }
    }
});
