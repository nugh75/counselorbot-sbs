// Client della mappa dello strumento Idea. La mappa vive sul server: cresce a
// ogni turno con la patch che il modello manda, e il browser la rilegge.

import { apiFetch } from '@/lib/auth';

export type IdeaVariant = 'student-path' | 'student-open' | 'research';

export const IDEA_ROLES = [
    'idea', 'assumption', 'evidence', 'alternative',
    'implication', 'open-question', 'constraint', 'step',
    'decision', 'task',
] as const;

export type IdeaRole = typeof IDEA_ROLES[number];

export interface IdeaMapNode {
    id: string;
    label: string;
    role?: IdeaRole;
    status?: string;
    flaw?: string;
    task_type?: string;
    closed?: boolean;
    conclusion?: string;
}

export interface IdeaMapState {
    session_id: string;
    revision_id: number | null;
    updated_at: string | null;
    spec: { title: string; nodes: IdeaMapNode[] } | null;
    description: string | null;
    missing_roles: IdeaRole[];
    complete: boolean;
    focus: string | null;
    task_type: string | null;
}

export interface IdeaNextStep {
    step_id: string;
    focus: string | null;
    reason: 'no-map' | 'task-unknown' | 'flaw' | 'missing-role' | 'ready-to-close' | 'all-closed';
    detail: string;
    reason_text: string;
    task_label: string | null;
    pivot: string;
    role?: string;
    flaw?: string;
    node_id?: string;
    statuses: Record<string, string>;
    flaws: Record<string, string>;
}

// Il percorso non e' una sequenza: quale passo tocca dipende da cosa manca
// alla mappa, e quello lo sa il server.
export async function fetchIdeaNextStep(
    sessionId: string,
    lang: string,
    variant: IdeaVariant,
): Promise<IdeaNextStep | null> {
    const params = new URLSearchParams({ session_id: sessionId, lang, variant });
    const response = await apiFetch(`/api/idea/next-step?${params.toString()}`);
    if (!response.ok) return null;
    return response.json() as Promise<IdeaNextStep>;
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

export function ideaMapPdfUrl(sessionId: string, lang: string): string {
    const params = new URLSearchParams({ session_id: sessionId, lang });
    return `/api/idea/map/pdf?${params.toString()}`;
}

// Tenere la mappa: nel portfolio come lavoro, nel taccuino come riga di
// auto-descrizione. Il taccuino non accetta la variante ricerca.
export async function keepIdeaMap(
    target: 'portfolio' | 'notebook',
    sessionId: string,
    lang: string,
    variant: IdeaVariant,
): Promise<boolean> {
    const response = await apiFetch(`/api/idea/map/${target}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, lang, variant }),
    });
    return response.ok;
}

export interface IdeaBranch {
    id: string;
    label: string;
    task_type: string | null;
    task_label: string | null;
    depth: number;
    parent: string | null;
    closed: boolean;
    conclusion: string | null;
    missing_roles: IdeaRole[];
    flaws: number;
    is_focus: boolean;
    // Questo lavoro finisce con qualcosa da fare o con qualcosa da capire.
    wants_plan: boolean;
}

// L'albero dei rami: la chat e' una riga sola, i rami esistono solo nella
// mappa. Senza questo non c'e' modo di vederli ne' di tornare su.
export async function fetchIdeaBranches(sessionId: string, lang: string): Promise<IdeaBranch[]> {
    const params = new URLSearchParams({ session_id: sessionId, lang });
    const response = await apiFetch(`/api/idea/branches?${params.toString()}`);
    if (!response.ok) return [];
    return response.json() as Promise<IdeaBranch[]>;
}

// Un'idea chiusa non e' un'idea finita: si torna, si cambia, si richiude.
export async function reopenIdeaBranch(sessionId: string, nodeId: string): Promise<boolean> {
    const response = await apiFetch('/api/idea/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, node_id: nodeId }),
    });
    return response.ok;
}

export async function moveIdeaFocus(sessionId: string, nodeId: string): Promise<boolean> {
    const response = await apiFetch('/api/idea/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, node_id: nodeId }),
    });
    return response.ok;
}

export type IdeaKeepTarget = 'notebook' | 'portfolio';

export interface IdeaConclusion {
    session_id: string;
    title: string;
    description: string;
    kept: Record<string, { item_id?: number; revision_id?: number; image?: boolean; skipped?: string; failed?: string }>;
    pdf_url: string;
}

// Chiudere la sessione tenendo il risultato dove la persona ha scelto. Nessuna
// destinazione e' una risposta legittima.
export async function concludeIdea(
    sessionId: string,
    targets: IdeaKeepTarget[],
    lang: string,
    variant: IdeaVariant,
): Promise<IdeaConclusion | null> {
    const response = await apiFetch('/api/idea/conclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, targets, lang, variant }),
    });
    if (!response.ok) return null;
    return response.json() as Promise<IdeaConclusion>;
}
