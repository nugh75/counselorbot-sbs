export interface ClassPathStep {
    id?: number;
    path_id?: number;
    position: number;
    tool_key: string;
    title?: string | null;
    instructions?: string | null;
    due_date?: string | null;
    auto_detect?: boolean;
    can_self_mark?: boolean;
}

export interface ClassPath {
    id: number;
    group_id: number;
    title: string;
    description?: string | null;
    mode: 'recommended' | 'strict';
    status: 'draft' | 'published' | 'archived';
    published_at?: string | null;
    created_by: string;
    revision: number;
    steps: ClassPathStep[];
    steps_count: number;
    created_at?: string | null;
    updated_at?: string | null;
    archived_at?: string | null;
}

export function parseClassPathStep(input: unknown): ClassPathStep {
    if (!input || typeof input !== 'object') throw new Error('Invalid step payload');
    const raw = input as Record<string, unknown>;
    const auto = Boolean(raw.auto_detect);
    return {
        id: raw.id != null ? Number(raw.id) : undefined,
        path_id: raw.path_id != null ? Number(raw.path_id) : undefined,
        position: Number(raw.position || 1),
        tool_key: String(raw.tool_key || ''),
        title: raw.title ? String(raw.title) : null,
        instructions: raw.instructions ? String(raw.instructions) : null,
        due_date: raw.due_date ? String(raw.due_date) : null,
        auto_detect: auto,
        can_self_mark: raw.can_self_mark != null ? Boolean(raw.can_self_mark) : !auto,
    };
}

export function parseClassPath(input: unknown): ClassPath {
    if (!input || typeof input !== 'object') throw new Error('Invalid class path payload');
    const raw = input as Record<string, unknown>;
    const steps = Array.isArray(raw.steps) ? raw.steps.map(parseClassPathStep) : [];
    return {
        id: Number(raw.id),
        group_id: Number(raw.group_id),
        title: String(raw.title || ''),
        description: raw.description ? String(raw.description) : null,
        mode: raw.mode === 'strict' ? 'strict' : 'recommended',
        status: raw.status === 'published' ? 'published' : raw.status === 'archived' ? 'archived' : 'draft',
        published_at: raw.published_at ? String(raw.published_at) : null,
        created_by: String(raw.created_by || ''),
        revision: Number(raw.revision || 1),
        steps,
        steps_count: raw.steps_count != null ? Number(raw.steps_count) : steps.length,
        created_at: raw.created_at ? String(raw.created_at) : null,
        updated_at: raw.updated_at ? String(raw.updated_at) : null,
        archived_at: raw.archived_at ? String(raw.archived_at) : null,
    };
}

export function parseClassPaths(input: unknown): ClassPath[] {
    if (!Array.isArray(input)) return [];
    return input.map(parseClassPath);
}

export interface StudentClassPathStep {
    id: number;
    tool_key: string;
    title?: string | null;
    instructions?: string | null;
    due_date?: string | null;
    state: 'done' | 'not_done' | 'locked' | 'unavailable';
    source?: 'student' | 'teacher' | null;
    start_href?: string | null;
    can_self_mark: boolean;
}

export interface StudentClassPath {
    id: number;
    group_id: number;
    group_name: string;
    title: string;
    description?: string | null;
    mode: 'recommended' | 'strict';
    steps: StudentClassPathStep[];
    next_step_id?: number | null;
    done: number;
    total: number;
}

export function parseStudentClassPathStep(input: unknown): StudentClassPathStep {
    if (!input || typeof input !== 'object') throw new Error('Invalid student step payload');
    const raw = input as Record<string, unknown>;
    const stateStr = String(raw.state || 'not_done');
    const state = (stateStr === 'done' || stateStr === 'locked' || stateStr === 'unavailable') ? stateStr : 'not_done';
    const sourceStr = raw.source ? String(raw.source) : null;
    const source = (sourceStr === 'student' || sourceStr === 'teacher') ? sourceStr : null;
    return {
        id: Number(raw.id),
        tool_key: String(raw.tool_key || ''),
        title: raw.title ? String(raw.title) : null,
        instructions: raw.instructions ? String(raw.instructions) : null,
        due_date: raw.due_date ? String(raw.due_date) : null,
        state,
        source,
        start_href: raw.start_href ? String(raw.start_href) : null,
        can_self_mark: Boolean(raw.can_self_mark),
    };
}

export function parseStudentClassPath(input: unknown): StudentClassPath {
    if (!input || typeof input !== 'object') throw new Error('Invalid student class path payload');
    const raw = input as Record<string, unknown>;
    const steps = Array.isArray(raw.steps) ? raw.steps.map(parseStudentClassPathStep) : [];
    return {
        id: Number(raw.id),
        group_id: Number(raw.group_id),
        group_name: String(raw.group_name || ''),
        title: String(raw.title || ''),
        description: raw.description ? String(raw.description) : null,
        mode: raw.mode === 'strict' ? 'strict' : 'recommended',
        steps,
        next_step_id: raw.next_step_id != null ? Number(raw.next_step_id) : null,
        done: Number(raw.done || 0),
        total: Number(raw.total || 0),
    };
}

export function parseStudentClassPaths(input: unknown): StudentClassPath[] {
    if (!Array.isArray(input)) return [];
    return input.map(parseStudentClassPath);
}

