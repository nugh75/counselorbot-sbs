import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedResumeEntries } from './resume-access.ts';
import type { UserAccess } from './user-access';

const restricted = (tool_keys: string[]): UserAccess => ({
    restricted: true,
    tool_keys,
    counselor_ids: null,
    default_counselor_id: null,
    class_ids: [7],
});

const entries = {
    frozen: [
        { session_id: 'a', questionnaire_type: 'QSA', current_phase: 'chat' },
        { session_id: 'b', questionnaire_type: 'SAVICKAS', current_phase: 'chat' },
    ],
    localResume: { instrument: 'SAVICKAS' } as never,
    pqbl: true,
};

test('a class that turns pQBL off hides its resume entry (N7)', () => {
    const result = allowedResumeEntries(restricted(['QSA', 'SAVICKAS']), entries);
    assert.equal(result.pqbl, false);
    assert.equal(result.count, 3);
});

test('a class that allows pQBL keeps its resume entry', () => {
    const result = allowedResumeEntries(restricted(['pqbl']), entries);
    assert.equal(result.pqbl, true);
    assert.deepEqual(result.frozen, []);
    assert.equal(result.localResume, null);
    assert.equal(result.count, 1);
});

test('no local pQBL progress means no entry, whatever the access', () => {
    assert.equal(allowedResumeEntries(restricted(['pqbl']), { ...entries, pqbl: false }).pqbl, false);
});

test('missing or unrestricted access filters nothing, like the other tools', () => {
    for (const access of [null, undefined, { ...restricted([]), restricted: false }]) {
        const result = allowedResumeEntries(access, entries);
        assert.equal(result.pqbl, true);
        assert.equal(result.frozen.length, 2);
        assert.equal(result.localResume, entries.localResume);
        assert.equal(result.count, 4);
    }
});

test('frozen sessions and the local chat follow the same switch', () => {
    const result = allowedResumeEntries(restricted(['QSA', 'pqbl']), entries);
    assert.deepEqual(result.frozen.map((row: { session_id: string }) => row.session_id), ['a']);
    assert.equal(result.localResume, null);
    assert.equal(result.count, 2);
});
