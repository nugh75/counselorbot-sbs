import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { readStoredNotebookContext, storeNotebookContext } from './notebook-context.ts';

// localStorage minimo (il modulo legge window.localStorage in modo difensivo).
class MemoryStorage {
    private data = new Map<string, string>();
    getItem(key: string) { return this.data.get(key) ?? null; }
    setItem(key: string, value: string) { this.data.set(key, value); }
    removeItem(key: string) { this.data.delete(key); }
}

before(() => {
    (globalThis as Record<string, unknown>).window = { localStorage: new MemoryStorage() };
});
after(() => {
    delete (globalThis as Record<string, unknown>).window;
});

test('senza scelta persistita vale il default', () => {
    assert.equal(readStoredNotebookContext(), 'default');
});

test('la scelta round-trip e il default cancella la chiave', () => {
    storeNotebookContext('teacher');
    assert.equal(readStoredNotebookContext(), 'teacher');
    storeNotebookContext('none');
    assert.equal(readStoredNotebookContext(), 'none');
    storeNotebookContext('student');
    assert.equal(readStoredNotebookContext(), 'student');
    storeNotebookContext('default');
    assert.equal(readStoredNotebookContext(), 'default');
});

test('un valore corrotto nel storage torna default', () => {
    window.localStorage.setItem('cb-notebook-context', 'pluto');
    assert.equal(readStoredNotebookContext(), 'default');
});
