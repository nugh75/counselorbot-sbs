// Legenda dei tratti usati nei diagrammi della chat.
// I verbi sono gli stessi di backend/diagram_render.py (CONNECTORS): il tratto
// che si vede e la parola che lo spiega devono dire la stessa cosa.

import type { Lang } from './i18n';
import type { DiagramEdgeKind } from './diagram-content';

type KindDict = Record<DiagramEdgeKind, string>;

const it: KindDict = {
    drives: 'porta a',
    strengthens: 'rafforza',
    weakens: 'ostacola',
    feedback: 'torna su',
    link: 'è legato a',
};

const en: KindDict = {
    drives: 'leads to',
    strengthens: 'strengthens',
    weakens: 'hinders',
    feedback: 'feeds back into',
    link: 'is linked to',
};

const es: KindDict = {
    drives: 'lleva a',
    strengthens: 'refuerza',
    weakens: 'dificulta',
    feedback: 'vuelve a',
    link: 'está ligado a',
};

const fr: KindDict = {
    drives: 'mène à',
    strengthens: 'renforce',
    weakens: 'entrave',
    feedback: 'revient sur',
    link: 'est lié à',
};

const de: KindDict = {
    drives: 'führt zu',
    strengthens: 'stärkt',
    weakens: 'behindert',
    feedback: 'wirkt zurück auf',
    link: 'ist verbunden mit',
};

const sv: KindDict = {
    drives: 'leder till',
    strengthens: 'stärker',
    weakens: 'hindrar',
    feedback: 'återverkar på',
    link: 'hänger ihop med',
};

const EDGE_KIND_DICTS: Record<Lang, KindDict> = { it, en, es, fr, de, sv };

export function edgeKindLabel(kind: DiagramEdgeKind, lang: string): string {
    const dict = EDGE_KIND_DICTS[(lang || 'it').slice(0, 2) as Lang] ?? en;
    return dict[kind];
}
