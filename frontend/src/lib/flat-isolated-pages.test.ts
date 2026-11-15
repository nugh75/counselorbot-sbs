import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// #959 (secondo audit visivo): le pagine isolate (bussola, assistente,
// questionario, guide, scheda strumento, somministrazione, telegram-link,
// unisciti) e i passi dei piani operativi sono piatti come le aree. L'elenco dei
// file è quello del ticket: le pagine di un altro lotto restano fuori.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const flatPages = [
    'app/questionario/page.tsx',
    'app/somministrazione/page.tsx',
    'components/administration/AdministrationStepFlow.tsx',
    'components/administration/ResultsDeepDiveFlow.tsx',
];
const sharedControls = [
    'app/questionario/page.tsx',
    'app/guide/page.tsx',
    'app/unisciti/page.tsx',
    'app/telegram-link/page.tsx',
    'components/administration/AdministrationStepFlow.tsx',
    'components/administration/ResultsDeepDiveFlow.tsx',
];

test('the owned pages have no boxed Card', () => {
    for (const file of flatPages) {
        assert.doesNotMatch(read(file), /<Card(?![^>]*variant="flat")[^>]*>/, file);
    }
    // La scheda strumento tiene solo i tre messaggi di stato (attesa, classe
    // disattivata, strumento non disponibile).
    const instrument = read('app/strumenti/[id]/page.tsx');
    assert.equal((instrument.match(/<Card(?![^>]*variant="flat")[^>]*>/g) ?? []).length, 3);
    // L'elenco dei risultati e le due teste sono piatti; restano i due messaggi
    // di stato (classe disattivata, strumento non disponibile).
    const runner = read('components/administration/QuestionnaireRunner.tsx');
    assert.equal((runner.match(/<Card(?![^>]*variant="flat")[^>]*>/g) ?? []).length, 2);
    assert.equal((runner.match(/<Card [^>]*variant="flat"/g) ?? []).length, 4);
    // La Bussola tiene un solo riquadro: il pannello della conversazione.
    const bussola = read('app/bussola/page.tsx');
    assert.equal((bussola.match(/<Card(?![^>]*variant="flat")[^>]*>/g) ?? []).length, 1);
    assert.equal((bussola.match(/<Card [^>]*variant="flat"/g) ?? []).length, 4);
});

test('chat pages carry no shadow and one conversation box', () => {
    const assistente = read('app/assistente/page.tsx');
    assert.doesNotMatch(assistente, /shadow-card/);
    // Solo il trascritto è un riquadro; scrittura e anteprima restano piatte.
    assert.match(assistente, /<ChatTranscript[^>]*rounded-card border border-line bg-surface p-4/);
    assert.match(assistente, /className="assistente-composer space-y-2 p-4"/);
    assert.match(assistente, /<ButtonLink href=\{loginHref\('\/assistente'\)\}/);
    const guide = read('app/guide/page.tsx');
    assert.doesNotMatch(guide, /shadow-card/);
    assert.match(guide, /<EntrySection/);
    assert.match(guide, /<ButtonLink/);
});

test('fields are the shared Field/Input/Select/Textarea, never hand-written borders', () => {
    for (const file of sharedControls) {
        const source = read(file);
        assert.doesNotMatch(source, /<(?:input|select|textarea)\b[^>]*className="[^"]*\bborder\b/, file);
        assert.doesNotMatch(source, /outline-none/, file);
    }
    assert.match(read('app/questionario/page.tsx'), /<Field, Input, Select, Textarea|Field, Input, Select, Textarea/);
    assert.match(read('app/unisciti/page.tsx'), /<Field label=/);
    assert.match(read('components/administration/ResultsDeepDiveFlow.tsx'), /<Select value=\{resultId\}/);
});

test('headings are PageHeader and labels stay StatusBadge, not hand-written pills', () => {
    assert.match(read('app/telegram-link/page.tsx'), /<PageHeader title=\{texts\.title\}/);
    assert.doesNotMatch(read('app/telegram-link/page.tsx'), /<h1/);
    assert.doesNotMatch(read('components/questionnaire/CounselorSelector.tsx'), /rounded-full[^"]*\bpx-/);
    assert.match(read('app/somministrazione/page.tsx'), /<StatusBadge tone="warning">/);
    assert.match(read('app/strumenti/[id]/page.tsx'), /<Callout variant="warning">/);
    assert.match(read('app/strumenti/[id]/page.tsx'), /<Callout variant="info">/);
});

test('the instrument index is an entry list, not a grid of cards', () => {
    const page = read('app/somministrazione/page.tsx');
    assert.match(page, /<EntryLink/);
    assert.doesNotMatch(page, /bg-brand px-4 py-2/);
    assert.match(read('app/guide/page.tsx'), /<Input id="guide-search"/);
});