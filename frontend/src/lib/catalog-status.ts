// Stato degli strumenti nel catalogo: quali hanno una chat guidata in pausa.
// Le sessioni congelate arrivano dal server già in ordine di updated_at
// decrescente: per ogni strumento vale la più recente.

import type { FrozenSessionSummary } from './frozen-session';

// Chat appena congelata: l’Area studente mostra l’avviso una volta dopo il fiocco.
export interface PausedChat {
    sessionId: string;
    questionnaireId: string;
}

const PAUSED_CHAT_KEY = 'cb-paused-chat-notice';

export function rememberPausedChat(chat: PausedChat): void {
    try { sessionStorage.setItem(PAUSED_CHAT_KEY, JSON.stringify(chat)); }
    catch { /* L’avviso è facoltativo: lo snapshot è già salvato sul server. */ }
}

export function takePausedChat(): PausedChat | null {
    try {
        const raw = sessionStorage.getItem(PAUSED_CHAT_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(PAUSED_CHAT_KEY);
        const chat = JSON.parse(raw) as Partial<PausedChat> | null;
        return typeof chat?.sessionId === 'string' && typeof chat.questionnaireId === 'string'
            ? { sessionId: chat.sessionId, questionnaireId: chat.questionnaireId }
            : null;
    } catch { return null; }
}

export function latestPausedByTool(frozen: FrozenSessionSummary[]): Map<string, FrozenSessionSummary> {
    const byTool = new Map<string, FrozenSessionSummary>();
    for (const row of frozen) {
        if (!byTool.has(row.questionnaire_type)) byTool.set(row.questionnaire_type, row);
    }
    return byTool;
}

// "Consigliati per te": prima le chat in pausa (le più recenti), poi gli
// strumenti indicati dalla Bussola. Solo strumenti attivi nel catalogo, mai
// quelli già compilati, al massimo tre.
export type ToolSuggestion =
    | { id: string; source: 'paused' }
    | { id: string; source: 'orientation'; reason: string };

export const MAX_TOOL_SUGGESTIONS = 3;

export function suggestTools(input: {
    activeIds: string[];
    completed: string[];
    paused: FrozenSessionSummary[];
    orientation: { id: string; reason: string }[];
}): ToolSuggestion[] {
    const active = new Set(input.activeIds);
    const done = new Set(input.completed);
    const seen = new Set<string>();
    const out: ToolSuggestion[] = [];
    const add = (suggestion: ToolSuggestion) => {
        if (out.length >= MAX_TOOL_SUGGESTIONS || seen.has(suggestion.id)) return;
        if (!active.has(suggestion.id) || done.has(suggestion.id)) return;
        seen.add(suggestion.id);
        out.push(suggestion);
    };
    for (const row of latestPausedByTool(input.paused).values()) add({ id: row.questionnaire_type, source: 'paused' });
    for (const rec of input.orientation) add({ id: rec.id, source: 'orientation', reason: rec.reason });
    return out;
}

// Ultima compilazione per strumento (ISO), dai risultati salvati dell'utente:
// alimenta il pallino e la data nelle schede del catalogo.
export function lastCompiledByTool(rows: { questionnaire_type: string; submitted_at: string }[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rows) {
        const current = out[row.questionnaire_type];
        if (!current || new Date(row.submitted_at).getTime() > new Date(current).getTime()) {
            out[row.questionnaire_type] = row.submitted_at;
        }
    }
    return out;
}
