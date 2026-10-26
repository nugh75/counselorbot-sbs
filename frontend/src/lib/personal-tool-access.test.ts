import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { enabledResumeItems, parseUserAccess, personalSlugEnabled, personalToolAccessTexts, personalToolBySlug } from './personal-tool-access.ts';

const restricted = { restricted: true, tool_keys: ['goals', 'notebook', 'pqbl'] };

test('a restricted student only sees the enabled personal tools', () => {
    assert.equal(personalSlugEnabled(restricted, 'obiettivi'), true);
    assert.equal(personalSlugEnabled(restricted, 'tavolo'), false);
    assert.equal(personalSlugEnabled(restricted, 'carte'), false);
    // Always-on and unmapped slugs never disappear.
    for (const slug of ['taccuino', 'compilazioni', 'classi', 'assegnazioni']) assert.equal(personalSlugEnabled(restricted, slug), true);
});

test('unknown or unrestricted access shows every tool', () => {
    for (const slug of Object.keys(personalToolBySlug)) {
        assert.equal(personalSlugEnabled(null, slug), true);
        assert.equal(personalSlugEnabled({ restricted: false, tool_keys: [] }, slug), true);
    }
});

test('the overview drops goals and activities of disabled tools', () => {
    const items = [
        { id: 'goal-1', title: 'G', href: '/profilo/obiettivi', kind: 'goal' as const, date: null },
        { id: 'action-a', title: 'A', href: '/profilo/azioni', kind: 'action' as const, date: null },
        { id: 'assignment-1', title: 'T', href: '/profilo/assegnazioni', kind: 'assignment' as const, date: null },
    ];
    assert.deepEqual(enabledResumeItems(items, restricted).map(item => item.id), ['goal-1', 'assignment-1']);
    assert.equal(enabledResumeItems(items, null).length, 3);
});

test('access reads reject malformed payloads', () => {
    for (const payload of [null, {}, { restricted: 'yes', tool_keys: [] }, { restricted: true, tool_keys: [1] }]) {
        assert.throws(() => parseUserAccess(payload), /Invalid user access/);
    }
    assert.deepEqual(parseUserAccess({ restricted: true, tool_keys: ['goals'], class_ids: [1] }), { restricted: true, tool_keys: ['goals'] });
});

test('the disabled notice covers six languages', () => {
    for (const [key, texts] of Object.entries(personalToolAccessTexts)) {
        assert.equal(texts.length, 6, key);
        assert.ok(texts.every(text => text.trim().length > 0), key);
    }
});
