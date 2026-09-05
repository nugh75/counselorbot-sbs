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

type StepAction = 'back' | 'forward' | 'first';

const STEP_LABELS: Record<Lang, Record<StepAction, string>> = {
    it: { back: 'Un passo indietro', forward: 'Un passo avanti', first: 'Riparti dal primo passo' },
    en: { back: 'One step back', forward: 'One step forward', first: 'Start again from the first step' },
    es: { back: 'Un paso atrás', forward: 'Un paso adelante', first: 'Volver al primer paso' },
    fr: { back: 'Un pas en arrière', forward: 'Un pas en avant', first: 'Repartir de la première étape' },
    de: { back: 'Einen Schritt zurück', forward: 'Einen Schritt vor', first: 'Wieder beim ersten Schritt beginnen' },
    sv: { back: 'Ett steg tillbaka', forward: 'Ett steg framåt', first: 'Börja om från första steget' },
};

export function diagramStepLabel(action: StepAction, lang: string): string {
    const dict = STEP_LABELS[(lang || 'it').slice(0, 2) as Lang] ?? STEP_LABELS.en;
    return dict[action];
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

type RequestAction = 'retry' | 'unavailable' | 'unsuitable' | 'disabled' | 'saved' | 'renderFailed';
const REQUEST_LABELS: Record<Lang, Record<RequestAction, string>> = {
    it: { retry: 'Riprova', unavailable: 'Il servizio non risponde. Riprova tra poco.', unsuitable: 'Non è stato possibile ricavare un diagramma. Prova a precisare la richiesta.', disabled: 'I diagrammi non sono disponibili per questa sessione.', saved: 'Diagramma salvato nella sessione', renderFailed: 'Impossibile mostrare il disegno. Le relazioni sono riportate qui sotto.' },
    en: { retry: 'Retry', unavailable: 'The service is not responding. Try again shortly.', unsuitable: 'A diagram could not be created. Try clarifying your request.', disabled: 'Diagrams are unavailable for this session.', saved: 'Diagram saved in the session', renderFailed: 'The drawing could not be displayed. Its relationships are listed below.' },
    es: { retry: 'Reintentar', unavailable: 'El servicio no responde. Inténtalo de nuevo en unos instantes.', unsuitable: 'No se pudo crear un diagrama. Intenta precisar la solicitud.', disabled: 'Los diagramas no están disponibles para esta sesión.', saved: 'Diagrama guardado en la sesión', renderFailed: 'No se pudo mostrar el dibujo. Las relaciones se indican a continuación.' },
    fr: { retry: 'Réessayer', unavailable: 'Le service ne répond pas. Réessayez dans un instant.', unsuitable: 'Le diagramme n’a pas pu être créé. Essayez de préciser la demande.', disabled: 'Les diagrammes ne sont pas disponibles pour cette session.', saved: 'Diagramme enregistré dans la session', renderFailed: 'Le dessin ne peut pas être affiché. Ses relations sont indiquées ci-dessous.' },
    de: { retry: 'Erneut versuchen', unavailable: 'Der Dienst antwortet nicht. Versuche es gleich noch einmal.', unsuitable: 'Das Diagramm konnte nicht erstellt werden. Präzisiere deine Anfrage.', disabled: 'Diagramme sind für diese Sitzung nicht verfügbar.', saved: 'Diagramm in der Sitzung gespeichert', renderFailed: 'Die Zeichnung konnte nicht angezeigt werden. Ihre Beziehungen stehen unten.' },
    sv: { retry: 'Försök igen', unavailable: 'Tjänsten svarar inte. Försök igen om en stund.', unsuitable: 'Ett diagram kunde inte skapas. Försök förtydliga din begäran.', disabled: 'Diagram är inte tillgängliga för den här sessionen.', saved: 'Diagrammet sparades i sessionen', renderFailed: 'Bilden kunde inte visas. Sambanden anges nedan.' },
};

export function diagramRequestLabel(action: RequestAction, lang: string): string {
    return (REQUEST_LABELS[(lang || 'it').slice(0, 2) as Lang] ?? REQUEST_LABELS.en)[action];
}
