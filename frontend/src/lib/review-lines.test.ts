import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { draftFor, linesOf } from './review-lines.ts';

test('a list is one trimmed item per line, at most ten', () => {
    assert.deepEqual(linesOf(' Schema \n\n  Esempi concreti'), ['Schema', 'Esempi concreti']);
    assert.equal(linesOf(Array.from({ length: 12 }, (_, i) => `v${i}`).join('\n')).length, 10);
});

test('the typed text survives while it still means the saved list', () => {
    // A trailing space or a new empty line must not vanish while typing.
    assert.equal(draftFor('due ', ['due']), 'due ');
    assert.equal(draftFor('due parole\n', ['due parole']), 'due parole\n');
});

test('a list changed elsewhere replaces the draft', () => {
    assert.equal(draftFor('vecchio', ['nuovo', 'altro']), 'nuovo\naltro');
});
