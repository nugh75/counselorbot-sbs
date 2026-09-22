// Bozza dell'obiettivo che la sintesi dei percorsi Obiettivo prepara in un
// blocco privato (backend/goal_draft.py). La persona la vede in un modulo, la
// corregge e salva: senza conferma non si scrive niente. La bozza precompila
// gli Obiettivi personali (POST /api/user/goals), non il libretto.

export const GOAL_INSTRUMENTS = ['OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA'] as const;

export interface GoalDraft {
    title: string;
    motivation: string;
    criteria: string;
    reflection: string;
    review_date: string;
}

export interface GoalForm {
    title: string;
    motivation: string;
    criteria: string;
    reflection: string;
    review_date: string;
}

export function isGoalInstrument(questionnaireType: string): boolean {
    return (GOAL_INSTRUMENTS as readonly string[]).includes(questionnaireType);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formFromDraft(draft: Partial<GoalDraft> | null | undefined): GoalForm {
    const date = draft?.review_date ?? '';
    return {
        title: draft?.title ?? '',
        motivation: draft?.motivation ?? '',
        criteria: draft?.criteria ?? '',
        reflection: draft?.reflection ?? '',
        review_date: DATE_RE.test(date) ? date : '',
    };
}

export function goalDataFromForm(form: GoalForm): GoalDraft {
    return {
        title: form.title.trim().slice(0, 160),
        motivation: form.motivation.trim(),
        criteria: form.criteria.trim(),
        reflection: form.reflection.trim(),
        review_date: DATE_RE.test(form.review_date) ? form.review_date : '',
    };
}

// request_id per il POST /api/user/goals: pattern 8-64 [a-zA-Z0-9_-], idempotente
// su retry di rete. Una bozza per percorso.
export async function goalRequestId(sessionId: string): Promise<string> {
    if (!sessionId) throw new Error('A saved session is required');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionId));
    return `goal-${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 48)}`;
}
