import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('Bussola entry is a flat EntryLink row keeping its test id', () => {
    const compass = read('components/home/CompassEntry.tsx');
    assert.match(compass, /<EntryLink[^>]*href="\/bussola"[^>]*testId="compass-entry"/);
    assert.doesNotMatch(compass, /rounded-card|border|bg-surface|p-6/);
});

test('EntryLink forwards testId and renders a button for onOpen', () => {
    const list = read('components/ui/EntryList.tsx');
    assert.match(list, /onOpen\) return <button type="button" onClick=\{onOpen\}/);
    assert.equal((list.match(/<(button|a|Link)\b[^>]*data-testid=\{testId\}/g) ?? []).length, 3);
});

test('profile changes entry is a flat EntryLink, not a boxed link', () => {
    const page = read('app/profilo/page.tsx');
    assert.match(page, /<EntryLink idPrefix="profile" id="changes" href="\/profilo\/cambiamenti"/);
    assert.doesNotMatch(page, /block rounded-card border border-line bg-surface p-6 shadow-card/);
});
