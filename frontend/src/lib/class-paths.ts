export interface ClassPathStep {
    id?: number;
    path_id?: number;
    position: number;
    tool_key: string;
    step_type?: "tool" | "questionnaire_administration";
    administration_plan_id?: number | null;
    active_from?: string | null;
    target_summary?: {id: number; title: string; code: string; instrument_code: string; locale: string; institution_name: string} | null;
    completion_kind?: string | null;
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

// Tools a path step may use: the ones the class enables, which is what the
// server accepts on save and what students can start (bug 838e6852).
// Always-on tools are never steps.
export function pathStepTools<T extends { enabled: boolean; always_on: boolean }>(tools: T[]): T[] {
    return tools.filter(t => t.enabled && !t.always_on);
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
        step_type: raw.step_type === 'questionnaire_administration' ? 'questionnaire_administration' : 'tool',
        administration_plan_id: raw.administration_plan_id != null ? Number(raw.administration_plan_id) : null,
        active_from: raw.active_from ? String(raw.active_from) : null,
        target_summary: raw.target_summary as ClassPathStep['target_summary'],
        completion_kind: raw.completion_kind ? String(raw.completion_kind) : null,
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
    step_type?: "tool" | "questionnaire_administration";
    administration_plan_id?: number | null;
    active_from?: string | null;
    target_summary?: {id: number; title: string; code: string; instrument_code: string; locale: string; institution_name: string} | null;
    completion_kind?: string | null;
    title?: string | null;
    instructions?: string | null;
    due_date?: string | null;
    state: 'done' | 'not_done' | 'locked' | 'unavailable';
    source?: 'student' | 'teacher' | 'automatic' | null;
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
    const source = (sourceStr === 'student' || sourceStr === 'teacher' || sourceStr === 'automatic') ? sourceStr : null;
    return {
        id: Number(raw.id),
        tool_key: String(raw.tool_key || ''),
        step_type: raw.step_type === 'questionnaire_administration' ? 'questionnaire_administration' : 'tool',
        administration_plan_id: raw.administration_plan_id != null ? Number(raw.administration_plan_id) : null,
        active_from: raw.active_from ? String(raw.active_from) : null,
        target_summary: raw.target_summary as ClassPathStep['target_summary'],
        completion_kind: raw.completion_kind ? String(raw.completion_kind) : null,
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


/** Step number (1-based, as rendered) that strict-mode locked steps wait for: the current step. */
export function lockedStepUnlockNumber(path: Pick<StudentClassPath, 'steps' | 'next_step_id'>): number | null {
    if (path.next_step_id == null) return null;
    const index = path.steps.findIndex(step => step.id === path.next_step_id);
    return index >= 0 ? index + 1 : null;
}

export type ProgressCellState = 'done' | 'not_done' | 'locked' | 'unavailable';
export type ProgressSource = 'automatic' | 'student' | 'teacher';
export type ProgressFilter = 'all' | 'late' | 'not_started';

export interface ClassPathProgressStep extends ClassPathStep {
    id: number;
    available: boolean;
    done_count: number;
}

export interface ClassPathProgressCell {
    step_id: number;
    state: ProgressCellState;
    source: ProgressSource | null;
    at: string | null;
    actor: string | null;
    reason: string | null;
    /** The teacher's own mark, shown even when strict mode locks the cell. */
    teacher_state: 'done' | 'not_done' | null;
}

export interface ClassPathProgressStudent {
    username: string;
    display_name: string;
    cells: ClassPathProgressCell[];
    done: number;
    total: number;
}

export interface ClassPathProgress {
    path_id: number;
    mode: 'recommended' | 'strict';
    steps: ClassPathProgressStep[];
    students: ClassPathProgressStudent[];
}

function optionalString(value: unknown): string | null {
    return value ? String(value) : null;
}

function parseProgressCell(input: unknown): ClassPathProgressCell {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const state = raw.state === 'done' || raw.state === 'locked' || raw.state === 'unavailable' ? raw.state : 'not_done';
    const source = raw.source === 'automatic' || raw.source === 'student' || raw.source === 'teacher' ? raw.source : null;
    const teacherState = raw.teacher_state === 'done' || raw.teacher_state === 'not_done' ? raw.teacher_state : null;
    return {
        step_id: Number(raw.step_id),
        state,
        source,
        at: optionalString(raw.at),
        actor: optionalString(raw.actor),
        reason: optionalString(raw.reason),
        teacher_state: teacherState,
    };
}

export function parseClassPathProgress(input: unknown): ClassPathProgress {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    const students = Array.isArray(raw.students) ? raw.students : [];
    return {
        path_id: Number(raw.path_id),
        mode: raw.mode === 'strict' ? 'strict' : 'recommended',
        steps: steps.map(step => {
            const record = step as Record<string, unknown>;
            return {
                ...parseClassPathStep(step),
                id: Number(record.id),
                available: record.available !== false,
                done_count: Number(record.done_count || 0),
            };
        }),
        students: students.map(student => {
            const record = (student && typeof student === 'object' ? student : {}) as Record<string, unknown>;
            const username = String(record.username || '');
            return {
                username,
                display_name: String(record.display_name || username),
                cells: Array.isArray(record.cells) ? record.cells.map(parseProgressCell) : [],
                done: Number(record.done || 0),
                total: Number(record.total || 0),
            };
        }),
    };
}

/** `today` is an ISO date (YYYY-MM-DD): a step is late once its due date has passed. */
export function filterProgressStudents(
    progress: ClassPathProgress,
    filter: ProgressFilter,
    today: string,
): ClassPathProgressStudent[] {
    if (filter === 'not_started') return progress.students.filter(student => student.done === 0);
    if (filter === 'late') {
        const due = new Map(progress.steps.map(step => [step.id, step.due_date || null]));
        return progress.students.filter(student => student.cells.some(cell => {
            const date = due.get(cell.step_id);
            return cell.state !== 'done' && cell.state !== 'unavailable' && date != null && date < today;
        }));
    }
    return progress.students;
}

const SOURCE_CODES: Record<ProgressSource, string> = { automatic: 'a', student: 's', teacher: 't' };

/** Compact matrix label: a = automatic, s = student, t = teacher; · marks a step not done.
 * Done and locked states are drawn as icons next to this text. */
export function progressCellCode(cell: ClassPathProgressCell): string {
    if (cell.state === 'unavailable') return '—';
    if (cell.state === 'locked') return '';
    const code = cell.source ? SOURCE_CODES[cell.source] : '';
    return `${cell.state === 'done' ? '' : '·'}${code}`;
}

/**
 * Selects the primary class path to highlight in hero cards (home and personal area).
 * Selection rule:
 * 1. Incomplete paths precede completed paths.
 * 2. Among paths with identical completion state, the one with the nearest upcoming due date
 *    (earliest due_date on an incomplete step) comes first.
 * 3. Fallback to earliest due date on any step if none on incomplete.
 * 4. Breaks ties by path id ascending.
 */
export function selectCurrentClassPath(paths: StudentClassPath[]): StudentClassPath | null {
    if (!paths.length) return null;
    if (paths.length === 1) return paths[0];

    const getNearestIncompleteDueDate = (path: StudentClassPath): string | null => {
        let nearest: string | null = null;
        for (const step of path.steps) {
            if (step.state !== 'done' && step.due_date) {
                if (!nearest || step.due_date < nearest) {
                    nearest = step.due_date;
                }
            }
        }
        return nearest;
    };

    const getNearestAnyDueDate = (path: StudentClassPath): string | null => {
        let nearest: string | null = null;
        for (const step of path.steps) {
            if (step.due_date) {
                if (!nearest || step.due_date < nearest) {
                    nearest = step.due_date;
                }
            }
        }
        return nearest;
    };

    const sorted = [...paths].sort((a, b) => {
        const aAllDone = a.total > 0 && a.done >= a.total;
        const bAllDone = b.total > 0 && b.done >= b.total;

        if (aAllDone !== bAllDone) {
            return aAllDone ? 1 : -1;
        }

        const aDue = getNearestIncompleteDueDate(a) ?? getNearestAnyDueDate(a);
        const bDue = getNearestIncompleteDueDate(b) ?? getNearestAnyDueDate(b);

        if (aDue && bDue) {
            const cmp = aDue.localeCompare(bDue);
            if (cmp !== 0) return cmp;
        } else if (aDue && !bDue) {
            return -1;
        } else if (!aDue && bDue) {
            return 1;
        }

        return a.id - b.id;
    });

    return sorted[0];
}
