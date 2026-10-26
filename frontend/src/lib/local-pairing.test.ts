import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { formatPersonalCode } from './local-pairing.ts';

test('personal codes are normalized and grouped without changing their value', () => {
    assert.equal(formatPersonalCode('abcd efgh-ijkl'), 'ABCD-EFGH-IJKL');
    assert.equal(formatPersonalCode('ABCDEFGHIJKL'), 'ABCD-EFGH-IJKL');
    assert.equal(formatPersonalCode(''), '');
});
