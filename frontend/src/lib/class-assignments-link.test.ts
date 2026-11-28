import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classSettingsTexts } from './i18n-class-settings.ts';

// F31: the class page links to /docente/assegnazioni filtered on the class,
// without bringing back the inline list removed with b49d1548.
const source = readFileSync(new URL('../components/teacher/ClassOverviewTab.tsx', import.meta.url), 'utf8');

test('class overview links to the filtered assignments page only in the teacher area', () => {
    assert.match(source, /!adminRoute && <EntryLink[\s\S]{0,200}?href=\{`\/docente\/assegnazioni\?group=\$\{encodeURIComponent\(group\.name\)\}`\}/);
    assert.match(source, /name=\{l\('classAssignments'\)\}/);
    assert.match(source, /description=\{l\('classAssignmentsDesc'\)\}/);
});

test('the class assignments link is translated in all six languages', () => {
    for (const key of ['classAssignments', 'classAssignmentsDesc'] as const) {
        const translations = classSettingsTexts[key];
        assert.equal(translations.length, 6, key);
        assert.ok(translations.every(text => text.trim().length > 0), key);
    }
});
