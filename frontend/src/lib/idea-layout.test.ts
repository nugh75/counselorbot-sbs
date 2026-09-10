import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chat = () => readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');
const workspace = () => readFileSync(new URL('../components/qsa/ChatWorkspace.tsx', import.meta.url), 'utf8');
const tabs = () => readFileSync(new URL('../components/qsa/IdeaTabs.tsx', import.meta.url), 'utf8');
const panel = () => readFileSync(new URL('../components/qsa/IdeaPanel.tsx', import.meta.url), 'utf8');

test('on a wide screen the map sits beside the chat instead of under it', () => {
    const source = chat();
    // Sotto la conversazione la mappa si raggiungeva solo scorrendo, e la
    // mappa e' la cosa che deve restare sotto gli occhi mentre si scrive.
    assert.match(source, /<IdeaPanel/);
    assert.doesNotMatch(source, /<IdeaWorkspace/);
});

test('the Idea panel is wider than the one built for a list of recommendations', () => {
    // Una mappa in 480 px non si legge; un elenco di consigli in 720 si.
    assert.match(workspace(), /panelBounds\??: \{ min: number; max: number; initial: number \}/);
    assert.match(workspace(), /panelBounds = \{ min: 260, max: 480, initial: 300 \}/);
    assert.match(chat(), /IDEA_PANEL_BOUNDS/);
    assert.match(chat(), /\{ min: 360, max: 720, initial: 480 \}/);
});

test('the wide Idea panel does not become the width of every other tool', () => {
    assert.match(workspace(), /preferenceKey = 'cb_chat_panel'/);
    assert.match(chat(), /cb_chat_panel_idea/);
});

test('on a phone Idea offers tabs instead of one long stack', () => {
    const source = tabs();
    assert.match(source, /'chat' \| 'map' \| 'branches' \| 'sources'/);
    assert.match(source, /useState<IdeaTab>\('chat'\)/);
    assert.match(source, /role="tab"/);
    // I riquadri restano montati: smontare la chat perderebbe lo streaming in
    // corso e la posizione della trascrizione.
    assert.match(source, /hidden=\{active !== /);
    assert.doesNotMatch(source, /active === 'chat' \? chat :/);
});

test('the kept sources keep the full width, they are long lines of text', () => {
    assert.match(chat(), /<IdeaSourcesPanel/);
    assert.doesNotMatch(panel(), /IdeaSourcesPanel/);
});
