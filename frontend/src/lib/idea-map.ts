// Client della mappa dello strumento Idea. La mappa vive sul server: cresce a
// ogni turno con la patch che il modello manda, e il browser la rilegge.

import { apiFetch } from '@/lib/auth';

export type IdeaVariant = 'student-path' | 'student-open' | 'research';

export const IDEA_ROLES = [
    'idea', 'assumption', 'evidence', 'alternative',
    'implication', 'open-question', 'constraint', 'step',
] as const;

export type IdeaRole = typeof IDEA_ROLES[number];

export interface IdeaMapState {
    session_id: string;
    revision_id: number | null;
    updated_at: string | null;
    spec: unknown | null;
    description: string | null;
    missing_roles: IdeaRole[];
    complete: boolean;
}

export async function fetchIdeaMap(sessionId: string): Promise<IdeaMapState | null> {
    const response = await apiFetch(`/api/idea/map?session_id=${encodeURIComponent(sessionId)}`);
    if (!response.ok) return null;
    return response.json() as Promise<IdeaMapState>;
}

// L'URL dell'immagine porta la revisione: cambiando revisione cambia l'URL, e
// il browser ridisegna senza che serva svuotare la cache.
export function ideaMapImageUrl(
    sessionId: string,
    revisionId: number | null,
    theme: 'light' | 'dark',
    format: 'svg' | 'png',
    lang: string,
): string {
    const params = new URLSearchParams({
        session_id: sessionId,
        theme,
        format,
        lang,
        v: String(revisionId ?? 0),
    });
    return `/api/idea/map/image?${params.toString()}`;
}
