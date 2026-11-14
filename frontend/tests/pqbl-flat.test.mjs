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
