import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { focusLeaves } from './disclosure.js';

const inside = { id: 'inside' };
const outside = { id: 'outside' };
const container = { contains: (node: unknown) => node === inside };

test('Tab to a control outside the panel closes it', () => {
    assert.equal(focusLeaves(container, outside as unknown as EventTarget), true);
});

test('moving focus inside the panel keeps it open', () => {
    assert.equal(focusLeaves(container, inside as unknown as EventTarget), false);
});

test('focus leaving the page (native confirm, other window) keeps it open', () => {
    assert.equal(focusLeaves(container, null), false);
});

test('an unmounted panel never reports a focus exit', () => {
    assert.equal(focusLeaves(null, outside as unknown as EventTarget), false);
});
