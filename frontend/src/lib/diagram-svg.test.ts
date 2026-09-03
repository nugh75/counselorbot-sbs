import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Le classi del diagramma vivono su due elementi diversi: `dg-svg` sul div che
// contiene il disegno, `dg-play` e `dg-focusing` sull'<svg> dentro di esso.
// Un selettore che le chiede insieme non trova mai niente, e il guasto e' muto:
// il disegno appare, non si anima, nessun errore. E' gia' successo.
const stylesheet = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf-8');
// Solo il blocco dei diagrammi: il resto del foglio ha animazioni sue, come le
// attese di caricamento, che girano all'infinito a ragione.
const css = stylesheet.slice(stylesheet.indexOf('/* ---- Diagrammi inline'));

test('the animation classes are never asked for on the same element as dg-svg', () => {
    for (const compound of ['.dg-svg.dg-play', '.dg-svg.dg-focusing', '.dg-play.dg-svg', '.dg-focusing.dg-svg']) {
        assert.equal(css.includes(compound), false, `${compound} non puo' esistere: sono elementi diversi`);
    }
});

test('every class the diagram code applies is styled somewhere', () => {
    const applied = ['dg-node', 'dg-edge', 'dg-chip', 'dg-accent', 'dg-related', 'dg-play', 'dg-focusing'];
    for (const name of applied) {
        assert.ok(css.includes(`.${name}`), `${name} viene applicata dal codice ma non ha stile`);
    }
});

test('the reveal is replayable: its animations hang off dg-play', () => {
    // Senza `dg-play` la comparsa parte una volta sola, al montaggio, e quando
    // l'utente guarda il disegno e' gia' finita.
    for (const selector of ['.dg-play .dg-node', '.dg-play .dg-accent', '.dg-play .dg-kind-feedback']) {
        assert.ok(css.includes(selector), `manca ${selector}`);
    }
});

test('nothing in a diagram animates forever: one blinking part is noise, not explanation', () => {
    assert.ok(css.length > 0, 'blocco dei diagrammi non trovato nel foglio di stile');
    assert.equal(css.includes('infinite'), false);
});

test('reduced motion leaves the diagram whole', () => {
    assert.ok(css.includes('prefers-reduced-motion'));
});
