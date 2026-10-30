import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Le primitive sono il modello della migrazione grafica (audit UI §9,
// docs/design.md §2.6): token semantici, due pesi, niente maiuscolo, niente
// gradienti, niente hex. Questa guardia copre solo loro, non le pagine.
const primitives = ['Button', 'Card', 'PageHeader', 'Callout'];
const read = (name: string) => readFileSync(new URL(`../components/ui/${name}.tsx`, import.meta.url), 'utf-8');

const forbidden: [string, RegExp][] = [
    ['uppercase', /\buppercase\b/],
    ['gradient', /\bbg-(?:gradient|linear|radial|conic)-|\b(?:from|via|to)-(?:white|black|[a-z]+-\d{2,3})\b/],
    ['hex literal', /#[0-9a-fA-F]{3,8}\b/],
    ['third font weight', /\bfont-(?:thin|extralight|light|medium|bold|extrabold|black)\b/],
    ['41px height (h-11 at 15px root)', /\b(?:min-)?h-11\b/],
    ['raw neutral or brand colour', /\b(?:text|bg|border)-(?:slate|indigo|ochre|amber|sky)-\d{2,3}\b/],
];

for (const name of primitives) {
    test(`${name} follows the visual principles`, () => {
        const source = read(name);
        for (const [label, pattern] of forbidden) {
            assert.doesNotMatch(source, pattern, `${name}.tsx: ${label}`);
        }
    });
}

test('Button md and lg reach a real 44px through the control token', () => {
    const source = read('Button');
    assert.match(source, /md: '[^']*\bmin-h-control\b/);
    assert.match(source, /lg: '[^']*\bmin-h-control\b/);
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf-8');
    assert.match(css, /--spacing-control: 44px;/);
});
