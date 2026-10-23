// Class noticing (#464): themes from verified per-compilation items, counts computed by the server.
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { NOTICING_KINDS, type NoticingKind, type NoticingStatus } from './teacher-noticing.ts';

export type ClassCompilation = {
    id: number; username: string; session_id: string; questionnaire_type: string;
    scores: Record<string, number> | null; submitted_at: string | null; status: NoticingStatus;
};
export type ThemeStudent = { username: string; result_id: number; questionnaire_type: string; text: string; quote: string; message: number };
export type ClassTheme = { title: string; kind: NoticingKind; suggestion: string; student_count: number; students: ThemeStudent[] };
export type ClassNoticing = {
    status: NoticingStatus;
    compilations: ClassCompilation[];
    instruments: string[];
    charts: { kinds: Record<NoticingKind, number>; students: number; students_with_chat: number };
    themes: ClassTheme[];
    suggestions: string[];
    generated_at: string | null;
};

const STATUSES: NoticingStatus[] = ['ready', 'stale', 'missing', 'empty', 'unavailable'];

export function parseClassNoticing(payload: unknown): ClassNoticing {
    const data = payload as ClassNoticing | null;
    if (!data || !STATUSES.includes(data.status) || !Array.isArray(data.compilations) || !Array.isArray(data.themes)
        || !Array.isArray(data.suggestions) || !Array.isArray(data.instruments) || !data.charts?.kinds) throw new Error('invalid class noticing');
    return {
        ...data,
        compilations: data.compilations.filter(row => row && Number.isInteger(row.id) && typeof row.username === 'string' && STATUSES.includes(row.status)),
        themes: data.themes.filter(theme => theme && NOTICING_KINDS.includes(theme.kind) && typeof theme.title === 'string' && Array.isArray(theme.students)),
        suggestions: data.suggestions.filter(text => typeof text === 'string' && text.trim()),
    };
}

// Compilations whose own noticing must be (re)generated before grouping the class.
export function pendingCompilations(data: ClassNoticing): ClassCompilation[] {
    return data.compilations.filter(row => row.status === 'missing' || row.status === 'stale');
}

export function barPercent(count: number, total: number): number {
    return total > 0 ? Math.min(100, Math.round(count / total * 100)) : 0;
}

export function classNoticingQuery(lang: string, instrument: string, days: number): string {
    const params = new URLSearchParams({ lang });
    if (instrument) params.set('instrument', instrument);
    if (days) params.set('days', String(days));
    return params.toString();
}
