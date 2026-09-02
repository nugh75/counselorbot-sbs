// Fonti esterne di un ramo dello strumento Idea. La ricerca propone e basta:
// al ramo resta solo cio' che la persona sceglie di tenere.

import { apiFetch } from '@/lib/auth';

export type IdeaSourceGroup = 'encyclopedia' | 'works';

// Cio' che una ricerca restituisce: non e' ancora salvato da nessuna parte.
export interface IdeaSourceResult {
    source: string;
    title: string;
    url: string;
    doi: string;
    authors: string;
    year: string;
    journal: string;
    abstract: string;
    oa_status: string;
    pdf_url: string;
    citations: number;
    license: string;
    retrieved_at: string;
}

// Cio' che e' stato tenuto: ha un id, un ramo, e forse un PDF sul server.
export interface IdeaKeptSource extends Omit<IdeaSourceResult, 'pdf_url' | 'citations'> {
    id: number;
    branch_id: string;
    has_pdf: boolean;
}

export interface IdeaSourceSearch {
    query: string;
    group: IdeaSourceGroup;
    limit?: number;
    yearFrom?: number | null;
    oaOnly?: boolean;
    lang: string;
}

export async function searchIdeaSources(
    sessionId: string,
    search: IdeaSourceSearch,
): Promise<IdeaSourceResult[] | null> {
    const response = await apiFetch('/api/idea/sources/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: sessionId,
            query: search.query,
            group: search.group,
            limit: search.limit ?? 8,
            year_from: search.yearFrom ?? null,
            oa_only: search.oaOnly ?? true,
            lang: search.lang,
        }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { results?: IdeaSourceResult[] };
    return data.results ?? [];
}

export async function keepIdeaSources(
    sessionId: string,
    branchId: string,
    items: IdeaSourceResult[],
): Promise<IdeaKeptSource[] | null> {
    const response = await apiFetch('/api/idea/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, branch_id: branchId, items }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { kept?: IdeaKeptSource[] };
    return data.kept ?? [];
}

export async function fetchIdeaKeptSources(
    sessionId: string,
    branchId?: string,
): Promise<IdeaKeptSource[]> {
    const params = new URLSearchParams({ session_id: sessionId });
    if (branchId) params.set('branch_id', branchId);
    const response = await apiFetch(`/api/idea/sources?${params.toString()}`);
    if (!response.ok) return [];
    return response.json() as Promise<IdeaKeptSource[]>;
}

export async function removeIdeaSource(sessionId: string, sourceId: number): Promise<boolean> {
    const params = new URLSearchParams({ session_id: sessionId });
    const response = await apiFetch(`/api/idea/sources/${sourceId}?${params.toString()}`, {
        method: 'DELETE',
    });
    return response.ok;
}

export function ideaSourcePdfUrl(sessionId: string, sourceId: number): string {
    const params = new URLSearchParams({ session_id: sessionId });
    return `/api/idea/sources/${sourceId}/pdf?${params.toString()}`;
}
