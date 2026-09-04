import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { svgAspectRatio, walkStep } from './diagram-svg.ts';

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

test('the accent is carried by colour, never by movement', () => {
    // Un nodo-simbolo non ha bordo da accendere: l'accento vive nel colore del
    // tracciato. E resta colore: un nodo che pulsa chiede attenzione senza
    // spiegare niente, e il movimento in un diagramma spetta agli archi.
    assert.ok(css.includes('.dg-svg .dg-accent > svg'));
    assert.equal(css.includes('dg-accent 2'), false, 'l accento non deve animarsi');
    assert.equal(css.includes('@keyframes dg-accent'), false);
});

test('the reveal is replayable: its animations hang off dg-play', () => {
    // Senza `dg-play` la comparsa parte una volta sola, al montaggio, e quando
    // l'utente guarda il disegno e' gia' finita.
    for (const selector of ['.dg-play .dg-node', '.dg-play .dg-edge', '.dg-play .dg-kind-feedback']) {
        assert.ok(css.includes(selector), `manca ${selector}`);
    }
});

test('nothing animates forever on its own: perpetual motion is asked for, never offered', () => {
    // Un pezzo che si muove per sempre accanto a chi legge da' la nausea a chi
    // ha un disturbo vestibolare e ruba il turno alla lettura a tutti gli
    // altri; WCAG 2.2.2 vuole un modo per fermarlo. Qui il modo e' togliere il
    // dito: ogni `infinite` deve vivere dentro un `:hover`.
    assert.ok(css.length > 0, 'blocco dei diagrammi non trovato nel foglio di stile');
    for (const rule of css.split('}')) {
        if (!rule.includes('infinite')) continue;
        assert.ok(rule.includes(':hover'), `movimento perpetuo fuori da :hover -> ${rule.trim().slice(0, 80)}`);
    }
});

test('asking for less motion works from inside the app, not only from the system', () => {
    // L'impostazione di sistema esiste ma quasi nessuno studente sa di averla,
    // e su un computer di scuola non puo' cambiarla.
    const inApp = css.slice(css.indexOf('[data-motion="reduced"]'));
    assert.ok(inApp.includes('animation: none !important'));
    assert.ok(inApp.includes('transform: none !important'));
});

test('reduced motion leaves the diagram whole', () => {
    assert.ok(css.includes('prefers-reduced-motion'));
    // Le regole di gioco sono piu' specifiche di quelle che le spengono: senza
    // `!important` il tracciato dell'arco sopravviveva ed era l'unico effetto
    // in piedi, che e' esattamente il guasto che si vedeva.
    const quiet = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    assert.ok(quiet.includes('animation: none !important'));
    assert.ok(quiet.includes('transform: none !important'));
});

test('the stroke length lives in the keyframes, not in the rule', () => {
    // Come dichiarazione fissa `stroke-dasharray` batte l'attributo di
    // Graphviz finche' `dg-play` resta posata: `weakens` e `link` si vedevano
    // pieni e la legenda mentiva.
    const rule = css.slice(css.indexOf('.dg-play .dg-edge:is('), css.indexOf('@keyframes dg-draw'));
    assert.equal(rule.includes('stroke-dasharray'), false);
    assert.ok(css.slice(css.indexOf('@keyframes dg-draw')).includes('stroke-dasharray'));
});

test('only solid edges are drawn stroke by stroke', () => {
    assert.ok(css.includes('.dg-play .dg-edge:is(.dg-kind-drives, .dg-kind-strengthens) path'));
});

test('the reveal waits: armed at mount, held until the card is seen', () => {
    assert.ok(css.includes('.dg-hold'));
    assert.ok(css.slice(css.indexOf('.dg-hold')).includes('animation-play-state: paused'));
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

test('the reveal fills backwards, or a finished animation would pin the opacity', () => {
    // `both` blocca l'opacita' sul valore finale, e un'animazione conclusa batte
    // le regole normali: la messa a fuoco non riusciva piu' a sbiadire nulla.
    const enter = css.slice(css.indexOf('.dg-play .dg-node'), css.indexOf('@keyframes dg-enter'));
    assert.ok(enter.includes('backwards'), 'la comparsa deve riempire solo all indietro');
    assert.equal(enter.includes(' both'), false);
});

test('the step-by-step hides what has not had its turn', () => {
    assert.ok(css.includes('.dg-hidden'));
});

test('the walk is tagged and revealed in one pass, on every step', () => {
    // Classificazione e passo stavano in due effetti con dipendenze diverse:
    // un passo poteva lavorare su un disegno che quel ramo non aveva mai
    // classificato, e il contatore avanzava mentre il disegno restava intero.
    const block = readFileSync(new URL('../components/ui/DiagramBlock.tsx', import.meta.url), 'utf-8');
    const start = block.indexOf('useLayoutEffect(() => {');
    const deps = block.indexOf('}, [', start);
    const effect = block.slice(start, block.indexOf(');', deps));
    assert.ok(effect.includes('tagDiagramSvg('), 'la classificazione deve stare qui');
    assert.ok(effect.includes('revealUpTo('), 'il passo deve stare nello stesso effetto');
    assert.ok(/\}, \[[^\]]*\bstep\b[^\]]*\]/.test(effect), 'e deve rifarsi a ogni passo');
});

test('the walk beats a reveal still running', () => {
    // Un'animazione batte una dichiarazione normale ma non una importante:
    // senza, mentre la comparsa e' in corso (o in pausa in attesa di essere
    // guardata) premere un passo non cambiava niente.
    const hidden = css.slice(css.indexOf('.dg-svg .dg-hidden'));
    assert.ok(hidden.includes('opacity: 0 !important'));
});

test('the walk fades in both directions', () => {
    // Dichiarata sulla classe che nasconde, la transizione se ne andava con
    // lei: nascondere sfumava, mostrare scattava.
    const hidden = css.slice(css.indexOf('.dg-svg .dg-hidden'), css.indexOf('.dg-svg .dg-node { cursor'));
    assert.equal(hidden.includes('transition'), false);
    const base = css.slice(css.indexOf('.dg-svg .dg-node,'), css.indexOf('@keyframes dg-draw'));
    assert.ok(base.includes('transition: opacity'));
});

test('one number governs the rhythm, and it is defined', () => {
    // `var()` senza definizione rende invalido il `calc()`: il ritardo torna a
    // zero e tutto il disegno entra insieme, senza un errore.
    assert.ok(/\.dg-svg\s*\{[^}]*--dg-beat:\s*\d+ms/.test(css));
    assert.ok(css.includes('calc(var(--dg-step, 0) * var(--dg-beat))'));
    assert.equal(/animation-delay:[^;]*\d+ms\)(?![^;]*--dg-beat)/.test(
        css.replace(/calc\(var\(--dg-step, 0\) \* var\(--dg-beat\)[^;]*\)/g, 'BEAT'),
    ), false);
});

test('the walk is entered from the first turn, whichever arrow is pressed', () => {
    // Entrando dalla fine spariva un pezzo solo e i tasti sembravano inerti.
    assert.equal(walkStep(null, 7, 'forward'), 0);
    assert.equal(walkStep(null, 7, 'back'), 0);
});

test('the walk advances, stops at the start and leaves at the end', () => {
    assert.equal(walkStep(0, 7, 'forward'), 1);
    assert.equal(walkStep(0, 7, 'back'), 0);
    assert.equal(walkStep(5, 7, 'forward'), 6);
    assert.equal(walkStep(6, 7, 'forward'), null);
    assert.equal(walkStep(6, 7, 'back'), 5);
});

test('an edge arrives with the node it reaches, not half a turn later', () => {
    // Mezzo turno di scarto raddoppiava i turni: ogni pressione muoveva un
    // pezzo solo e i tasti sembravano inerti.
    const source = readFileSync(new URL('./diagram-svg.ts', import.meta.url), 'utf-8');
    const step = source.slice(source.indexOf('function edgeStep'), source.indexOf('export function tagDiagramSvg'));
    assert.equal(step.includes('+ 0.5'), false);
});

test('a drawing with nothing to walk stays whole', () => {
    assert.equal(walkStep(null, 0, 'forward'), null);
});
