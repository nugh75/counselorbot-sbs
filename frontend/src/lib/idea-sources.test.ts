import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = () => readFileSync(new URL('./idea-sources.ts', import.meta.url), 'utf8');
const panel = () => readFileSync(new URL('../components/qsa/IdeaSourcesPanel.tsx', import.meta.url), 'utf8');
const workspace = () => readFileSync(new URL('../components/qsa/IdeaWorkspace.tsx', import.meta.url), 'utf8');

test('searching and keeping are two different calls', () => {
    const source = client();
    // Cercare non deve poter scrivere: sono due endpoint, e il secondo parte
    // solo dal gesto della persona.
    assert.match(source, /'\/api\/idea\/sources\/search'[\s\S]{0,200}method: 'POST'/);
    assert.match(source, /'\/api\/idea\/sources'[\s\S]{0,200}method: 'POST'/);
});

test('the search never fires on its own', () => {
    const source = panel();
    // Nessun effetto lancia la ricerca: parte dal submit del form e basta.
    assert.doesNotMatch(source, /useEffect\([^)]*\)\s*=>\s*\{[^}]*void run\(\)/);
    assert.match(source, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); void run\(\); \}\}/);
});

test('a result becomes a kept source only when the person keeps it', () => {
    const source = panel();
    assert.match(source, /onClick=\{\(\) => void keepOne\(item\)\}/);
    assert.match(source, /keepIdeaSources\(sessionId, focus, \[item\]\)/);
});

test('sources belong to the branch in hand, not to the session', () => {
    const source = panel();
    assert.match(source, /fetchIdeaKeptSources\(sessionId, focus\)/);
    // Cambiando ramo i risultati di prima non restano sullo schermo.
    assert.match(source, /setResults\(null\);[\s\S]{0,120}\}, \[focus\]\);/);
    assert.match(workspace(), /<IdeaSourcesPanel[\s\S]{0,200}focus=\{move\?\.focus \?\? null\}/);
});
