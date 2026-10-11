import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Il catalogo strumenti ha un indirizzo proprio: `/strumenti` porta alla
// vista catalogo della home, e la navigazione lo linka.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('/strumenti opens the tool catalog', () => {
    assert.ok(existsSync(new URL('../app/strumenti/page.tsx', import.meta.url)));
    assert.match(read('../app/strumenti/page.tsx'), /redirect\('\/\?view=questionnaires'\)/);
});

test('the header links the tool catalog', () => {
    assert.match(read('../components/layout/Header.tsx'), /key: 'tools', href: '\/strumenti'/);
});

test('the group page "go to tools" link points to an existing route', () => {
    assert.match(read('../app/gruppo/page.tsx'), /href="\/strumenti"/);
});
