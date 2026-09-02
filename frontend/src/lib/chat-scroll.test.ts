import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { isNearBottom } from './chat-scroll.ts';

test('a reader sitting at the bottom keeps following the stream', () => {
    assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 800, clientHeight: 200 }), true);
});

test('a reader who scrolled up to re-read is left alone', () => {
    assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 200, clientHeight: 200 }), false);
});

test('the threshold leaves a few lines of slack', () => {
    // Il token successivo allunga il contenitore: senza margine la soglia
    // scivolerebbe sotto i piedi di chi sta leggendo l'ultima riga.
    assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 730, clientHeight: 200 }), true);
    assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 719, clientHeight: 200 }), false);
});

test('a transcript shorter than its box counts as being at the bottom', () => {
    assert.equal(isNearBottom({ scrollHeight: 150, scrollTop: 0, clientHeight: 200 }), true);
});

test('the streaming chats scroll their own container, never the page', () => {
    // scrollIntoView senza `block` scrolla ogni antenato fino al viewport. Con
    // un aggiornamento di stato per token questo trascinava l'intera pagina
    // decine di volte al secondo, e lo scroll risultava bloccato.
    for (const file of ['../components/qsa/GuidedChatInterface.tsx', '../components/qsa/OpenCodeExperience.tsx']) {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8');
        // La chiamata, non la parola: i commenti qui sopra spiegano perché non si usa.
        assert.doesNotMatch(source, /\.scrollIntoView\(/, `${file} deve scrollare il contenitore, non gli antenati`);
        assert.match(source, /stickToBottom/, `${file} deve smettere di inseguire chi è risalito`);
    }
});
