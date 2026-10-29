import type { AdministrationResult } from './administration-entry';

export interface PathAttempt {
    session_id: string;
    started_at: string | null;
    state: 'in_progress' | 'completed';
    resumable: boolean;
    href: string;
    revision: number;
    draft?: { scores?: Record<string, number>; answers?: Record<number, number> } | null;
    result?: AdministrationResult | null;
}
export interface PathActivityAction { label: string; href: string }
export interface PathActivity {
    kind: string;
    instrument_code?: string;
    current: PathAttempt | null;
    attempts: PathAttempt[];
    primary: PathActivityAction | null;
    repeat: PathActivityAction | null;
    choices?: { id: number; submitted_at: string; locale: string }[];
}
export interface PathActivityDetail extends PathActivity {
    path_title: string;
    title: string;
    position: number;
    instrument_code: string;
    next_href?: string | null;
}
export type RegisterActivitySave = (save: (() => Promise<void>) | null) => void;

export function parsePathActivity(value: unknown): PathActivity | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as PathActivity;
    const local = (href: unknown) => typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
    const validAttempt = (attempt: PathAttempt) => attempt && typeof attempt.session_id === 'string'
        && ['in_progress', 'completed'].includes(attempt.state) && local(attempt.href);
    if (typeof row.kind !== 'string' || !Array.isArray(row.attempts)
        || [row.primary, row.repeat].some(action => action && !local(action.href))
        || row.attempts.some(attempt => !validAttempt(attempt)) || (row.current && !validAttempt(row.current))) return null;
    return row;
}

export function activityReturnHref(pathname: string, stepId: number): string {
    const destination = ['/', '/profilo', '/profilo/compilazioni', '/profilo/piani-operativi'].includes(pathname)
        ? pathname : '/profilo/piani-operativi';
    return `${destination}#class-step-${stepId}`;
}

export function withActivityReturn(href: string, returnTo: string): string {
    const url = new URL(href, 'http://local');
    url.searchParams.set('return_to', returnTo);
    return `${url.pathname}${url.search}${url.hash}`;
}

export function withActivityOptions(href: string, resultId?: string, guidedPath?: string): string {
    const url = new URL(href, 'http://local');
    if (resultId) url.searchParams.set('result_id', resultId);
    if (guidedPath) url.searchParams.set('guided_path', guidedPath);
    return `${url.pathname}${url.search}${url.hash}`;
}

export function readActivityReturn(stepId: number): string {
    if (typeof window === 'undefined') return activityReturnHref('', stepId);
    const target = new URLSearchParams(window.location.search).get('return_to') || '';
    return ['/', '/profilo', '/profilo/compilazioni', '/profilo/piani-operativi'].some(path => target === `${path}#class-step-${stepId}`)
        ? target : activityReturnHref('', stepId);
}
