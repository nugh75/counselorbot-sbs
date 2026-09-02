import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { clearPqblProgress, hasPqblProgress, loadPqblProgress, savePqblProgress } from './pqbl-progress.ts';

class MemoryStorage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

test('pQBL progress can be saved, restored and cleared', () => {
    const storage = new MemoryStorage() as Storage;
    savePqblProgress({ phase: 'quiz', sessionId: 'session-1' }, storage);
    assert.deepEqual(loadPqblProgress(storage), { phase: 'quiz', sessionId: 'session-1' });
    clearPqblProgress(storage);
    assert.equal(loadPqblProgress(storage), null);
});

test('only an activity in the middle counts as resumable', () => {
    const storage = new MemoryStorage() as Storage;
    assert.equal(hasPqblProgress(storage), false);

    savePqblProgress({ phase: 'setup' }, storage);
    assert.equal(hasPqblProgress(storage), false);

    savePqblProgress({ phase: 'quiz' }, storage);
    assert.equal(hasPqblProgress(storage), true);

    savePqblProgress({ phase: 'finalResults' }, storage);
    assert.equal(hasPqblProgress(storage), false);
});
