import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { activityReturnHref, withActivityReturn, parsePathActivity } from './path-activity.ts';

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
