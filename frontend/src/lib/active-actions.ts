import type { Action } from './visual-tools';

export type InProgressAction = { id: string; title: string; date: string | null };
type ResumeAction = Pick<Action, 'id' | 'title' | 'stage' | 'start_date' | 'end_date'>;

function safeDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

// Le attività «in corso» sono quelle nello stadio `doing`: le più vicine nel
// tempo prima, quelle senza data in fondo, ordine stabile per titolo (#608).
const undated = '9999-12-31';

export function inProgressActions(actions: ResumeAction[]): InProgressAction[] {
    return actions
        .filter(action => action.stage === 'doing' && action.title.trim().length > 0)
        .map(action => ({ id: action.id, title: action.title, date: safeDate(action.end_date) || safeDate(action.start_date) }))
        .sort((a, b) => (a.date || undated).localeCompare(b.date || undated) || a.title.localeCompare(b.title));
}

// `GET /api/user/timeline` restituisce `{workspace: {actions: [...]}}`: qui si
// accettano solo le righe con i campi che servono alla ripresa.
export function readWorkspaceActions(payload: unknown): ResumeAction[] {
    const workspace = (payload as { workspace?: unknown } | null)?.workspace;
    const actions = (workspace as { actions?: unknown } | null)?.actions;
    if (!Array.isArray(actions)) return [];
    return actions.filter((row): row is ResumeAction => {
        const action = row as Partial<Action> | null;
        return action !== null && typeof action === 'object' && typeof action.id === 'string' && typeof action.title === 'string' && ['todo', 'doing', 'done'].includes(action.stage || '');
    });
}
