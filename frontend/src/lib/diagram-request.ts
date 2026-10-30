import type { DiagramSpec } from './diagram-content';

export interface DiagramFromMessageRequest {
    text: string;
    lang: string;
    spec_only: true;
    instruction: string;
    counselor_id: number;
    session_id?: string;
    source_text?: string;
    previous_spec?: DiagramSpec;
}

export function buildDiagramFromMessageRequest(
    text: string,
    lang: string,
    instruction: string,
    counselorId: number,
    sessionId?: string,
    sourceText?: string,
    previousSpec?: DiagramSpec,
): DiagramFromMessageRequest {
    return {
        text: text.slice(0, 8000),
        lang,
        spec_only: true,
        instruction: instruction.trim().slice(0, 400),
        counselor_id: counselorId,
        ...(sessionId ? { session_id: sessionId, source_text: sourceText || text } : {}),
        // Una correzione rivede il disegno gia' fatto; senza testo si ridisegna da capo.
        ...(previousSpec && instruction.trim() ? { previous_spec: previousSpec } : {}),
    };
}

export async function messageDiagramKey(sourceText: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceText.trim()));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Raggruppa i diagrammi per messaggio: un nuovo disegno si aggiunge, non sostituisce. */
export function addMessageDiagrams<T extends { source_key: string }>(
    current: Record<string, T[]>,
    items: T[],
): Record<string, T[]> {
    const next = { ...current };
    for (const item of items) next[item.source_key] = [...(next[item.source_key] || []), item];
    return next;
}
