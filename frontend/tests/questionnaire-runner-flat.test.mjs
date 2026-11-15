import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/components/administration/QuestionnaireRunner.tsx', import.meta.url), 'utf8');

test('items are flat fieldsets with a visible legend', () => {
    assert.match(source, /<fieldset\s+key=\{item\.number\}[^>]*border-t border-line py-6/);
    assert.doesNotMatch(source, /legend className="sr-only"/);
});

test('only the selected scale option is filled, no bordered option boxes', () => {
    assert.match(source, /'bg-brand-soft text-ink'/);
    assert.doesNotMatch(source, /border-brand-line/);
});

test('progress bar is a rule, not a shadowed card', () => {
    assert.match(source, /sticky top-16 z-10 border-b border-line bg-surface-sunken/);
    assert.doesNotMatch(source, /shadow-card/);
});

test('uses shared primitives instead of hand-written pills, links and fields', () => {
    assert.doesNotMatch(source, /rounded-full bg-warning-soft/);
    assert.doesNotMatch(source, /<input\s+value=/);
    assert.doesNotMatch(source, /<select/);
    assert.match(source, /<ButtonLink/);
    assert.match(source, /<StatusBadge/);
});

test('answer radios keep their name and value contract', () => {
    assert.match(source, /name=\{`item-\$\{item\.number\}`\}/);
    assert.match(source, /id=\{`item-\$\{item\.number\}`\}/);
});
