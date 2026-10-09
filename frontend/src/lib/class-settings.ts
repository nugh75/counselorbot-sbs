export interface ClassItemLock {
    locked?: boolean;
    locked_enabled?: boolean | null;
    locked_by?: string | null;
    locked_at?: string | null;
    changed_by_admin?: boolean;
}

export type ClassLockKind = 'tool' | 'counselor' | 'forum_option';
export interface ClassForum {
    students_can_open: boolean;
    premoderation: boolean;
    students_can_open_locked?: boolean;
    premoderation_locked?: boolean;
    students_can_open_lock?: { value: boolean; locked_by: string; locked_at: string } | null;
    premoderation_lock?: { value: boolean; locked_by: string; locked_at: string } | null;
    students_can_open_changed_by_admin?: boolean;
    premoderation_changed_by_admin?: boolean;
}

export interface ClassTool extends ClassItemLock {
    key: string;
    kind: 'instrument' | 'personal';
    category: 'assessment' | 'guided' | 'personal' | 'support' | 'forum' | 'always_on';
    label_key?: string;
    label_i18n: Record<string, string>;
    admin_enabled: boolean;
    enabled: boolean;
    always_on: boolean;
}

// Institutional counselors only: students' private counselors are never listed.
export interface ClassCounselor extends ClassItemLock {
    id: number;
    name: string;
    avatar_url?: string | null;
    approach_categories: string[];
    admin_enabled: boolean;
    enabled: boolean;
}

export const defaultForumOptions: ClassForum = {
    students_can_open: false, premoderation: false, students_can_open_locked: false, premoderation_locked: false,
};

export interface ClassSettings {
    group_id: number;
    revision: number;
    disabled_tool_keys: string[];
    tools: ClassTool[];
    disabled_counselor_ids: number[];
    default_counselor_id: number | null;
    counselors: ClassCounselor[];
    forum?: ClassForum;
}

function validLock(row: ClassItemLock): boolean {
    return (row.locked === undefined || typeof row.locked === 'boolean')
        && (row.locked_enabled == null || typeof row.locked_enabled === 'boolean')
        && (row.locked_by == null || typeof row.locked_by === 'string')
        && (row.locked_at == null || typeof row.locked_at === 'string')
        && (row.changed_by_admin === undefined || typeof row.changed_by_admin === 'boolean')
        && (!row.locked || typeof row.locked_enabled === 'boolean');
}

export function parseClassSettings(payload: unknown): ClassSettings {
    const row = payload as Partial<ClassSettings> | null;
    if (!row || !Number.isInteger(row.group_id) || !Number.isInteger(row.revision) || (row.revision ?? 0) < 1
        || !Array.isArray(row.disabled_tool_keys) || !row.disabled_tool_keys.every(key => typeof key === 'string')
        || !Array.isArray(row.tools) || !row.tools.every(tool => tool && typeof tool.key === 'string'
            && typeof tool.admin_enabled === 'boolean' && typeof tool.enabled === 'boolean'
            && validLock(tool) && typeof tool.always_on === 'boolean' && tool.label_i18n && typeof tool.label_i18n === 'object')
        || (row.disabled_counselor_ids !== undefined && (!Array.isArray(row.disabled_counselor_ids)
            || !row.disabled_counselor_ids.every(id => Number.isInteger(id))))
        || (row.default_counselor_id != null && !Number.isInteger(row.default_counselor_id))
        || (row.counselors !== undefined && (!Array.isArray(row.counselors) || !row.counselors.every(counselor =>
            counselor && validLock(counselor) && Number.isInteger(counselor.id) && typeof counselor.name === 'string'
            && typeof counselor.admin_enabled === 'boolean' && typeof counselor.enabled === 'boolean')))) {
        throw new Error('Invalid class settings');
    }
    if (row.forum !== undefined && (!row.forum || typeof row.forum !== 'object' || Array.isArray(row.forum)
        || typeof row.forum.students_can_open !== 'boolean' || typeof row.forum.premoderation !== 'boolean'
        || (row.forum.students_can_open_locked !== undefined && typeof row.forum.students_can_open_locked !== 'boolean')
        || (row.forum.premoderation_locked !== undefined && typeof row.forum.premoderation_locked !== 'boolean'))) {
        throw new Error('Invalid forum options');
    }
    return {
        ...row,
        forum: { ...defaultForumOptions, ...row.forum },
        disabled_counselor_ids: row.disabled_counselor_ids ?? [],
        default_counselor_id: row.default_counselor_id ?? null,
        counselors: (row.counselors ?? []).map(counselor => ({
            ...counselor, approach_categories: Array.isArray(counselor.approach_categories) ? counselor.approach_categories : [],
        })),
    } as ClassSettings;
}

// The stored default only counts while it can still be chosen.
export function effectiveDefaultCounselor(settings: ClassSettings): number | null {
    const id = settings.default_counselor_id;
    const row = settings.counselors.find(counselor => counselor.id === id);
    return row && row.admin_enabled && !settings.disabled_counselor_ids.includes(row.id) ? row.id : null;
}

export function filterClassCounselors(rows: ClassCounselor[], category: string, query: string): ClassCounselor[] {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter(row => (!category || row.approach_categories.includes(category))
        && (!needle || row.name.toLocaleLowerCase().includes(needle)));
}
