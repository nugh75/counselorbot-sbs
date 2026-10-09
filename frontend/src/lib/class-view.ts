// Student view switcher (#146): the full view or one of the student's class views.
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { apiFetch } from './auth.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { setCachedUserAccess, USER_ACCESS_CHANGED, type UserAccess } from './user-access.ts';

export type ClassView = 'all' | 'classes' | number;

export interface ClassViewOption {
    value: string;
    kind: 'all' | 'classes' | 'class';
    name?: string;
}

// With one class the class view is that class, so it is listed once by name.
// Students with no class and staff get no options (no selector).
export function classViewOptions(access: UserAccess | null | undefined): ClassViewOption[] {
    const classes = access?.classes ?? [];
    if (classes.length === 0) return [];
    if (classes.length === 1) {
        return [{ value: 'all', kind: 'all' }, { value: 'classes', kind: 'class', name: classes[0].name }];
    }
    return [
        { value: 'all', kind: 'all' },
        { value: 'classes', kind: 'classes' },
        ...classes.map((item) => ({ value: String(item.id), kind: 'class' as const, name: item.name })),
    ];
}

export function currentClassView(access: UserAccess | null | undefined): string {
    const view = access?.view;
    if (view === 'all') return 'all';
    if (typeof view === 'number' && (access?.classes?.length ?? 0) > 1) return String(view);
    return 'classes';
}

export function parseClassView(value: string): ClassView {
    return value === 'all' || value === 'classes' ? value : Number(value);
}

export async function saveClassView(view: ClassView): Promise<UserAccess> {
    const res = await apiFetch('/api/user/access/view', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `HTTP ${res.status}`);
    }
    const access = (await res.json()) as UserAccess;
    setCachedUserAccess(access);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(USER_ACCESS_CHANGED, { detail: access }));
    }
    return access;
}
