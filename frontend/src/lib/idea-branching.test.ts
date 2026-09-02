import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chat = () => readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');
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
