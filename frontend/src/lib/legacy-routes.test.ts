import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { legacyRouteRedirects } from './legacy-routes.ts';

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app');

test('bare /strumenti redirects permanently to the home tools list', () => {
    assert.deepEqual(
        legacyRouteRedirects.filter(route => route.source.startsWith('/strumenti')),
        [{ source: '/strumenti', destination: '/?view=home', permanent: true }],
    );
    // A page here would be shadowed by the redirect; instrument pages keep their URL.
    assert.ok(!existsSync(path.join(app, 'strumenti/page.tsx')));
    assert.ok(existsSync(path.join(app, 'strumenti/[id]/page.tsx')));
});
