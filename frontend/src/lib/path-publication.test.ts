import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { parseClassPathStep, parseStudentClassPathStep } from './class-paths.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { pathPublicationTexts, unavailableActionText } from './i18n-path-publication.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { lifecycleRequest, parsePublicationProblems, publishRevision, unavailableAction } from './path-publication.ts';

test('a blocked publication lists every step to fix, in path order', () => {
    const detail = {code: 'path_publication_blocked', problems: [
        {step_id: 14, position: 4, step_type: 'forum', reason: 'forum_disabled_for_class'},
        {step_id: 11, position: 1, step_type: 'questionnaire_administration', reason: 'institution_credentials_missing'},
        {step_id: 13, position: 3, step_type: 'assignment', reason: 'assignment_revoked'},
    ]};
    const problems = parsePublicationProblems(detail);
    assert.deepEqual(problems?.map((row: {position: number}) => row.position), [1, 3, 4]);
    assert.deepEqual(problems?.map((row: {reason: string}) => unavailableAction(row.reason)), ['institute', 'assignment', 'class_tool']);
    // A plain error string is not a publication report.
    assert.equal(parsePublicationProblems('Class path revision mismatch'), null);
    assert.equal(parsePublicationProblems({code: 'other', problems: []}), null);
});

test('reason codes map to the action that fixes them', () => {
    assert.equal(unavailableAction(null), null);
    assert.equal(unavailableAction('tool_unavailable'), 'platform_tool');
    assert.equal(unavailableAction('tool_disabled_for_class'), 'class_tool');
    assert.equal(unavailableAction('administration_locale_unavailable'), 'administration');
    assert.equal(unavailableAction('results_step_unavailable'), 'results_step');
    assert.equal(unavailableAction('forum_topic_unavailable'), 'forum');
    assert.equal(unavailableAction('assignment_class_inactive'), 'class_inactive');
    assert.equal(unavailableAction('something_new'), 'other');
    assert.match(unavailableActionText('en', 'class_tool'), /Tools & counselors/);
});

test('teacher and student steps keep the server reason', () => {
    const payload = {id: 5, position: 5, step_type: 'tool', tool_key: 'timeline', state: 'unavailable',
        availability_reason: 'tool_unavailable', can_self_mark: false};
    assert.equal(parseClassPathStep(payload).availability_reason, 'tool_unavailable');
    assert.equal(parseStudentClassPathStep(payload).availability_reason, 'tool_unavailable');
    assert.equal(parseStudentClassPathStep({...payload, availability_reason: null}).availability_reason, null);
});

test('lifecycle actions send the revision the teacher saw', () => {
    const request = lifecycleRequest(7);
    assert.equal(request.method, 'POST');
    assert.deepEqual(JSON.parse(String(request.body)), {revision: 7});
    // Publishing right after an automatic save uses the saved revision, not the stale one.
    assert.equal(publishRevision(7, {revision: 8}), 8);
    assert.equal(publishRevision(7, true), 7);
});

test('publication texts exist in six languages without glyph labels', () => {
    for (const [key, values] of Object.entries(pathPublicationTexts) as [string, readonly string[]][]) {
        assert.equal(values.length, 6, key);
        for (const value of values) {
            assert.ok(value.trim(), key);
            assert.doesNotMatch(value, /^[+→]|[\u{1F300}-\u{1FAFF}]/u, key);
        }
    }
});
