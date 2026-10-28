// Consiglio orientativo: documento interno della classe per studente.
// Elenco, documento, bozza assistita e PDF passano dalle rotte del docente.

export type RecommendationStatus = 'draft' | 'final';

export interface RecommendationSummary {
    username: string;
    display_name: string;
    status: RecommendationStatus | null;
    revision: number;
    ai_draft_used: boolean;
}

export interface RecommendationDoc extends RecommendationSummary {
    content: string;
    group_id: number;
    group_name: string;
    updated_by: string | null;
    final_at: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export function parseRecommendationList(payload: unknown): RecommendationSummary[] {
    if (!Array.isArray(payload)) throw new Error('invalid recommendation list');
    return payload.filter((row): row is RecommendationSummary =>
        !!row && typeof row === 'object' && typeof (row as RecommendationSummary).username === 'string'
        && typeof (row as RecommendationSummary).display_name === 'string');
}

export function parseRecommendationDoc(payload: unknown): RecommendationDoc {
    if (!payload || typeof payload !== 'object') throw new Error('invalid recommendation');
    const row = payload as RecommendationDoc;
    if (typeof row.content !== 'string' || typeof row.group_name !== 'string') throw new Error('invalid recommendation');
    return row;
}

export function parseDraft(payload: unknown): string {
    if (!payload || typeof payload !== 'object') throw new Error('invalid draft');
    const draft = (payload as { draft?: unknown }).draft;
    if (typeof draft !== 'string' || draft.trim() === '') throw new Error('invalid draft');
    return draft;
}
