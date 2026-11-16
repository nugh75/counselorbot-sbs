import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/profilo/pqbl/page.tsx', import.meta.url), 'utf8');

test('PDF study page uses only flat Cards', () => {
    assert.match(source, /<Card variant="flat"/);
    assert.doesNotMatch(source, /<Card(?![^>]*variant="flat")[^>]*>/);
});

test('PDF study page has no boxes inside sections', () => {
    // Summary figures, per-skill rows and heading icons are plain, not tiles or chips.
    assert.doesNotMatch(source, /rounded-control bg-surface-sunken/);
    assert.doesNotMatch(source, /rounded-control border border-line bg-surface px-4 py-2/);
    assert.doesNotMatch(source, /w-10 h-10 rounded-control/);
    assert.match(source, /divide-y divide-line/);
});

test('PDF study page keeps progress in localStorage', () => {
    assert.match(source, /savePqblProgress\(/);
    assert.match(source, /loadPqblProgress</);
});

test('PDF study page explains login, size and busy errors (#998)', () => {
    assert.match(source, /401: 'pqbl\.error\.auth'/);
    assert.match(source, /413: 'pqbl\.error\.tooLarge'/);
    assert.match(source, /429: 'pqbl\.error\.busy'/);
    assert.doesNotMatch(source, /setError\(e instanceof Error/);
    const i18n = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8');
    for (const key of ['pqbl.error.auth', 'pqbl.error.tooLarge', 'pqbl.error.busy']) {
        assert.equal(i18n.split(`'${key}':`).length - 1, 6, `${key} in six languages`);
    }
    assert.doesNotMatch(i18n, /'pqbl\.upload\.hint': '[^']*100/);
});
