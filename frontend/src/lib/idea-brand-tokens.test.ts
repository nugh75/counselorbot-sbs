import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Audit UI 2026-11, finding A4: il percorso IDEA e il riquadro introduttivo della
// chat guidata erano l'unica area con una seconda tinta (teal, più rose per le
// eliminazioni), che in tema scuro non aveva voce di remap e restava chiara.
// Ora parlano solo i token del brand e di stato: questa guardia impedisce che
// teal e rose rientrino dai call-site.
const files = [
    'GuidedChatIntro', 'IdeaBranchBar', 'IdeaBranchIntro', 'IdeaBranchTree',
    'IdeaMapPanel', 'IdeaPanel', 'IdeaSourcesPanel',
].map(name => `../components/qsa/${name}.tsx`);
const sources = files.map(name => ({ name, text: readFileSync(new URL(name, import.meta.url), 'utf-8') }));
const read = (name: string) => sources.find(source => source.name.endsWith(`/${name}.tsx`))!.text;

function offending(pattern: RegExp): string[] {
    return sources.flatMap(({ name, text }) => [...text.matchAll(pattern)].map(m => `${m[0]} (${name})`));
}

test('the IDEA path and the guided intro use the brand tokens, not a second tint', () => {
    assert.deepEqual(offending(/(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|divide|accent)-(?:teal|rose)-\d{2,3}(?![\w-])/g), []);
});

test('the guided intro box is the shared Callout and keeps the heading the guide dialog uses', () => {
    // Il testid e il titolo restano sul <section>: i test del browser aprono la
    // guida dal riquadro, e l'heading serve a `aria-labelledby`.
    assert.match(read('GuidedChatIntro'), /<section aria-labelledby="guided-intro-title" data-testid="guided-intro"/);
    assert.match(read('GuidedChatIntro'), /<Callout variant="info" icon=\{Compass\}>/);
});

test('the IDEA delete flows use the danger tokens', () => {
    assert.match(read('IdeaBranchTree'), /border-danger-line bg-danger-soft/);
    assert.match(read('IdeaBranchTree'), /text-danger-ink hover:bg-danger-soft/);
    assert.match(read('IdeaMapPanel'), /border-danger-line px-2 py-1 text-xs text-danger-ink hover:bg-danger-soft/);
});