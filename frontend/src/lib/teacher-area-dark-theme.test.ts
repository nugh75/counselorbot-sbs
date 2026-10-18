import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

// Il tema scuro e' un remap centrale in fondo a globals.css (docs/design.md §6):
// una utility di colore senza voce `.dark .x` resta chiara sul fondo scuro.
// Nell'area docente e' successo con i gradienti delle card (`from-*-50`,
// `via-white`) e con `bg-white/80`: card bianca, testo gia' schiarito sopra.
const stylesheet = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf-8');
const darkBlock = stylesheet.slice(stylesheet.indexOf('DARK MODE'));
const remapped = new Set(
    [...darkBlock.matchAll(/\.dark (?:\.group:hover )?\.((?:[\w-]|\\.)+)/g)].map(m => m[1].replace(/\\/g, '')),
);

const roots = ['../components/teacher/', '../components/goals/', '../app/docente/'];
const sources = roots.flatMap(root => {
    const dir = new URL(root, import.meta.url);
    return readdirSync(dir, { recursive: true })
        .map(String)
        .filter(name => name.endsWith('.tsx') && !name.includes('.test.'))
        .map(name => ({ name: root + name, text: readFileSync(new URL(name, dir), 'utf-8') }));
});

// Sfondi chiari (bianco, tinte -50/-100, anche come tappe di gradiente) e testi
// di tinta scura (-600 e oltre): sono i due modi in cui una card diventa
// illeggibile. I bordi restano fuori: sono decoro, non portano lettura.
const utility = /(?<![\w:/-])((?:group-)?hover:)?(bg|from|via|to|text)-(white|[a-z]+-\d{2,3})(\/\d+)?(?![\w-])/g;

function needsRemap(kind: string, color: string): boolean {
    if (color === 'white') return kind !== 'text';
    const [family, shadeText] = color.split(/-(?=\d+$)/);
    const shade = Number(shadeText);
    if (kind === 'text') return family === 'slate' ? shade >= 400 : shade >= 600;
    return shade <= 100;
}

test('every light background and dark text in the teacher area has a dark-theme remap', () => {
    const missing = new Map<string, string>();
    for (const { name, text } of sources) {
        for (const m of text.matchAll(utility)) {
            const [full, , kind, color] = m;
            if (needsRemap(kind, color) && !remapped.has(full)) missing.set(full, name);
        }
    }
    assert.deepEqual(
        [...missing].map(([cls, file]) => `${cls} (${file})`),
        [],
        'aggiungere la voce `.dark .<classe>` in fondo a globals.css',
    );
});

test('the class-goal and practice-gym cards turn dark, light theme untouched', () => {
    // Le tappe del gradiente sono variabili: il remap ridefinisce la variabile,
    // non `background-color`, altrimenti il gradiente coprirebbe il colore.
    for (const stop of ['via-white', 'from-indigo-50\\/70', 'to-sky-50\\/40', 'from-indigo-50\\/50', 'to-white']) {
        const rule = darkBlock.slice(darkBlock.indexOf(`.dark .${stop} {`)).split('}')[0];
        assert.match(rule, /--tw-gradient-(from|via|to):/, `${stop} deve ridefinire la sua tappa`);
    }
    const beforeDark = stylesheet.slice(0, stylesheet.indexOf('DARK MODE'));
    assert.equal(beforeDark.includes('--tw-gradient-'), false, 'il tema chiaro non viene toccato');
});
