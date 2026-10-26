import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { svgAspectRatio, diagramReadingWidth } from './diagram-svg.ts';

// Le classi del diagramma vivono su due elementi diversi: `dg-svg` sul div che
// contiene il disegno, `dg-play` e `dg-focusing` sull'<svg> dentro di esso.
// Un selettore che le chiede insieme non trova mai niente, e il guasto e' muto:
// il disegno appare, non si anima, nessun errore. E' gia' successo.
const stylesheet = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf-8');
// Solo il blocco dei diagrammi: il resto del foglio ha animazioni sue, come le
// attese di caricamento, che girano all'infinito a ragione.
const css = stylesheet.slice(stylesheet.indexOf('/* ---- Diagrammi inline'));

test('every class the diagram code applies is styled somewhere', () => {
    const applied = ['dg-node', 'dg-edge', 'dg-chip', 'dg-accent', 'dg-related', 'dg-focusing'];
    for (const name of applied) {
        assert.ok(css.includes(`.${name}`), `${name} viene applicata dal codice ma non ha stile`);
    }
});

test('the accent is carried by colour, never by movement', () => {
    // Un nodo-simbolo non ha bordo da accendere: l'accento vive nel colore del
    // tracciato. E resta colore: un nodo che pulsa chiede attenzione senza
    // spiegare niente, e il movimento in un diagramma spetta agli archi.
    assert.ok(css.includes('.dg-svg .dg-accent > svg'));
    assert.equal(css.includes('dg-accent 2'), false, 'l accento non deve animarsi');
    assert.equal(css.includes('@keyframes dg-accent'), false);
});

test('the drawing does not animate: no reveal, no stroke, no flow', () => {
    // C'e' stata una comparsa a turni, il tracciato degli archi, la punta che
    // cresceva, il flusso al passaggio. Nessuna spiegava qualcosa che il
    // disegno fermo non dicesse gia', e ognuna chiedeva attenzione e
    // tolleranza al movimento in cambio di niente.
    assert.ok(css.length > 0, 'blocco dei diagrammi non trovato nel foglio di stile');
    assert.equal(css.includes('@keyframes'), false, 'nessun fotogramma nel disegno');
    assert.equal(css.includes('animation:'), false, 'nessuna animazione nel disegno');
    assert.equal(css.includes('infinite'), false);
});

test('what the reader commands still fades, because a jump reads as a glitch', () => {
    // Passo-passo e messa a fuoco non sono moto: sono due stati che cambiano
    // quando il lettore lo chiede, e la dissolvenza serve a non farli saltare.
    const base = css.slice(css.indexOf('.dg-svg .dg-node,'));
    assert.ok(base.includes('transition: opacity'));
    // Sullo stato base, non sulla classe che nasconde: dichiarata li', la
    // transizione spariva insieme alla classe e mostrare scattava.
    const hidden = css.slice(css.indexOf('.dg-svg .dg-hidden'), css.indexOf('.dg-dialog-motion'));
    assert.equal(hidden.includes('transition'), false);
});

test('asking for less motion works from inside the app, not only from the system', () => {
    // L'impostazione di sistema esiste ma quasi nessuno studente sa di averla,
    // e su un computer di scuola non puo' cambiarla. Stesse regole del blocco
    // di sistema, cosi' i due interruttori si comportano allo stesso modo.
    const sheet = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf-8');
    const inApp = sheet.slice(sheet.indexOf('[data-motion="reduced"] *'));
    assert.ok(inApp.includes('animation-duration: 0.01ms !important'));
    assert.ok(inApp.includes('animation-iteration-count: 1 !important'));
    assert.ok(inApp.includes('transition-duration: 0.01ms !important'));
});

test('centring inside a scrolling box is safe, or the start edge is lost', () => {
    const fit = css.slice(css.indexOf('.dg-fit'));
    assert.ok(fit.includes('justify-content: safe center'));
    assert.ok(fit.includes('align-items: safe center'));
});

test('the aspect ratio comes from the viewBox: the renderer strips width and height', () => {
    assert.equal(svgAspectRatio('<svg viewBox="0 0 320 900" role="img">'), 320 / 900);
    assert.equal(svgAspectRatio('<svg viewBox="0.00 0.00 640.50 320.25">'), 640.5 / 320.25);
    assert.equal(svgAspectRatio('<svg viewBox="0,0,200,100">'), 2);
});

test('a drawing without a usable viewBox falls back instead of collapsing', () => {
    assert.equal(svgAspectRatio('<svg role="img">'), null);
    assert.equal(svgAspectRatio('<svg viewBox="0 0 320">'), null);
    assert.equal(svgAspectRatio('<svg viewBox="0 0 nope 900">'), null);
    assert.equal(svgAspectRatio('<svg viewBox="0 0 320 0">'), null);
});

test('the step-by-step hides what has not had its turn', () => {
    assert.ok(css.includes('.dg-hidden'));
});

test('an edge arrives with the node it reaches, not half a turn later', () => {
    // Mezzo turno di scarto raddoppiava i turni: ogni pressione muoveva un
    // pezzo solo e i tasti sembravano inerti.
    const source = readFileSync(new URL('./diagram-svg.ts', import.meta.url), 'utf-8');
    const step = source.slice(source.indexOf('function edgeStep'), source.indexOf('export function tagDiagramSvg'));
    assert.equal(step.includes('+ 0.5'), false);
});

test('reading mode keeps the smallest SVG labels at fifteen CSS pixels', () => {
    assert.equal(diagramReadingWidth('<svg viewBox="0 0 400 800"><text font-size="12">Node</text><text font-size="10">Edge</text></svg>'), 600);
    assert.equal(diagramReadingWidth('<svg viewBox="0 0 240 100"><text font-size="15">Label</text></svg>'), 240);
});

test('reading width handles missing or invalid renderer dimensions', () => {
    assert.equal(diagramReadingWidth('<svg/>'), 320);
    assert.equal(diagramReadingWidth('<svg viewBox="0 0 0 20"/>'), 320);
    assert.equal(diagramReadingWidth('<svg viewBox="0 0 200 400"/>'), 250);
});
