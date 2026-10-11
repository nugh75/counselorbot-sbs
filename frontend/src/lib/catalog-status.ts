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
