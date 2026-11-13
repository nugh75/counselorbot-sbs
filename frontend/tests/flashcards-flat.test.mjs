import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('flashcards page is flat: decks and card editors use the flat Card, no nested boxes', () => {
    const source = read('components/flashcards/FlashcardsPage.tsx');
    assert.equal([...source.matchAll(/<Card as="article" variant="flat"/g)].length, 2);
    assert.doesNotMatch(source, /<Card(?![^>]*variant="flat")[^>]*>/);
    assert.doesNotMatch(source, /rounded-card border border-line bg-surface-sunken p-[46]|rounded-card border border-line bg-surface p-[46] (text-center )?shadow-card/);
    assert.match(source, /<details [^>]*className="border-y border-line">/);
    // Dialogs keep their own box.
    assert.match(source, /role="dialog"[^>]*className="w-full max-w-md rounded-card bg-surface p-6 shadow-pop"/);
});

test('visual tools have no box inside box: help, create forms, columns and decks are flat', () => {
    const source = read('components/visual/VisualTools.tsx');
    assert.doesNotMatch(source, /rounded-card border border-line bg-surface-sunken p-4/);
    assert.doesNotMatch(source, /rounded-card border border-brand-line bg-brand-soft p-4/);
    assert.equal([...source.matchAll(/className="border-y border-line">/g)].length, 4);
    assert.match(source, /<Card as="article" variant="flat" key=\{deck\.id\}/);
});
