// Segnali di controllo che il modello scrive e la persona non legge mai.
// Stesso registro di backend/control_markers.py (un test confronta i due
// elenchi). Li toglie `streamChat` per ogni chat e il rendering della chat
// guidata per i testi ripresi: una chat nuova li eredita senza fare nulla.
// Per aggiungere un segnale: inserirlo qui e nel registro del backend.

export const CONTROL_MARKERS = ['AVANZA_STEP', 'APRI_APPROFONDIMENTO', 'TORNA_AL_PERCORSO'] as const;
export type ControlSignal = (typeof CONTROL_MARKERS)[number];

export const ADVANCE_STEP: ControlSignal = 'AVANZA_STEP';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Il markdown a volte scappa il trattino basso (`AVANZA\_STEP`).
const namePattern = (name: string) => name.split('_').map(escape).join('\\\\?_');
const MARKER_SOURCE = `\\[\\[\\s*(${CONTROL_MARKERS.map(namePattern).join('|')})\\s*\\]\\]`;
// Durante lo streaming un segnale arriva a pezzi: la coda `[[AVAN` non si mostra.
const PARTIAL_TAIL = /\[(?:\[[A-Za-z_\\\s]*\]?)?$/;

const tidy = (text: string) => text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export function extractControlSignals(text: string | null | undefined): { visible: string; signals: ControlSignal[] } {
    const source = text ?? '';
    const signals: ControlSignal[] = [];
    for (const match of source.matchAll(new RegExp(MARKER_SOURCE, 'gi'))) {
        const name = match[1].replace(/\\/g, '').toUpperCase() as ControlSignal;
        if (!signals.includes(name)) signals.push(name);
    }
    if (!signals.length) return { visible: source, signals };
    return { visible: tidy(source.replace(new RegExp(MARKER_SOURCE, 'gi'), '')), signals };
}

export function stripControlMarkers(text: string | null | undefined): string {
    return extractControlSignals(text).visible;
}

// Testo parziale dello streaming: senza segnali, interi o ancora a meta'.
export function stripControlMarkersForDisplay(text: string | null | undefined): string {
    const visible = stripControlMarkers(text);
    const trimmed = visible.replace(PARTIAL_TAIL, '');
    return trimmed === visible ? visible : trimmed.trimEnd();
}
