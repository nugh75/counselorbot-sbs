import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { docenzaClassesInContext, initialDocenzaGroupIds } from './docenza-groups.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { autoFreezeSignature } from './auto-freeze.ts';

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

// #903: destinatari scelti prima della chat docenza.
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { hasDocenzaTarget, initialDocenzaTargets, toggleDocenzaStudent } from './docenza-groups.ts';

const storedTargets = () => ({ students: [{ group_id: 4, username: 'anna' }], practiceIds: [9] });

test('a new docenza chat takes the targets just picked, a resumed one its own', () => {
    assert.deepEqual(initialDocenzaTargets(null, 'new', storedTargets), storedTargets());
    assert.deepEqual(initialDocenzaTargets({ session_id: 'a', target_students: [{ group_id: 7, username: 'bruno' }], target_practice_notebook_ids: [] }, 'a', storedTargets),
        { students: [{ group_id: 7, username: 'bruno' }], practiceIds: [] });
    // Snapshot precedente ai destinatari: nessuno, mai quelli del browser.
    assert.deepEqual(initialDocenzaTargets({ session_id: 'a' }, 'a', storedTargets), { students: [], practiceIds: [] });
    assert.deepEqual(initialDocenzaTargets({ session_id: 'b' }, 'a', storedTargets), storedTargets());
});

test('the goal needs at least one class, student or test student', () => {
    const none = { students: [], practiceIds: [] };
    assert.equal(hasDocenzaTarget([], none), false);
    assert.equal(hasDocenzaTarget([3], none), true);
    assert.equal(hasDocenzaTarget([], { ...none, practiceIds: [9] }), true);
    assert.equal(hasDocenzaTarget([], { ...none, students: [{ group_id: 4, username: 'anna' }] }), true);
});

test('a student is toggled per class, the same name in another class stays apart', () => {
    const one = toggleDocenzaStudent([], { group_id: 4, username: 'anna' });
    const two = toggleDocenzaStudent(one, { group_id: 5, username: 'anna' });
    assert.deepEqual(two, [{ group_id: 4, username: 'anna' }, { group_id: 5, username: 'anna' }]);
    assert.deepEqual(toggleDocenzaStudent(two, { group_id: 4, username: 'anna' }), [{ group_id: 5, username: 'anna' }]);
});

test('docenza starts from the target picker, never offers a test student and saves the targets', () => {
    const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    assert.match(page, /selectedQuestionnaire\?\.id === 'OBIETTIVO_DOCENZA' && \(\s*<DocenzaTargetPicker/);
    assert.match(page, /selectedQuestionnaire\.id !== 'OBIETTIVO_DOCENZA' && \(\s*<InputMethodSelector/);
    const chat = readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');
    assert.match(chat, /DOCENZA_NOTEBOOK_OPTIONS: NotebookContextChoice\[\] = \['default', 'student', 'teacher', 'none'\]/);
    assert.match(chat, /options=\{isDocenza \? DOCENZA_NOTEBOOK_OPTIONS : undefined\}/);
    assert.match(chat, /target_students: isDocenza \? docenzaTargets\.students : undefined/);
    assert.match(chat, /target_practice_notebook_ids: isDocenza \? docenzaTargets\.practiceIds : undefined/);
});
