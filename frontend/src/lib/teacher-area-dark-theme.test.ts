import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

// Il tema scuro e' un remap centrale in fondo a globals.css (docs/design.md §6):
// una utility di colore senza voce `.dark .x` resta chiara sul fondo scuro.
// Nell'area docente e' successo con i gradienti delle card (`from-*-50`,
// `via-white`) e con `bg-white/80`: card bianca, testo gia' schiarito sopra.
// Dalla migrazione ai token (zona 6) le classi passano da `bg-surface`, `text-ink`…,
// che cambiano col tema da sole: questa guardia resta per le eccezioni grezze.
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

test('the teacher area draws no gradients and no call-site dark: variants', () => {
    // Zona migrata ai token semantici (docs/audits/ui-consistency-audit-2026-10-30.md §9):
    // le card hero sono a tinta piena e il tema scuro arriva dai token, non dai call-site.
    const offending = sources.flatMap(({ name, text }) =>
        [...text.matchAll(/(?<![\w-])(?:bg-(?:gradient|linear)-[\w-]+|dark:[\w:/[\]-]+)/g)].map(m => `${m[0]} (${name})`));
    assert.deepEqual(offending, []);
});
