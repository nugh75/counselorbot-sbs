import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { forumDraftValid, forumLink, parseForumTopic, parseForumUnread, parseForumTargets, parseForumDiscussionLinks, forumTargetHref } from './forum.ts';

test('linked resources produce local destinations only while available', () => {
    const target = { kind: 'path_step' as const, id: 7, title: null, tool_key: 'QSA', path_title: 'Start' };
    assert.deepEqual(parseForumTargets({ targets: [target] }).targets, [target]);
    assert.equal(forumTargetHref({ ...target, available: true }), '/profilo/percorsi#class-step-7');
    assert.equal(forumTargetHref({ ...target, available: true }, 10), '/docente/classi/10?tab=paths');
    assert.equal(forumTargetHref({ ...target, available: false }), undefined);
    assert.equal(forumTargetHref({ ...target, kind: 'assignment', available: true }), '/profilo/assegnazioni#assignment-7');
    for (const invalid of [{ ...target, id: 0 }, { ...target, kind: 'goal' }, { ...target, title: {} }]) {
        assert.throws(() => parseForumTargets({ targets: [invalid] }));
    }
    const link = { kind: 'assignment', id: 4, topic_id: 9, group_id: 10 };
    assert.deepEqual(parseForumDiscussionLinks({ links: [link] }).links, [link]);
    assert.throws(() => parseForumDiscussionLinks({ links: [{ ...link, topic_id: '9' }] }));
});

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
        hidden_reason: null, own: false,
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

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { forumClosedNotice, forumPostActions, parseForumLog, parseForumPost } from './forum.ts';

const reply = { id: 1, author_display_name: 'Anna', body: 'Text', hidden: false, deleted: false,
    hidden_reason: null, own: false, created_at: '2026-10-08T10:00:00Z', edited_at: null };

test('a closed discussion explains archive first, then a hidden topic, then a lock', () => {
    assert.equal(forumClosedNotice(false, { hidden: true, locked: true }), 'archive');
    assert.equal(forumClosedNotice(true, { hidden: true, locked: false }), 'hiddenTopic');
    assert.equal(forumClosedNotice(true, { hidden: true, locked: true }), 'hiddenTopic');
    assert.equal(forumClosedNotice(true, { hidden: false, locked: true }), 'closed');
});

test('reply controls follow authorship, moderation role, hiding, deletion and archive', () => {
    const none = { edit: false, delete: false, hide: false, restore: false };
    assert.deepEqual(forumPostActions({ ...reply, own: true }, { moderator: false, active: true }), { ...none, edit: true, delete: true });
    assert.deepEqual(forumPostActions({ ...reply, own: true, hidden: true }, { moderator: false, active: true }), { ...none, delete: true });
    assert.deepEqual(forumPostActions(reply, { moderator: true, active: true }), { ...none, hide: true });
    assert.deepEqual(forumPostActions({ ...reply, hidden: true }, { moderator: true, active: true }), { ...none, restore: true });
    assert.deepEqual(forumPostActions({ ...reply, own: true, deleted: true }, { moderator: true, active: true }), none);
    assert.deepEqual(forumPostActions({ ...reply, own: true }, { moderator: true, active: false }), none);
    assert.deepEqual(forumPostActions(reply, { moderator: false, active: true }), none);
});

test('forum parsers require moderation fields and reject malformed log entries', () => {
    assert.equal(parseForumPost(reply).own, false);
    assert.throws(() => parseForumPost({ ...reply, own: undefined }));
    assert.throws(() => parseForumPost({ ...reply, hidden_reason: 3 }));
    const entry = { id: 1, actor_username: 'owner', action: 'hide', target_kind: 'post', target_id: 4, reason: 'Off topic', created_at: '2026-10-08T10:00:00Z' };
    assert.deepEqual(parseForumLog({ entries: [entry], has_more: false }).entries, [entry]);
    assert.throws(() => parseForumLog({ entries: [{ ...entry, reason: 7 }], has_more: false }));
    assert.throws(() => parseForumLog({ entries: [], has_more: 'no' }));
});
