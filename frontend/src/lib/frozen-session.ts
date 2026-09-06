// Client delle sessioni guidate congelate: lo studente sospende il percorso e
// lo riprende da qualsiasi dispositivo (lo stato vive sul server, non in
// localStorage come il punto di ripresa di `lib/resume.ts`).

import { apiFetch } from '@/lib/auth';

export interface FrozenSessionMessage {
    role: string;
    content: string;
    reasoning?: string;
    strategyIds?: string[];
    responseId?: string;
    feedbackPhase?: string;
    feedback?: boolean;
}

export interface FrozenSessionSummary {
    session_id: string;
    questionnaire_type: string;
    label?: string | null;
    current_phase: string;
    experience?: 'standard' | 'opencode' | null;
    updated_at?: string | null;
}

export interface FrozenSessionDetail extends FrozenSessionSummary {
    messages: FrozenSessionMessage[];
    scores: Record<string, number>;
    counselor_id?: number | null;
    locale?: string | null;
    response_length?: 'short' | 'medium' | 'long' | null;
    pdf_token?: string | null;
}

export interface FrozenSessionSnapshot {
    session_id: string;
    questionnaire_type: string;
    messages: FrozenSessionMessage[];
    current_phase: string;
    scores: Record<string, number>;
    counselor_id: number | null;
    experience: 'standard' | 'opencode';
    locale: string;
    response_length: 'short' | 'medium' | 'long';
    label: string;
    // Solo la sandbox OpenCode: il workspace rigenera `documento.md` a ogni
    // apertura, quindi senza il token la ripresa perderebbe il PDF del profilo.
    pdf_token?: string | null;
}

// Notifica l'header (che monta una sola volta e non rivede il fetch iniziale)
// quando l'elenco delle sessioni congelate cambia, così l'icona "Riprendi"
// compare/scompare senza reload. Stesso pattern di `lib/resume.ts`.
const FROZEN_SESSIONS_EVENT = 'frozen-sessions-change';

export function notifyFrozenSessionsChanged(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(FROZEN_SESSIONS_EVENT));
}

export function subscribeToFrozenSessions(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(FROZEN_SESSIONS_EVENT, onChange);
    return () => window.removeEventListener(FROZEN_SESSIONS_EVENT, onChange);
}

export interface FreezeOptions {
    // Uscita dalla pagina (pagehide): la richiesta deve sopravvivere alla
    // navigazione. Il browser limita a 64KB il corpo delle richieste keepalive,
    // ma l'autosalvataggio ha già scritto tutto tranne l'ultimo turno.
    keepalive?: boolean;
}

export async function freezeSession(snapshot: FrozenSessionSnapshot, options: FreezeOptions = {}): Promise<void> {
    const res = await apiFetch('/api/session/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        keepalive: options.keepalive,
    });
    if (!res.ok) throw new Error(`Freeze fallito (${res.status})`);
    notifyFrozenSessionsChanged();
}

export async function listFrozenSessions(): Promise<FrozenSessionSummary[]> {
    const res = await apiFetch('/api/session/frozen');
    if (!res.ok) throw new Error(`Frozen sessions unavailable (${res.status})`);
    return (await res.json()) as FrozenSessionSummary[];
}

export async function getFrozenSession(sessionId: string): Promise<FrozenSessionDetail | null> {
    const res = await apiFetch(`/api/session/frozen/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return null;
    return (await res.json()) as FrozenSessionDetail;
}

export async function deleteFrozenSession(sessionId: string): Promise<boolean> {
    const res = await apiFetch(`/api/session/frozen/${encodeURIComponent(sessionId)}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
    const deleted = res.ok || res.status === 404;
    if (deleted) notifyFrozenSessionsChanged();
    return deleted;
}
