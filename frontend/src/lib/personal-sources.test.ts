import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { fromServer } from './personal-sources.ts';

test('fromServer tolerates a payload without bindings', () => {
    // #205: a counselor details payload can report unavailable sources without a bindings array.
    assert.deepEqual(fromServer(undefined), []);
    assert.deepEqual(fromServer(null), []);
});

test('fromServer maps a stored binding to its source', () => {
    assert.deepEqual(fromServer([{ counselor_id: 1, connection_id: 'abc', chatgpt_model: null, reasoning: 'high' }]),
        [{ counselor_id: 1, source: 'api:abc', reasoning: 'high' }]);
});
