/**
 * Informational planned day for operational-plan steps.
 *
 * Questionnaires take the day from their administration plan; guided chats
 * carry their own date. The value is never used for access or completion.
 */
export interface PlannedDayStep {
    step_type?: string;
    scheduled_date?: string | null;
    target_summary?: {
        scheduled_at?: string | null;
        location?: string | null;
    } | null;
}

export function plannedDayIso(step: PlannedDayStep): string | null {
    if (step.step_type === 'questionnaire_administration') {
        return step.target_summary?.scheduled_at || null;
    }
    if (step.step_type === 'guided_chat' || step.step_type === 'guided_results_chat') {
        return step.scheduled_date || null;
    }
    return null;
}

export function plannedDayText(step: PlannedDayStep, lang: string): string | null {
    const raw = plannedDayIso(step);
    if (!raw) return null;
    const fromPlan = step.step_type === 'questionnaire_administration';
    const date = new Date(fromPlan ? raw : `${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString(lang, fromPlan
        ? { dateStyle: 'medium', timeStyle: 'short' }
        : { dateStyle: 'medium' });
}

export function plannedDayLocation(step: PlannedDayStep): string | null {
    return step.step_type === 'questionnaire_administration'
        ? step.target_summary?.location || null
        : null;
}

/** A calendar day (YYYY-MM-DD) in the reader's language, the same format as the planned day. */
export function formatPlanDay(iso: string, lang: string): string {
    const date = new Date(`${iso}T00:00:00`);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(lang, { dateStyle: 'medium' });
}

function localDay(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export type DueHint = { kind: 'late' | 'today' | 'soon'; days: number };

/** Relative hint for a step deadline (YYYY-MM-DD): late, today, or due in N days. */
export function dueHint(dueIso: string | null | undefined, now: Date = new Date()): DueHint | null {
    if (!dueIso) return null;
    const due = new Date(`${dueIso}T00:00:00`);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date(`${localDay(now)}T00:00:00`);
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return { kind: 'late', days: -days };
    return { kind: days === 0 ? 'today' : 'soon', days };
}

/** True when the step deadline falls on a day before the linked administration's planned day. */
export function dueBeforePlanned(step: PlannedDayStep & { due_date?: string | null }): boolean {
    if (step.step_type !== 'questionnaire_administration' || !step.due_date) return false;
    const planned = new Date(step.target_summary?.scheduled_at || '');
    return !Number.isNaN(planned.getTime()) && step.due_date < localDay(planned);
}
