import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chat = () => readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');
const intro = () => readFileSync(new URL('../components/qsa/IdeaBranchIntro.tsx', import.meta.url), 'utf8');
const panel = () => readFileSync(new URL('../components/qsa/IdeaMapPanel.tsx', import.meta.url), 'utf8');
const workspace = () => readFileSync(new URL('../components/qsa/IdeaWorkspace.tsx', import.meta.url), 'utf8');

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
    assert.match(source, /<form onSubmit=\{handleSend\}[\s\S]{0,400}<IdeaBranchBar/);
});

test('the map is inline so its nodes can be clicked', () => {
    const source = panel();
    // Dentro un <img> l'SVG non riceve click: serve inline.
    assert.doesNotMatch(source, /<img\s/);
    assert.match(source, /dangerouslySetInnerHTML/);
    assert.match(source, /closest\('g\.node'\)/);
});

test('clicking any node lands on the branch that owns it', () => {
    // set_focus accetta solo nodi-ramo: senza owners un click su un'ipotesi
    // finirebbe in 422.
    assert.match(panel(), /state\?\.owners\?\.\[nodeId\] \?\? nodeId/);
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
