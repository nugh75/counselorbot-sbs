import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { normalizeChatMarkdown } from './chat-markdown.ts';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { diagramContentForSpeech } from './diagram-content.ts';

test('repairs the QPCC runaway table separator without changing scores or prose', () => {
    const before = '| Fattore | Valore | Lettura |\n';
    const after = '\n| A1 | 5 | Un esempio. |\n\nUna domanda finale?';
    const raw = before + '| :------- | -------: | :' + '-'.repeat(53776) + '</small>\n' + after;
    const clean = normalizeChatMarkdown(raw);
    assert.equal(clean, before + '| :--- | ---: | :--- |\n' + after);
    assert.equal(normalizeChatMarkdown(clean), clean);
});

test('hides wrapped and canonical recommendation metadata in saved messages and speech', () => {
    for (const value of [{notes: []}, {recommendations: {notes: []}}, {reading: [], strategy: [], notes: []}]) {
        const text = 'Prima.\n```json\n' + JSON.stringify(value) + '\n```\nDopo.';
        assert.equal(normalizeChatMarkdown(text), 'Prima.\n\nDopo.');
        assert.equal(diagramContentForSpeech(text), 'Prima.\n\nDopo.');
    }
    assert.equal(normalizeChatMarkdown('Prima.\n<recommendations>{"notes":[]}</recommendations>\nDopo.'), 'Prima.\n\nDopo.');
    assert.equal(normalizeChatMarkdown('Prima.\n```recommendations\n{broken'), 'Prima.\n');
});

test('preserves public JSON, code examples, rules, alignment and visible contents of small', () => {
    for (const text of ['```json\n{"person":{"notes":[]}}\n```', '```html\n<small>test</small>\n```',
        '```text\n| X | Y |\n| ----- | ----- |\n```', '---\nUna pausa.', '2 - 3 = -1', 'Il tag `<small>` rimane codice.', '<small-box>Una parola.</small-box>']) {
        assert.equal(normalizeChatMarkdown(text), text);
    }
    assert.equal(normalizeChatMarkdown('<small>Un dettaglio leggibile.</small>'), 'Un dettaglio leggibile.');
});
