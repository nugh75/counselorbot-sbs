import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { forumDraftValid, forumLink, parseForumTopic, parseForumUnread } from './forum.ts';

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

test('parseForumTopic parses topic with or without unread_count', () => {
    const raw = {
        id: 1, group_id: 10, title: 'Test Title', body: 'Body', author_display_name: 'Author',
        created_at: '2026-10-08T12:00:00Z', edited_at: null, hidden: false, deleted: false,
        pinned: false, locked: false, last_post_at: '2026-10-08T12:00:00Z', replies_count: 3,
        unread_count: 2,
    };
    const parsed = parseForumTopic(raw);
    assert.equal(parsed.unread_count, 2);
    assert.equal(parseForumTopic({ ...raw, unread_count: undefined }).unread_count, undefined);
    assert.throws(() => parseForumTopic({ ...raw, unread_count: 'not-a-number' }));
});

test('parseForumUnread parses total and by_group counts', () => {
    const valid = { total: 5, by_group: { '10': 3, '20': 2 } };
    const parsed = parseForumUnread(valid);
    assert.equal(parsed.total, 5);
    assert.deepEqual(parsed.by_group, { '10': 3, '20': 2 });
    assert.throws(() => parseForumUnread(null));
    assert.throws(() => parseForumUnread({ total: 'five', by_group: {} }));
    assert.throws(() => parseForumUnread({ total: 5, by_group: { '10': 'three' } }));
});

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { forumTexts } from './i18n-forum.ts';

test('every forum message has six nonempty language strings', () => {
    for (const values of Object.values(forumTexts)) {
        assert.equal(values.length, 6);
        for (const value of values) assert.ok(value.trim().length > 0);
    }
});
