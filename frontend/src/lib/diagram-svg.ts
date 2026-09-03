import type { DiagramEdge, DiagramSpec } from './diagram-content';

// Le etichette dei nodi le scrive un modello, sollecitato da cio' che lo
// studente digita. Graphviz le mette in nodi di testo con le entita' XML gia'
// applicate, quindi non ci sono attributi iniettabili; questa e' la seconda
// serratura, non la prima, e vale finche' l'SVG resta un disegno e non un
// documento con collegamenti o script.
const ALLOWED_HREF = /^#/;

export function sanitizeSvgMarkup(markup: string): string | null {
    if (typeof window === 'undefined') return null;
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = parsed.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || root.querySelector('parsererror')) return null;

    for (const element of Array.from(root.querySelectorAll('script, foreignObject, style, iframe'))) {
        element.remove();
    }
    for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
        for (const attribute of Array.from(element.attributes)) {
            const name = attribute.name.toLowerCase();
            if (name.startsWith('on')) element.removeAttribute(attribute.name);
            else if ((name === 'href' || name === 'xlink:href') && !ALLOWED_HREF.test(attribute.value)) {
                element.removeAttribute(attribute.name);
            }
        }
    }
    return new XMLSerializer().serializeToString(root);
}

// Il disegno arriva senza nomi: graphviz 2.42 ignora l'attributo `class`, ma
// scrive in ogni gruppo il `<title>` con l'id del nodo o "a->b". Lo spec, che
// il browser ha gia', dice il resto: quale nodo e' l'accento, di che tipo e'
// ogni arco. Da qui in poi il CSS ha appigli.
const EDGE_LABEL_PREFIX = '__diagram_edge_label_';

function titleOf(group: Element): string {
    return group.querySelector(':scope > title')?.textContent?.trim() ?? '';
}

/** Indice dell'arco a cui appartiene una pastiglia di etichetta, o null. */
function labelChipIndex(id: string): number | null {
    if (!id.startsWith(EDGE_LABEL_PREFIX)) return null;
    const index = Number.parseInt(id.slice(EDGE_LABEL_PREFIX.length).replace(/_+$/, ''), 10);
    return Number.isNaN(index) ? null : index;
}

/** Un arco compare quando esistono i due capi che collega. */
function edgeStep(edge: DiagramEdge | undefined, nodeOrder: Map<string, number>): number {
    if (!edge) return 0;
    return Math.max(nodeOrder.get(edge.from) ?? 0, nodeOrder.get(edge.to) ?? 0) + 0.5;
}

/** Classifica il disegno e ritorna quanti turni servono a mostrarlo tutto. */
export function tagDiagramSvg(root: Element, spec: DiagramSpec): number {
    const nodeOrder = new Map(spec.nodes.map((node, index) => [node.id, index]));
    const accents = new Set(spec.nodes.filter((node) => node.accent).map((node) => node.id));
    const edges = spec.edges ?? [];
    const steps: Array<{ element: Element; step: number }> = [];

    for (const group of Array.from(root.querySelectorAll('g.node'))) {
        const id = titleOf(group);
        const chip = labelChipIndex(id);
        if (chip !== null) {
            const edge = edges[chip];
            group.classList.add('dg-chip', `dg-kind-${edge?.kind ?? 'drives'}`);
            if (edge) {
                group.setAttribute('data-from', edge.from);
                group.setAttribute('data-to', edge.to);
            }
            steps.push({ element: group, step: edgeStep(edge, nodeOrder) });
            continue;
        }
        group.classList.add('dg-node');
        if (accents.has(id)) group.classList.add('dg-accent');
        group.setAttribute('data-node', id);
        steps.push({ element: group, step: nodeOrder.get(id) ?? 0 });
    }

    for (const group of Array.from(root.querySelectorAll('g.edge'))) {
        const [rawSource = '', rawTarget = ''] = titleOf(group).split('->');
        const chip = labelChipIndex(rawSource.trim()) ?? labelChipIndex(rawTarget.trim());
        const edge = chip !== null
            ? edges[chip]
            : edges.find((candidate) => candidate.from === rawSource.trim() && candidate.to === rawTarget.trim());
        group.classList.add('dg-edge', `dg-kind-${edge?.kind ?? 'drives'}`);
        if (edge) {
            group.setAttribute('data-from', edge.from);
            group.setAttribute('data-to', edge.to);
        }
        steps.push({ element: group, step: edgeStep(edge, nodeOrder) });
    }

    // I passi grezzi hanno mezze misure e ripetizioni: qui diventano turni
    // consecutivi, cosi' il ritardo dipende da quanti turni servono e non da
    // quanti nodi ci sono.
    const ordered = [...new Set(steps.map((entry) => entry.step))].sort((a, b) => a - b);
    for (const { element, step } of steps) {
        const turn = ordered.indexOf(step);
        element.setAttribute('data-dg-step', String(turn));
        // La lunghezza del tratto serve al disegno che si traccia: senza, l'arco
        // puo' solo comparire, non essere percorso da un capo all'altro.
        const length = edgeLength(element);
        element.setAttribute('style', `--dg-step:${turn}${length ? `;--dg-len:${length}` : ''}`);
    }
    return ordered.length;
}

function edgeLength(element: Element): number | null {
    if (!element.classList.contains('dg-edge')) return null;
    const path = element.querySelector('path');
    if (!path || typeof (path as SVGPathElement).getTotalLength !== 'function') return null;
    try {
        const length = Math.ceil((path as SVGPathElement).getTotalLength());
        return Number.isFinite(length) && length > 0 ? length : null;
    } catch {
        return null;
    }
}

/**
 * Il passo successivo del percorso. `null` e' il disegno intero.
 *
 * Da intero si entra sempre dal primo turno, in tutte e due le direzioni:
 * entrare dalla fine faceva sparire un pezzo solo, e i tasti sembravano rotti.
 * Oltre l'ultimo turno si esce, e il disegno torna intero.
 */
export function walkStep(step: number | null, turns: number, direction: 'back' | 'forward'): number | null {
    if (turns < 1) return null;
    if (step === null) return 0;
    if (direction === 'back') return Math.max(0, step - 1);
    return step + 1 > turns - 1 ? null : step + 1;
}

/**
 * Mostra il disegno fino a un certo turno: e' il passo-passo, quando lo
 * studente lo percorre a mano invece di guardarlo scorrere.
 */
export function revealUpTo(root: Element, step: number | null) {
    for (const element of Array.from(root.querySelectorAll('[data-dg-step]'))) {
        const turn = Number(element.getAttribute('data-dg-step') ?? 0);
        element.classList.toggle('dg-hidden', step !== null && turn > step);
    }
}

/**
 * Mette a fuoco un nodo: restano lui e cio' che tocca, il resto sbiadisce.
 * Su un grafo denso e' la differenza fra leggibile e illeggibile.
 */
export function focusDiagramNode(root: Element, nodeId: string | null) {
    root.classList.toggle('dg-focusing', Boolean(nodeId));
    for (const group of Array.from(root.querySelectorAll('.dg-node, .dg-edge, .dg-chip'))) {
        const related = nodeId !== null && (
            group.getAttribute('data-node') === nodeId
            || group.getAttribute('data-from') === nodeId
            || group.getAttribute('data-to') === nodeId
        );
        group.classList.toggle('dg-related', related);
    }
}
