import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { branchCommands } from './idea-branching.ts';
import type { IdeaBranch } from './idea-map';

const chat = () => readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');
const intro = () => readFileSync(new URL('../components/qsa/IdeaBranchIntro.tsx', import.meta.url), 'utf8');
const panel = () => readFileSync(new URL('../components/qsa/IdeaMapPanel.tsx', import.meta.url), 'utf8');
const diagram = () => readFileSync(new URL('../components/ui/DiagramBlock.tsx', import.meta.url), 'utf8');
const viewport = () => readFileSync(new URL('../components/ui/DiagramViewport.tsx', import.meta.url), 'utf8');
const workspace = () => readFileSync(new URL('../components/qsa/IdeaWorkspace.tsx', import.meta.url), 'utf8');
const tree = () => readFileSync(new URL('../components/qsa/IdeaBranchTree.tsx', import.meta.url), 'utf8');

test('the transcript follows the branch instead of running in one line', () => {
    const source = chat();
    // Ogni cambio di fuoco apre un tratto: e' cio' che rende la chat una
    // sequenza per ramo e non un elenco unico.
    assert.match(source, /setIdeaSegments\(\(rows\) =>/);
    assert.match(source, /\{ branchId: ideaFocus, start: messageCountRef\.current \}/);
    assert.match(source, /visibleMessages\.map\(\(\{ message: msg, index: idx \}\) =>/);
});

test('nothing is deleted when a branch is filtered out', () => {
    const source = chat();
    // Il filtro vive solo nel rendering: lo stato dei messaggi resta intero,
    // altrimenti congelare e riprendere una sessione perderebbe i rami chiusi.
    assert.match(source, /const hiddenMessages = messages\.length - visibleMessages\.length/);
    assert.doesNotMatch(source, /setMessages\([^)]*visibleMessages/);
});

test('branch commands sit next to the composer', () => {
    const source = chat();
    assert.match(source, /<IdeaBranchBar/);
    const formStart = source.indexOf('<form onSubmit={handleSend}');
    const composer = source.slice(formStart, source.indexOf('</form>', formStart));
    assert.match(composer, /<IdeaBranchBar/);
    assert.match(composer, /<AutoGrowTextarea/);
});

test('the map is inline so its nodes can be clicked', () => {
    const source = panel();
    // Dentro un <img> l'SVG non riceve click: serve inline.
    assert.doesNotMatch(source, /<img\s/);
    assert.match(source, /<DiagramBlock/);
    assert.match(source, /renderedSvg=\{svg\}/);
    assert.match(diagram(), /<DiagramViewport/);
    assert.match(viewport(), /dangerouslySetInnerHTML/);
    assert.match(viewport(), /closest\('\.dg-node'\)/);
});

test('clicking any node lands on the branch that owns it', () => {
    // set_focus accetta solo nodi-ramo: senza owners un click su un'ipotesi
    // finirebbe in 422.
    assert.match(panel(), /onPickNode=\{onPickNode \? (\w+) => onPickNode\(state\?\.owners\?\.\[\1\] \?\? \1\)/);
    assert.match(diagram(), /if \(id\) onPickNode\?\.\(id\)/);
    assert.match(diagram(), /onSelect=\{select\}/);
    assert.match(workspace(), /moveIdeaFocus\(sessionId, nodeId\)/);
});

test('a branch other than the first one opens on an empty chat', () => {
    const source = chat();
    // L'apertura - quel che si e' detto prima che esistesse un ramo - resta al
    // primo ramo: senza questo il ramo nuovo eredita una conversazione che non
    // e' la sua e non si capisce piu' dove si e' finiti.
    assert.match(source, /if \(index < opening\.start\) return opening\.branchId === ideaFocus;/);
});

test('the empty branch says how it was born, what it hangs from and what is done in it', () => {
    const source = intro();
    assert.match(source, /branch\.origin === 'manual'/);
    assert.match(source, /rows\.find\(\(row\) => row\.id === branch\.parent\)/);
    assert.match(source, /idea\.branches\.intro\.doing/);
    assert.match(source, /empty && \(/);
    // La scheda resta in testa al ramo anche quando il ramo ha gia' messaggi.
    assert.match(chat(), /<IdeaBranchIntro[\s\S]{0,240}empty=\{visibleMessages\.length === 0\}/);
});

// --- i comandi sull'albero dei rami ---

const branchRow = (over: Partial<IdeaBranch> & { id: string }): IdeaBranch => ({
    label: over.id,
    task_type: 'systematic-review',
    task_label: null,
    depth: 1,
    parent: 'idea',
    closed: false,
    conclusion: null,
    missing_roles: [],
    flaws: 0,
    is_focus: false,
    wants_plan: true,
    origin: 'conversation',
    demoted: false,
    ...over,
});

const TREE: IdeaBranch[] = [
    branchRow({ id: 'idea', depth: 0, parent: null }),
    branchRow({ id: 't1' }),
    branchRow({ id: 's1', depth: 2, parent: 't1' }),
    branchRow({ id: 't2' }),
];

test('the first branch cannot go up and the last cannot go down', () => {
    assert.equal(branchCommands(TREE, 't1').up, false);
    assert.equal(branchCommands(TREE, 't1').down, true);
    assert.equal(branchCommands(TREE, 't2').up, true);
    assert.equal(branchCommands(TREE, 't2').down, false);
});

test('the idea itself takes no commands', () => {
    // La radice e' la mappa: spostarla o cancellarla non vuol dire niente.
    assert.deepEqual(branchCommands(TREE, 'idea'), {
        up: false, down: false, indent: false, outdent: false, remove: false, restore: false,
    });
});

test('a branch that already carries a sub-branch cannot be nested deeper', () => {
    // t1 ha s1 sotto: annidarlo porterebbe s1 al terzo livello di lavoro.
    assert.equal(branchCommands(TREE, 't1').indent, false);
    assert.equal(branchCommands(TREE, 't2').indent, true);
});

test('only a branch under another branch can be sent up a level', () => {
    assert.equal(branchCommands(TREE, 's1').outdent, true);
    assert.equal(branchCommands(TREE, 't1').outdent, false);
});

test('putting a node back to being a branch is offered only where it applies', () => {
    const demoted = [...TREE, branchRow({ id: 'c1', depth: 0, demoted: true })];
    assert.equal(branchCommands(demoted, 'c1').restore, true);
    assert.equal(branchCommands(demoted, 't1').restore, false);
});

test('the panel sends the commands to the server and asks before deleting', () => {
    const source = tree();
    assert.match(source, /arrangeIdeaBranch\(sessionId, row\.id, op\)/);
    assert.match(source, /deleteIdeaBranch\(sessionId, .*cascade/);
    // La cancellazione non parte da un clic solo: si sceglie cosa fare di
    // quello che ci pende sotto.
    assert.match(source, /idea\.branches\.deleteOnly/);
    assert.match(source, /idea\.branches\.deleteAll/);
});
