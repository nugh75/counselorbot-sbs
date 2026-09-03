// Legenda dei tratti usati nei diagrammi della chat.
// I verbi sono gli stessi di backend/diagram_render.py (CONNECTORS): il tratto
// che si vede e la parola che lo spiega devono dire la stessa cosa.

import type { Lang } from './i18n';
import type { DiagramEdgeKind } from './diagram-content';

type KindDict = Record<DiagramEdgeKind, string>;
type FullscreenAction = 'open' | 'close';

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

const FULLSCREEN_LABELS: Record<Lang, Record<FullscreenAction, string>> = {
    it: { open: 'Apri il diagramma a schermo intero', close: 'Chiudi lo schermo intero' },
    en: { open: 'Open diagram full screen', close: 'Close full screen' },
    es: { open: 'Abrir el diagrama a pantalla completa', close: 'Cerrar pantalla completa' },
    fr: { open: 'Ouvrir le diagramme en plein écran', close: 'Fermer le plein écran' },
    de: { open: 'Diagramm im Vollbild öffnen', close: 'Vollbild schließen' },
    sv: { open: 'Öppna diagrammet i helskärmsläge', close: 'Stäng helskärmsläget' },
};

type ZoomAction = 'in' | 'out' | 'reset';

const ZOOM_LABELS: Record<Lang, Record<ZoomAction, string>> = {
    it: { in: 'Ingrandisci', out: 'Rimpicciolisci', reset: 'Torna alla dimensione originale' },
    en: { in: 'Zoom in', out: 'Zoom out', reset: 'Reset to original size' },
    es: { in: 'Ampliar', out: 'Reducir', reset: 'Volver al tamaño original' },
    fr: { in: 'Agrandir', out: 'Réduire', reset: 'Revenir à la taille initiale' },
    de: { in: 'Vergrößern', out: 'Verkleinern', reset: 'Originalgröße wiederherstellen' },
    sv: { in: 'Förstora', out: 'Förminska', reset: 'Återställ ursprunglig storlek' },
};

const REPLAY_LABELS: Record<Lang, string> = {
    it: 'Rivedi la comparsa del diagramma',
    en: 'Play the diagram again',
    es: 'Ver de nuevo la aparición del diagrama',
    fr: 'Revoir l’apparition du diagramme',
    de: 'Aufbau des Diagramms erneut zeigen',
    sv: 'Spela upp diagrammet igen',
};

type StepAction = 'back' | 'forward';

const STEP_LABELS: Record<Lang, Record<StepAction, string>> = {
    it: { back: 'Un passo indietro', forward: 'Un passo avanti' },
    en: { back: 'One step back', forward: 'One step forward' },
    es: { back: 'Un paso atrás', forward: 'Un paso adelante' },
    fr: { back: 'Un pas en arrière', forward: 'Un pas en avant' },
    de: { back: 'Einen Schritt zurück', forward: 'Einen Schritt vor' },
    sv: { back: 'Ett steg tillbaka', forward: 'Ett steg framåt' },
};

export function diagramStepLabel(action: StepAction, lang: string): string {
    const dict = STEP_LABELS[(lang || 'it').slice(0, 2) as Lang] ?? STEP_LABELS.en;
    return dict[action];
}

export function diagramReplayLabel(lang: string): string {
    return REPLAY_LABELS[(lang || 'it').slice(0, 2) as Lang] ?? REPLAY_LABELS.en;
}

export function diagramZoomLabel(action: ZoomAction, lang: string): string {
    const dict = ZOOM_LABELS[(lang || 'it').slice(0, 2) as Lang] ?? ZOOM_LABELS.en;
    return dict[action];
}

export function edgeKindLabel(kind: DiagramEdgeKind, lang: string): string {
    const dict = EDGE_KIND_DICTS[(lang || 'it').slice(0, 2) as Lang] ?? en;
    return dict[kind];
}

export function diagramFullscreenLabel(action: FullscreenAction, lang: string): string {
    const dict = FULLSCREEN_LABELS[(lang || 'it').slice(0, 2) as Lang] ?? FULLSCREEN_LABELS.en;
    return dict[action];
}
