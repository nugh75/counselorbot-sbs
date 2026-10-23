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
