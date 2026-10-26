import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript directly.
import { estimateTokens } from './context-tokens.ts';

test('UTF-8 estimate matches the backend for multilingual text and emoji', () => {
    assert.equal(estimateTokens('é🙂'), 10);
    assert.equal(estimateTokens(''), 8);
    assert.equal(estimateTokens('abc'), 9);
});
