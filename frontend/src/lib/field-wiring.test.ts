import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { fieldWiring } from './field-wiring.ts';

test('a bare field describes nothing and is not invalid', () => {
    assert.deepEqual(fieldWiring('f', {}), { helpId: undefined, errorId: undefined, describedBy: undefined, invalid: undefined });
});

test('help text is linked through aria-describedby', () => {
    const wiring = fieldWiring('f', { help: true });
    assert.equal(wiring.helpId, 'f-help');
    assert.equal(wiring.describedBy, 'f-help');
    assert.equal(wiring.invalid, undefined);
});

test('an error is announced first and marks the control invalid', () => {
    const wiring = fieldWiring('f', { help: true, error: true });
    assert.equal(wiring.errorId, 'f-error');
    assert.equal(wiring.describedBy, 'f-error f-help');
    assert.equal(wiring.invalid, true);
});
