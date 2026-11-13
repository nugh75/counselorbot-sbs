import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hub = readFileSync(new URL('../src/components/teacher/TeacherResourcesHub.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/components/profile/PersonalAPISettings.tsx', import.meta.url), 'utf8');

test('resource hub has no intro box and flat tabs', () => {
    assert.doesNotMatch(hub, /bg-brand-soft|shadow-card|Library/);
    assert.match(hub, /resourcesHubDescription/);
});

test('API settings use only the flat card and no nested share box', () => {
    const cards = api.match(/<Card\b[^>]*>/g) ?? [];
    assert.equal(cards.length, 5);
    for (const card of cards) assert.match(card, /variant="flat"/);
    assert.doesNotMatch(api, /rounded-lg border border-line p-4/);
});
