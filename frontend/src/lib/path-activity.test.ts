import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { activityReturnHref, attemptHistory, withActivityReturn, parsePathActivity } from './path-activity.ts';

test('return to the exact step in the original plan surface', () => {
    assert.equal(activityReturnHref('/profilo', 25), '/profilo#class-step-25');
    assert.equal(activityReturnHref('//external.example', 25), '/profilo/piani-operativi#class-step-25');
    assert.equal(withActivityReturn('/profilo/piani-operativi/13/25?attempt=saved', '/profilo#class-step-25'),
        '/profilo/piani-operativi/13/25?attempt=saved&return_to=%2Fprofilo%23class-step-25');
});

test('plan actions reject external navigation targets', () => {
    const state = {kind: 'chat', current: null, attempts: [], repeat: null, primary: {label: 'resume', href: '//external.example'}};
    assert.equal(parsePathActivity(state), null);
    assert.ok(parsePathActivity({...state, primary: {label: 'start', href: '/profilo/piani-operativi/1/2'}}));
});

test('history lists every attempt once the student can choose the counted one', () => {
    const attempt = (session_id: string, state: string, counted = false) =>
        ({session_id, state, counted, started_at: null, resumable: false, href: '/profilo/piani-operativi/1/2', revision: 0});
    const one = {kind: 'chat', current: attempt('b', 'in_progress'), attempts: [attempt('b', 'in_progress'), attempt('a', 'completed', true)], primary: null, repeat: null};
    assert.deepEqual(attemptHistory(one as never).attempts.map(row => row.session_id), ['a']);
    assert.equal(attemptHistory(one as never).canChoose, false);
    const two = {...one, current: attempt('b', 'completed'), attempts: [attempt('b', 'completed'), attempt('a', 'completed', true)]};
    assert.deepEqual(attemptHistory(two as never), {canChoose: true, attempts: two.attempts});
    assert.deepEqual(attemptHistory(null), {canChoose: false, attempts: []});
});
