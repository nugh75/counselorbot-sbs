// Stato degli strumenti nel catalogo: quali hanno una chat guidata in pausa.
// Le sessioni congelate arrivano dal server già in ordine di updated_at
// decrescente: per ogni strumento vale la più recente.

import type { FrozenSessionSummary } from './frozen-session';

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
