import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { autoFreezeSignature, shouldAutoFreeze } from './auto-freeze.ts';

const base = { sessionId: 'session-1', messageCount: 4, isLoading: false, completed: false };

test('a started conversation is frozen automatically', () => {
    assert.equal(shouldAutoFreeze(base), true);
});

test('the guards keep empty, busy and finished sessions out', () => {
    assert.equal(shouldAutoFreeze({ ...base, sessionId: '' }), false);
    assert.equal(shouldAutoFreeze({ ...base, messageCount: 1 }), false);
    assert.equal(shouldAutoFreeze({ ...base, isLoading: true }), false);
    assert.equal(shouldAutoFreeze({ ...base, completed: true }), false);
});

test('the signature changes only when something freezable changes', () => {
    const messages = [{ content: 'intro' }, { content: 'reply' }];
    const signature = autoFreezeSignature({ messages, currentPhase: 'exploration', responseLength: 'medium' });

    assert.equal(
        autoFreezeSignature({ messages: [...messages], currentPhase: 'exploration', responseLength: 'medium' }),
        signature,
    );
    assert.notEqual(
        autoFreezeSignature({ messages, currentPhase: 'conclusion', responseLength: 'medium' }),
        signature,
    );
    assert.notEqual(
        autoFreezeSignature({ messages, currentPhase: 'exploration', responseLength: 'long' }),
        signature,
    );
    assert.notEqual(
        autoFreezeSignature({
            messages: [...messages, { content: 'another' }],
            currentPhase: 'exploration',
            responseLength: 'medium',
        }),
        signature,
    );
    // Lo streaming allunga l'ultimo messaggio senza aggiungerne uno.
    assert.notEqual(
        autoFreezeSignature({
            messages: [{ content: 'intro' }, { content: 'reply, longer' }],
            currentPhase: 'exploration',
            responseLength: 'medium',
        }),
        signature,
    );
});

test('both chat experiences save on a turn and flush when the student leaves', () => {
    for (const file of ['GuidedChatInterface', 'OpenCodeExperience']) {
        const source = readFileSync(
            new URL(`../components/qsa/${file}.tsx`, import.meta.url),
            'utf8',
        );
        assert.match(source, /shouldAutoFreeze\(\{/, file);
        assert.match(source, /setTimeout\(\(\) => \{ void flushAutoFreeze\(\); \}, AUTO_FREEZE_DELAY_MS\)/, file);
        // Tab chiusa o link che lascia la pagina: la richiesta deve sopravvivere.
        assert.match(source, /addEventListener\('pagehide', onPageHide\)/, file);
        assert.match(source, /flushAutoFreeze\(\{ keepalive: true \}\)/, file);
        // Tasto indietro e cambio di schermata: lo smontaggio scrive comunque.
        assert.match(source, /removeEventListener\('pagehide', onPageHide\);\n\s*void flushAutoFreeze\(\);/, file);
        // Percorso concluso: chi chiude cancella lo snapshot, non va ricreato.
        assert.match(source, /completedRef\.current = true;/, file);
    }
});
