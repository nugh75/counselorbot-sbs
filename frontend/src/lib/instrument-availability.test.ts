import assert from 'node:assert/strict';
import test from 'node:test';

// Node's built-in TypeScript runner requires the explicit extension; the app's
// bundler configuration intentionally does not enable TS extension imports.
// @ts-expect-error -- executed directly by `node --test`.
import { instrumentAvailableInLocale } from './instrument-availability.ts';

const instruments = [
    { code: 'QSA', available_locales: ['it', 'en'] },
    { code: 'QSAr', available_locales: ['it', 'sv'] },
];

test('locale availability is checked for the requested instrument, not globally', () => {
    assert.equal(instrumentAvailableInLocale(instruments, 'QSA', 'en'), true);
    assert.equal(instrumentAvailableInLocale(instruments, 'QSAr', 'en'), false);
    assert.equal(instrumentAvailableInLocale(instruments, 'qsar', 'SV'), true);
});
