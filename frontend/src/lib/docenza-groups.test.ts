import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { docenzaClassesInContext, initialDocenzaGroupIds } from './docenza-groups.js';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { autoFreezeSignature } from './auto-freeze.js';

const stored = () => [41, 42];

test('a new docenza chat starts from the browser preference', () => {
    assert.deepEqual(initialDocenzaGroupIds(null, 'session-new', stored), [41, 42]);
    assert.deepEqual(initialDocenzaGroupIds(undefined, 'session-new', stored), [41, 42]);
});

test('a resumed session keeps its own selection, empty or multiple', () => {
    assert.deepEqual(initialDocenzaGroupIds({ session_id: 'a', group_ids: [7] }, 'a', stored), [7]);
    assert.deepEqual(initialDocenzaGroupIds({ session_id: 'a', group_ids: [7, 9] }, 'a', stored), [7, 9]);
    assert.deepEqual(initialDocenzaGroupIds({ session_id: 'a', group_ids: [] }, 'a', stored), []);
});

test('a snapshot saved before group_ids never inherits the browser preference', () => {
    assert.deepEqual(initialDocenzaGroupIds({ session_id: 'a' }, 'a', stored), []);
    assert.deepEqual(initialDocenzaGroupIds({ session_id: 'a', group_ids: null }, 'a', stored), []);
});

test('another session snapshot is not reused', () => {
    assert.deepEqual(initialDocenzaGroupIds({ session_id: 'b', group_ids: [7] }, 'a', stored), [41, 42]);
});

test('classes are in context with the teacher notebook, also as the docenza default', () => {
    assert.equal(docenzaClassesInContext('default'), true);
    assert.equal(docenzaClassesInContext('teacher'), true);
    for (const choice of ['student', 'practice', 'none'] as const) {
        assert.equal(docenzaClassesInContext(choice), false, choice);
    }
});

test('changing the class selection is saved by the autosave', () => {
    const base = { messages: [{ content: 'intro' }], currentPhase: 'start', responseLength: 'medium' };
    const one = autoFreezeSignature({ ...base, groupIds: [7] });
    assert.equal(autoFreezeSignature({ ...base, groupIds: [7] }), one);
    assert.notEqual(autoFreezeSignature({ ...base, groupIds: [7, 9] }), one);
    assert.notEqual(autoFreezeSignature({ ...base, groupIds: [] }), one);
});

test('the guided chat wires the session selection and the effective notebook', () => {
    const source = readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');
    assert.match(source, /initialDocenzaGroupIds\(frozenSnapshot, sessionId, readStoredDocenzaGroupIds\)/);
    assert.match(source, /setDocenzaGroupIds\(frozenSnapshot\.group_ids \?\? \[\]\)/);
    assert.match(source, /group_ids: isDocenza \? docenzaGroupIds : undefined/);
    const bar = readFileSync(new URL('../components/qsa/DocenzaClassBar.tsx', import.meta.url), 'utf8');
    assert.match(bar, /'\/api\/admin\/groups\?own=true'/);
    assert.match(bar, /docenzaClassesInContext\(notebookContext\)/);
});
