import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Le primitive sono il modello della migrazione grafica (audit UI §9,
// docs/design.md §2.6): token semantici, due pesi, niente maiuscolo, niente
// gradienti, niente hex. Questa guardia copre solo loro, non le pagine.
const primitives = ['Button', 'Card', 'PageHeader', 'Callout', 'Field', 'StatusBadge', 'Dialog', 'BackButton'];
// #961: le primitive della chat entrano nello stesso modello: token semantici,
// due pesi, niente maiuscolo, niente palette grezza (audit visivo 2, PR E1).
const chat = [
    'ChatBubble', 'ChatShell', 'ChatMarkdown', 'ChatOptionsMenu', 'ChatActionsPopover',
    'AudioInput', 'ResponseFormatSelector', 'ResponseLengthSelector', 'ReasoningSelector',
    'InlineRename', 'PencilButton', 'ConfirmInline', 'FlowStepper', 'AudioLanguageOption',
    'AudioSendOption', 'ChatContinuation',
];
const read = (name: string) => readFileSync(new URL(`../components/ui/${name}.tsx`, import.meta.url), 'utf-8');

const forbidden: [string, RegExp][] = [
    ['uppercase', /\buppercase\b/],
    ['gradient', /\bbg-(?:gradient|linear|radial|conic)-|\b(?:from|via|to)-(?:white|black|[a-z]+-\d{2,3})\b/],
    // Un hex ha almeno una lettera, oppure 6/8 cifre: così i riferimenti alle
    // issue nei commenti (`#935`) non passano per un colore.
    ['hex literal', /#(?:(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{3,8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/],
    ['third font weight', /\bfont-(?:thin|extralight|light|medium|bold|extrabold|black)\b/],
    ['41px height (h-11 at 15px root)', /\b(?:min-)?h-11\b/],
    ['raw neutral or brand colour', /\b(?:text|bg|border)-(?:slate|indigo|ochre|amber|sky)-\d{2,3}\b/],
];

for (const name of [...primitives, ...chat]) {
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

test('Button exports buttonClasses, used by Button and by ButtonLink on next/link', () => {
    const source = read('Button');
    assert.match(source, /export function buttonClasses\(variant: Variant = 'primary', size: Size = 'md'/);
    assert.match(source, /<button\s+className=\{buttonClasses\(variant, size, className\)\}/);
    assert.match(source, /export function ButtonLink[\s\S]*<Link className=\{buttonClasses\(variant, size, className\)\}/);
});

test('Field controls sit on the tokens and keep the global focus ring', () => {
    const source = read('Field');
    for (const token of ['rounded-control', 'border-line-strong', 'bg-surface', 'min-h-control', 'px-3', 'text-sm', 'disabled:', 'aria-invalid:border-danger']) {
        assert.ok(source.includes(token), `Field.tsx: ${token}`);
    }
    assert.doesNotMatch(source, /outline-none|\bdark:/);
    for (const name of ['Field', 'Input', 'Select', 'Textarea']) assert.match(source, new RegExp(`export function ${name}\\b`));
    assert.match(source, /htmlFor=\{id\}/);
    assert.match(source, /'aria-describedby'/);
});

test('StatusBadge has five tones from the soft/ink tokens and no pill', () => {
    const source = read('StatusBadge');
    for (const tone of ['info', 'success', 'warning', 'danger']) assert.match(source, new RegExp(`${tone}: \\{ box: 'bg-${tone}-soft text-${tone}-ink'`));
    assert.match(source, /neutral: \{ box:/);
    assert.match(source, /'inline-flex[^']*rounded-control[^']*text-xs/);
    assert.doesNotMatch(source, /rounded-full[^']*px-/);
});

test('BackButton reads as a text link, like the first breadcrumb item', () => {
    const source = read('BackButton');
    for (const token of ['text-ink-muted', 'hover:text-link', 'h-control w-control', 'min-h-control']) {
        assert.ok(source.includes(token), `BackButton.tsx: ${token}`);
    }
    // Niente bordo, fondo, pillola o cerchio: solo testo e freccia.
    assert.doesNotMatch(source, /bg-white|rounded-(?:full|control)|border(?:-line)?[ ']/);
    assert.doesNotMatch(source, /outline-none/);
    assert.match(source, /aria-label/);
});

test('section headings use the strong rule token, not the faint line', () => {
    const source = read('EntryList');
    assert.equal((source.match(/border-b border-line-strong pb-2/g) ?? []).length, 2, 'heading and subtitle wrapper');
    assert.doesNotMatch(source, /border-b border-line pb-/);
});

test('Dialog opens as a modal, closes through onClose and gives focus back', () => {
    const source = read('Dialog');
    assert.match(source, /node\.showModal\(\)/);
    assert.match(source, /onCancel=\{event => \{ event\.preventDefault\(\); onClose\(\); \}\}/);
    assert.match(source, /if \(event\.target === dialog\.current\) onClose\(\)/);
    assert.match(source, /return \(\) => opener\?\.focus\?\.\(\)/);
    assert.match(source, /aria-label=\{closeLabel\} onClick=\{onClose\}/);
    for (const token of ['h-dvh', 'sm:rounded-card', 'shadow-modal', 'backdrop:bg-backdrop', 'border-b border-line', 'border-t border-line']) {
        assert.ok(source.includes(token), `Dialog.tsx: ${token}`);
    }
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf-8');
    assert.match(css, /--color-backdrop: var\(--backdrop\);/);
    assert.equal((css.match(/--backdrop: rgb\(/g) ?? []).length, 2, 'light and dark backdrop');
});

test('the pilot zone (practice gym, goals) uses the primitives, not hand-written fields, pills or backdrops', () => {
    const pilot = ['teacher/PracticeNotebooks', 'teacher/PracticeChats', 'teacher/PracticeRepertoire', 'goals/GoalDialog', 'goals/GoalCatalogDialog', 'goals/GoalsPanel'];
    for (const name of pilot) {
        const source = read(`../${name}`);
        assert.doesNotMatch(source, /border border-line-strong|rounded-full|backdrop:/, name);
    }
    assert.match(read('../goals/GoalDialog'), /<Dialog title=\{title\}/);
    assert.match(read('../goals/GoalCatalogDialog'), /<Dialog title=\{l\('catalog'\)\}/);
});

// Due soli raggi (#932): il controllo e il contenitore. `rounded-full` resta per
// avatar e puntini; l'admin e DiagramBlock non sono ancora migrati.
test('only rounded-control and rounded-card outside the admin area', () => {
    const root = new URL('../', import.meta.url);
    const stale = /(?<![\w-])rounded(?:-(?:md|lg|xl|2xl))?(?![\w-])/;
    const legacy = [...readdirSync(root, { recursive: true, encoding: 'utf-8' })]
        .filter(name => name.endsWith('.tsx'))
        .filter(name => !name.startsWith('components/admin/') && name !== 'components/ui/DiagramBlock.tsx')
        .filter(name => stale.test(readFileSync(new URL(name, root), 'utf-8')));
    assert.deepEqual(legacy, []);
});

// #961: la tabella di sostituzione dell'audit visivo 2 applicata alle primitive
// della chat. Ogni tinta grezza ha lasciato il posto al token corrispondente.
test('chat primitives use the substitution table', () => {
    const expected: [string, RegExp][] = [
        ['ChatBubble', /bg-brand text-ink-on-brand/],
        ['ChatBubble', /bg-surface border border-line text-ink-body/],
        ['ChatShell', /border-line-strong bg-surface/],
        ['ChatShell', /bg-brand hover:bg-brand-hover/],
        ['ChatShell', /bg-brand-hover hover:bg-brand/],
        ['ChatMarkdown', /text-link/],
        ['ChatMarkdown', /bg-surface-raised/],
        ['ChatOptionsMenu', /bg-surface-raised font-semibold text-ink/],
        ['ChatActionsPopover', /border border-line bg-surface text-ink-body/],
        ['FlowStepper', /bg-move text-ink-on-brand/],
        ['FlowStepper', /text-move-hover/],
        ['PencilButton', /bg-surface-sunken hover:text-link/],
    ];
    for (const [name, pattern] of expected) assert.match(read(name), pattern, name);
});

test('chat primitives have no hand-written field, pill or focus override', () => {
    for (const name of chat) {
        const source = read(name);
        assert.doesNotMatch(source, /outline-none/, `${name}.tsx: outline override`);
        // Campi nativi: nessun bordo o fondo scritto a mano con la palette grezza.
        // Restano due eccezioni volute, entrambe sui token: il composer cresce con
        // AutoGrowTextarea e InlineRename tiene il ref del proprio input.
        for (const line of source.split('\n').filter(item => /<(?:input|select|textarea)\b/.test(item))) {
            assert.doesNotMatch(line, /bg-(?:white|slate)-|border-(?:slate|indigo)-/, `${name}.tsx: ${line.trim()}`);
        }
        for (const line of source.split('\n').filter(item => item.includes('rounded-full'))) {
            assert.doesNotMatch(line, /\bpx-/, `${name}.tsx: pill written by hand`);
        }
    }
    assert.match(read('ResponseFormatSelector'), /<Select\b/);
    assert.match(read('AudioLanguageOption'), /<Select\b/);
    assert.match(read('AudioInput'), /<Textarea\b/);
    assert.match(read('InlineRename'), /<Button\b/);
    assert.match(read('ConfirmInline'), /<Button\b/);
});
