import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const i18n = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8');
const component = readFileSync(new URL('../components/qsa/ProfileVisualization.tsx', import.meta.url), 'utf8');

test('area view labels exist in all six languages', () => {
    for (const key of ['profile.view.all', 'profile.view.label']) {
        assert.equal(i18n.split(`'${key}':`).length - 1, 6, key);
    }
});

test('area view is a pressed-state control over the same columns, with a way back', () => {
    assert.match(component, /aria-pressed=\{activeView === key\}/);
    assert.match(component, /\['all', t\('profile\.view\.all'\)\]/);
    assert.match(component, /visibleColumns\.map\(/);
});
