import assert from 'node:assert/strict';
import test from 'node:test';

// Node's built-in TypeScript runner requires the explicit extension; the app's
// bundler configuration intentionally does not enable TS extension imports.
// @ts-expect-error -- executed directly by `node --test`.
import { experiencePrefForInstrument } from './session-prefs.ts';

test('Idea always asks which interaction mode to use', () => {
    assert.equal(experiencePrefForInstrument('IDEA', 'opencode'), null);
    assert.equal(experiencePrefForInstrument('IDEA', 'standard'), null);
});

test('other instruments can reuse the remembered interaction mode', () => {
    assert.equal(experiencePrefForInstrument('QSA', 'opencode'), 'opencode');
    assert.equal(experiencePrefForInstrument('QSA', 'standard'), 'standard');
});
