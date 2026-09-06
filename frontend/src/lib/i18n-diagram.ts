// Legenda dei tratti usati nei diagrammi della chat.
// I verbi sono gli stessi di backend/diagram_render.py (CONNECTORS): il tratto
// che si vede e la parola che lo spiega devono dire la stessa cosa.

import type { Lang } from './i18n';
import type { DiagramEdgeKind } from './diagram-content';

const diagramUiIt = {
    overview: 'Panoramica', reading: 'Lettura', walk: 'Passo-passo', whole: 'Mostra tutto',
    expand: 'Espandi', tools: 'Zoom ed esportazione', fit: 'Adatta allo spazio',
    text: 'Leggi come testo', hideText: 'Chiudi il testo', clear: 'Togli la selezione',
    exploreHint: 'Seleziona un concetto per esplorare i suoi collegamenti.',
    step: 'Passaggio {current} di {total}', starting: 'Inizia da questo concetto.',
    isolated: 'Questo concetto non ha collegamenti nel diagramma.',
    noNewConnections: 'Nessun nuovo collegamento in questo passaggio.',
    download: 'Scarica', exportFailed: 'Impossibile esportare il diagramma. Riprova.',
    play: 'Riproduci la spiegazione', pause: 'Pausa', motion: 'Animazioni leggere',
    reduced: 'Movimento ridotto attivo: i passi vengono mostrati senza animazioni.',
    gesture: 'Trascina per spostare. Usa due dita per ingrandire.',
    concept: 'Concetto', action: 'Azione', decision: 'Decisione', outcome: 'Risultato',
    loading: 'Preparazione del diagramma…',
};
type DiagramUiKey = keyof typeof diagramUiIt;
const DIAGRAM_UI: Record<Lang, Record<DiagramUiKey, string>> = {
    it: diagramUiIt,
    en: {
        overview: 'Overview', reading: 'Reading', walk: 'Step by step', whole: 'Show all',
        expand: 'Expand', tools: 'Zoom and export', fit: 'Fit to view',
        text: 'Read as text', hideText: 'Close text', clear: 'Clear selection',
        exploreHint: 'Select a concept to explore its connections.',
        step: 'Step {current} of {total}', starting: 'Start with this concept.',
        isolated: 'This concept has no connections in the diagram.',
        noNewConnections: 'No new connections at this step.',
        download: 'Download', exportFailed: 'Could not export the diagram. Try again.',
        play: 'Play explanation', pause: 'Pause', motion: 'Gentle animations',
        reduced: 'Reduced motion is on: steps are shown without animations.',
        gesture: 'Drag to move. Use two fingers to zoom.',
        concept: 'Concept', action: 'Action', decision: 'Decision', outcome: 'Outcome',
        loading: 'Preparing the diagram…',
    },
    es: {
        overview: 'Vista general', reading: 'Lectura', walk: 'Paso a paso', whole: 'Mostrar todo',
        expand: 'Ampliar', tools: 'Zoom y exportación', fit: 'Ajustar a la vista',
        text: 'Leer como texto', hideText: 'Cerrar el texto', clear: 'Quitar selección',
        exploreHint: 'Selecciona un concepto para explorar sus conexiones.',
        step: 'Paso {current} de {total}', starting: 'Empieza por este concepto.',
        isolated: 'Este concepto no tiene conexiones en el diagrama.',
        noNewConnections: 'No hay conexiones nuevas en este paso.',
        download: 'Descargar', exportFailed: 'No se pudo exportar el diagrama. Inténtalo de nuevo.',
        play: 'Reproducir la explicación', pause: 'Pausa', motion: 'Animaciones suaves',
        reduced: 'Movimiento reducido activado: los pasos se muestran sin animaciones.',
        gesture: 'Arrastra para mover. Usa dos dedos para ampliar.',
        concept: 'Concepto', action: 'Acción', decision: 'Decisión', outcome: 'Resultado',
        loading: 'Preparando el diagrama…',
    },
    fr: {
        overview: 'Vue d’ensemble', reading: 'Lecture', walk: 'Pas à pas', whole: 'Tout afficher',
        expand: 'Agrandir', tools: 'Zoom et export', fit: 'Adapter à la vue',
        text: 'Lire en texte', hideText: 'Fermer le texte', clear: 'Effacer la sélection',
        exploreHint: 'Sélectionnez un concept pour explorer ses liens.',
        step: 'Étape {current} sur {total}', starting: 'Commencez par ce concept.',
        isolated: 'Ce concept n’a aucun lien dans le diagramme.',
        noNewConnections: 'Aucun nouveau lien à cette étape.',
        download: 'Télécharger', exportFailed: 'Impossible d’exporter le diagramme. Réessayez.',
        play: 'Lire l’explication', pause: 'Pause', motion: 'Animations douces',
        reduced: 'Mouvement réduit activé : les étapes sont affichées sans animations.',
        gesture: 'Faites glisser pour déplacer. Utilisez deux doigts pour zoomer.',
        concept: 'Concept', action: 'Action', decision: 'Décision', outcome: 'Résultat',
        loading: 'Préparation du diagramme…',
    },
    de: {
        overview: 'Übersicht', reading: 'Lesen', walk: 'Schritt für Schritt', whole: 'Alles anzeigen',
        expand: 'Vergrößern', tools: 'Zoom und Export', fit: 'An Ansicht anpassen',
        text: 'Als Text lesen', hideText: 'Text schließen', clear: 'Auswahl aufheben',
        exploreHint: 'Wähle einen Begriff, um seine Verbindungen zu erkunden.',
        step: 'Schritt {current} von {total}', starting: 'Beginne mit diesem Begriff.',
        isolated: 'Dieser Begriff hat keine Verbindungen im Diagramm.',
        noNewConnections: 'Keine neuen Verbindungen in diesem Schritt.',
        download: 'Herunterladen', exportFailed: 'Das Diagramm konnte nicht exportiert werden. Versuche es erneut.',
        play: 'Erklärung abspielen', pause: 'Pause', motion: 'Sanfte Animationen',
        reduced: 'Reduzierte Bewegung aktiv: Schritte werden ohne Animationen angezeigt.',
        gesture: 'Zum Verschieben ziehen. Mit zwei Fingern zoomen.',
        concept: 'Begriff', action: 'Aktion', decision: 'Entscheidung', outcome: 'Ergebnis',
        loading: 'Diagramm wird vorbereitet…',
    },
    sv: {
        overview: 'Översikt', reading: 'Läsning', walk: 'Steg för steg', whole: 'Visa allt',
        expand: 'Förstora', tools: 'Zoom och export', fit: 'Anpassa till vyn',
        text: 'Läs som text', hideText: 'Stäng texten', clear: 'Rensa markeringen',
        exploreHint: 'Välj ett begrepp för att utforska dess samband.',
        step: 'Steg {current} av {total}', starting: 'Börja med det här begreppet.',
        isolated: 'Det här begreppet har inga samband i diagrammet.',
        noNewConnections: 'Inga nya samband i det här steget.',
        download: 'Ladda ner', exportFailed: 'Det gick inte att exportera diagrammet. Försök igen.',
        play: 'Spela upp förklaringen', pause: 'Paus', motion: 'Mjuka animationer',
        reduced: 'Minskad rörelse är aktiv: stegen visas utan animationer.',
        gesture: 'Dra för att flytta. Zooma med två fingrar.',
        concept: 'Begrepp', action: 'Handling', decision: 'Beslut', outcome: 'Resultat',
        loading: 'Förbereder diagrammet…',
    },
};

export function diagramUiLabel(key: DiagramUiKey, locale: string, values: Record<string, string | number> = {}): string {
    const dict = DIAGRAM_UI[locale.slice(0, 2) as Lang] ?? DIAGRAM_UI.en;
    return dict[key].replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}

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
