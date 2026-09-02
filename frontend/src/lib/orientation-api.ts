import { apiFetch } from './auth';
import type { Lang } from './i18n';

export interface OrientationMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface OrientationRecommendation {
    id: string;
    reason: string;
}

export interface OrientationSession {
    session_id: string;
    language: Lang;
    counselor_id?: number | null;
    status: 'in_progress' | 'completed';
    messages: OrientationMessage[];
    recommendations: OrientationRecommendation[];
    notebook_draft: Record<string, string>;
    notebook_reviewed: boolean;
    notebook_revision_id?: number | null;
    created_at: string;
    updated_at?: string | null;
    completed_at?: string | null;
}

export interface OrientationStatus {
    eligible: boolean;
    completed: boolean;
    required: boolean;
    legacy_exempt: boolean;
    in_progress_session_id?: string | null;
    latest_session_id?: string | null;
}

async function readJson<T>(response: Response): Promise<T> {
    if (!response.ok) throw new Error(`Orientation API: ${response.status}`);
    return response.json();
}

export async function fetchOrientationStatus(): Promise<OrientationStatus> {
    return readJson(await apiFetch('/api/orientation/status'));
}

export async function startOrientation(language: Lang, newSession = false, counselorId?: number | null): Promise<OrientationSession> {
    return readJson(await apiFetch('/api/orientation/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, new_session: newSession, counselor_id: counselorId }),
    }));
}

export async function fetchOrientationSession(sessionId: string): Promise<OrientationSession> {
    return readJson(await apiFetch(`/api/orientation/sessions/${encodeURIComponent(sessionId)}`));
}

export async function sendOrientationMessage(sessionId: string, message: string, language: Lang): Promise<OrientationSession> {
    return readJson(await apiFetch(`/api/orientation/sessions/${encodeURIComponent(sessionId)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, language }),
    }));
}

export async function reviewOrientationNotebook(
    sessionId: string,
    data: Record<string, string>,
    skip = false,
): Promise<OrientationSession> {
    return readJson(await apiFetch(`/api/orientation/sessions/${encodeURIComponent(sessionId)}/notebook-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, skip }),
    }));
}

export async function completeOrientation(sessionId: string): Promise<OrientationSession> {
    return readJson(await apiFetch(`/api/orientation/sessions/${encodeURIComponent(sessionId)}/complete`, {
        method: 'POST',
    }));
}
