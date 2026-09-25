import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { methodRefs, pickerOptions, sameRef } from './goal-method.ts';

test('methodRefs strips titles', () => {
    assert.deepEqual(methodRefs([{ kind: 'own', id: 3, title: 'x', available: true }, { kind: 'certified', slug: 'a', title: 'A', available: true }]),
        [{ kind: 'own', id: 3 }, { kind: 'certified', slug: 'a' }]);
});

test('picker hides chosen items and keeps own strategies first', () => {
    const options = pickerOptions([{ id: 1, text: 'Mia', used_by: [] }, { id: 2, text: 'Altra', used_by: [] }],
        [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }], [{ kind: 'own', id: 2 }, { kind: 'certified', slug: 'a' }]);
    assert.deepEqual(options.own.map(s => s.id), [1]);
    assert.deepEqual(options.certified.map(s => s.slug), ['b']);
    assert.ok(sameRef({ kind: 'own', id: 1 }, { kind: 'own', id: 1 }));
    assert.ok(!sameRef({ kind: 'own', id: 1 }, { kind: 'certified', slug: '1' }));
});
