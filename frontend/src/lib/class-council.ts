// Class council link (#422): read-only class overview behind a link and a password.
import type { ClassCouncilTextKey } from './i18n-class-council';

export type CouncilLinkState = 'active' | 'expired' | 'revoked';

export interface CouncilLink {
    id: number;
    token: string;
    created_at: string | null;
    expires_at: string;
    revoked_at: string | null;
    last_viewed_at: string | null;
    state: CouncilLinkState;
    /** Only in the creation response. */
    password?: string;
}

export interface CouncilPlan {
    path_id: number;
    title: string;
    done: number;
    total: number;
    steps: { title: string; step_type: string; state: string; due_date: string | null }[];
}

export interface CouncilResult {
    questionnaire_type: string;
    scores: Record<string, unknown> | null;
    submitted_at: string | null;
    summary: string | null;
}

export interface CouncilAssignment {
    title: string;
    intent: string;
    due_date: string | null;
    submission: unknown;
    submitted_at: string | null;
    feedback: string;
}

export interface CouncilGoal {
    title: string;
    status: string;
    criteria: string;
    reflection: string;
    review_date: string | null;
}

export interface CouncilStudent {
    username: string;
    display_name: string;
    plans: CouncilPlan[];
    results: CouncilResult[];
    assignments: CouncilAssignment[];
    goals: CouncilGoal[];
}

export interface CouncilOverview {
    group: { id: number; name: string };
    expires_at: string;
    students: CouncilStudent[];
}

const STATES: CouncilLinkState[] = ['active', 'expired', 'revoked'];

export function parseCouncilLinks(payload: unknown): CouncilLink[] {
    if (!Array.isArray(payload)) throw new Error('invalid council links');
    return payload.filter((row): row is CouncilLink =>
        !!row && typeof row === 'object' && typeof (row as CouncilLink).id === 'number'
        && typeof (row as CouncilLink).token === 'string' && STATES.includes((row as CouncilLink).state));
}

export function councilPath(token: string): string {
    return `/consiglio/${encodeURIComponent(token)}`;
}

/** Message for a failed overview request; the server answers unknown, expired and revoked alike. */
export function councilErrorKey(status: number): ClassCouncilTextKey {
    if (status === 403) return 'wrongPassword';
    if (status === 429) return 'locked';
    if (status === 404) return 'unavailable';
    return 'networkError';
}

/** A shared submission as readable text: the student's text and the portfolio preview they chose. */
export function submissionText(submission: unknown): string {
    if (!submission || typeof submission !== 'object') return '';
    const record = submission as { text?: unknown; portfolio?: { title?: unknown; description?: unknown } };
    const portfolio = record.portfolio && typeof record.portfolio === 'object' ? record.portfolio : null;
    return [record.text, portfolio?.title, portfolio?.description]
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .join('\n\n');
}

export function matchesStudent(student: CouncilStudent, query: string): boolean {
    const needle = query.trim().toLowerCase();
    return !needle || student.display_name.toLowerCase().includes(needle) || student.username.toLowerCase().includes(needle);
}
