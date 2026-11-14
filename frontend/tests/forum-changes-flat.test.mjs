import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forum = readFileSync(new URL('../src/components/forum/ForumView.tsx', import.meta.url), 'utf8');
const changes = readFileSync(new URL('../src/components/profile/ProfileChangeReflection.tsx', import.meta.url), 'utf8');

test('forum views use only the flat card', () => {
    const cards = forum.match(/<Card\b[^>]*>/g) ?? [];
    assert.equal(cards.length, 5);
    for (const card of cards) assert.match(card, /variant="flat"/);
});

test('profile changes page has no boxes inside the card', () => {
    assert.match(changes, /<Card as="section" variant="flat"/);
    assert.doesNotMatch(changes, /rounded-lg border|rounded-card border|bg-surface-sunken p-4 text-sm/);
});
