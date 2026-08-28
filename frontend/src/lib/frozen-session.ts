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
}

export async function freezeSession(snapshot: FrozenSessionSnapshot): Promise<void> {
    const res = await apiFetch('/api/session/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`Freeze fallito (${res.status})`);
}

export async function listFrozenSessions(): Promise<FrozenSessionSummary[]> {
    const res = await apiFetch('/api/session/frozen');
    if (!res.ok) return [];
    return (await res.json()) as FrozenSessionSummary[];
}

export async function getFrozenSession(sessionId: string): Promise<FrozenSessionDetail | null> {
    const res = await apiFetch(`/api/session/frozen/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return null;
    return (await res.json()) as FrozenSessionDetail;
}

export async function deleteFrozenSession(sessionId: string): Promise<void> {
    await apiFetch(`/api/session/frozen/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}
