import assert from 'node:assert/strict';
import test from 'node:test';

// Node's built-in TypeScript runner requires the explicit extension; the app's
// bundler configuration intentionally does not enable TS extension imports.
// @ts-expect-error -- executed directly by `node --test`.
import { RETURNING_HOME_TOOLS } from './returning-home-tools.ts';

test('returning home exposes every standalone student tool', () => {
    const expectedHrefs = [
        '/assistente',
        '/pqbl',
        '/profilo/cambiamenti',
        '/profilo/classi',
        '/profilo/compilazioni',
        '/profilo/libretto',
        '/profilo/portfolio',
        '/profilo/taccuino',
        '/profilo/telegram',
    ];
    const actualHrefs = RETURNING_HOME_TOOLS.map((tool) => tool.href).sort();

    assert.deepEqual(actualHrefs, expectedHrefs);
    assert.equal(new Set(actualHrefs).size, actualHrefs.length);
});
