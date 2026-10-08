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
