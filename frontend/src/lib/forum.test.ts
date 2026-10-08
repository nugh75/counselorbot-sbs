import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { forumDraftValid, forumLink } from './forum.ts';

test('forum composer accepts only nonempty text within the published limits', () => {
    assert.equal(forumDraftValid('Reply'), true);
    assert.equal(forumDraftValid(' '), false);
    assert.equal(forumDraftValid('A'.repeat(4001)), false);
    assert.equal(forumDraftValid('A'.repeat(4000), 'T'.repeat(160)), true);
    assert.equal(forumDraftValid('Body', 'T'.repeat(161)), false);
    assert.equal(forumDraftValid('Body', ' '), false);
});

test('forum links permit http and https only; unsafe or relative links stay text', () => {
    assert.equal(forumLink('https://example.org/page'), 'https://example.org/page');
    assert.equal(forumLink('http://example.org'), 'http://example.org');
    for (const href of ['javascript:alert(1)', 'data:text/html,test', '//example.org', '/api/chat', 'mailto:a@example.org']) {
        assert.equal(forumLink(href), undefined);
    }
});

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { forumTexts } from './i18n-forum.ts';

test('every forum message has six nonempty language strings', () => {
    for (const values of Object.values(forumTexts)) {
        assert.equal(values.length, 6);
        for (const value of values) assert.ok(value.trim().length > 0);
    }
});
