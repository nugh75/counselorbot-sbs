import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { parseClassPathStep, parseStudentClassPathStep } from './class-paths.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { pathForumTexts } from './i18n-path-forum.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { typedStepTargetLabel } from './i18n-administration-steps.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { forumSaveError, forumStepInput, forumStepNotice, pathForumTopics, selectablePathForumTopics } from './path-forum.ts';

const topic = (id: number, extra: Record<string, unknown> = {}) => ({
    id, group_id: 4, title: `Discussion ${id}`, body: null, author_display_name: 'Teacher', hidden: false, deleted: false,
    hidden_reason: null, own: false, created_at: '2026-10-10T08:00:00Z', edited_at: null, status: 'published' as 'published' | 'pending',
    pinned: false, locked: false, last_post_at: '2026-10-10T08:00:00Z', replies_count: 0, ...extra,
});

test('forum steps keep the exact discussion as identifiers and the student state as booleans', () => {
    const payload = {id: 31, path_id: 1, position: 2, step_type: 'forum', tool_key: null, topic_id: 9,
        auto_detect: true, can_self_mark: false, target_summary: {id: 9, group_id: 4, locked: true},
        completion_kind: 'forum_reply', state: 'not_done', source: null,
        start_href: '/profilo/classi/4/forum?topic=9',
        forum_state: {pending: true, hidden: false, locked: true, muted: false}};
    const teacher = parseClassPathStep(payload);
    const student = parseStudentClassPathStep(payload);
    for (const step of [teacher, student]) {
        assert.equal(step.step_type, 'forum');
        assert.equal(step.topic_id, 9);
        assert.equal(step.target_summary, null);
        assert.equal(step.assignment_summary, null);
        assert.deepEqual(step.forum_summary, {id: 9, group_id: 4, locked: true});
    }
    assert.deepEqual(student.forum_state, {pending: true, hidden: false, locked: true, muted: false});
    assert.equal(student.start_href, '/profilo/classi/4/forum?topic=9');
    // Other step types never carry a forum target or state.
    const tool = parseStudentClassPathStep({id: 2, tool_key: 'timeline', topic_id: 9, forum_state: {pending: true}});
    assert.equal(tool.topic_id, null);
    assert.equal(tool.forum_state, null);
});

test('the builder lists only published visible discussions, once per path', () => {
    const rows = pathForumTopics([
        topic(1), topic(2, {status: 'pending' as const}), topic(3, {hidden: true}), topic(4, {deleted: true}),
        topic(5, {locked: true}), topic(6, {title: null}),
    ]);
    assert.deepEqual(rows, [{id: 1, title: 'Discussion 1', locked: false}, {id: 5, title: 'Discussion 5', locked: true}]);
    const step = forumStepInput(rows[0], 4, 3);
    assert.deepEqual(step, {position: 3, step_type: 'forum', topic_id: 1, forum_summary: {id: 1, group_id: 4, locked: false},
        tool_key: '', auto_detect: true, can_self_mark: false});
    assert.deepEqual(selectablePathForumTopics(rows, [step]).map(row => row.id), [5]);
});

test('save errors and student notices name the forum state', () => {
    for (const detail of ['forum_topic_class_mismatch', 'forum_topic_unavailable', 'forum_class_inactive',
        'forum_disabled_for_class', 'duplicate_forum_step']) assert.equal(forumSaveError(detail), true);
    assert.equal(forumSaveError('assignment_revoked'), false);
    assert.equal(forumSaveError(undefined), false);
    const state = {pending: false, hidden: false, locked: false, muted: false};
    assert.equal(forumStepNotice(null, false), null);
    assert.equal(forumStepNotice(state, false), null);
    assert.equal(forumStepNotice({...state, pending: true, locked: true}, false), 'pending');
    assert.equal(forumStepNotice({...state, locked: true, muted: true}, false), 'locked');
    assert.equal(forumStepNotice({...state, muted: true, hidden: true}, false), 'muted');
    assert.equal(forumStepNotice({...state, hidden: true}, false), 'hidden');
    // A done step needs no explanation, even if the discussion was locked later.
    assert.equal(forumStepNotice({...state, locked: true}, true), null);
});

test('forum step texts exist in six languages without glyph labels', () => {
    for (const [key, values] of Object.entries(pathForumTexts) as [string, readonly string[]][]) {
        assert.equal(values.length, 6, key);
        for (const value of values) {
            assert.ok(value.trim(), key);
            assert.doesNotMatch(value, /^[+←-⇿☀-➿]|[\u{1F300}-\u{1FAFF}]/u, key);
        }
    }
    assert.equal(typedStepTargetLabel('en', {step_type: 'forum', target_summary: null}), 'Forum discussion');
    assert.equal(typedStepTargetLabel('it', {step_type: 'forum'}), 'Discussione del forum');
});
