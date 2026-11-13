import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { teacherAreaText } from './i18n-teacher-area.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { resolveActiveStudentTools } from './tool-catalog.ts';

const langs = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;

test('Try the tools texts exist in all six languages', () => {
    for (const key of ['tryToolsTitle', 'tryToolsDescription'] as const) {
        const values = langs.map(lang => teacherAreaText(lang, key));
        assert.ok(values.every((v: string) => v.length > 0), key);
        assert.equal(new Set(values).size, 6, `${key} is translated`);
    }
});

test('the student catalog excludes OBIETTIVO_DOCENZA, so the block adds it explicitly', () => {
    assert.ok(!resolveActiveStudentTools(null).some((q: { id: string }) => q.id === 'OBIETTIVO_DOCENZA'));
    const source = readFileSync(new URL('../components/teacher/TryToolsSection.tsx', import.meta.url), 'utf-8');
    assert.match(source, /q\.id === 'OBIETTIVO_DOCENZA'/);
    assert.match(source, /`\/\?start=\$\{encodeURIComponent\(q\.id\)\}`/);
});
