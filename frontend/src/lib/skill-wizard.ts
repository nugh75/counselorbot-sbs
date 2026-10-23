// Logica pura del wizard delle skill (components/admin/SkillWizard.tsx):
// condizioni, agganci agli step e lettura dell'anteprima. Nessuna chiamata di
// rete qui, cosi' si prova con `node --test`.

export interface StepSkillEntry {
    questionnaire_type: string;
    step_id: string;
    skill_id: number;
    sort_order: number;
    enabled: boolean;
    override_params: Record<string, unknown> | null;
}

export type BindingMode = 'off' | 'all' | 'steps';

export interface BindingChoice {
    mode: BindingMode;
    steps: string[];
}

export interface ConditionForm {
    // Vuoto: nessun vincolo sull'intento dello studente.
    intents: string[];
    requiresScores: boolean;
    // Le altre chiavi (lingue, bande, step_modes...) restano in JSON avanzato.
    extra: string;
}

export interface PreviewDelivery {
    slug: string;
    slot: string;
    chars: number;
    in_prompt: boolean;
}

export interface PreviewResult {
    engine_enabled: boolean;
    intent: string;
    blocks: Record<string, string[]>;
    trace: Record<string, unknown>[];
    delivery: PreviewDelivery[];
}

export interface PreviewOutcome {
    entered: boolean;
    delivered: boolean;
    reason: string;
}

export function slugify(name: string): string {
    return name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

export function conditionsToForm(conditions: Record<string, unknown> | null | undefined): ConditionForm {
    const { intents, requires_scores: requiresScores, ...rest } = conditions ?? {};
    return {
        intents: Array.isArray(intents) ? intents.map(String) : [],
        requiresScores: requiresScores === true,
        extra: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '',
    };
}

// `null` se il JSON avanzato non e' un oggetto valido.
export function formToConditions(form: ConditionForm): Record<string, unknown> | null {
    let extra: unknown = {};
    if (form.extra.trim()) {
        try {
            extra = JSON.parse(form.extra);
        } catch {
            return null;
        }
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return null;
    }
    const conditions: Record<string, unknown> = { ...(extra as Record<string, unknown>) };
    delete conditions.intents;
    delete conditions.requires_scores;
    if (form.intents.length) conditions.intents = [...form.intents];
    if (form.requiresScores) conditions.requires_scores = true;
    return conditions;
}

// Scelta mostrata dal wizard: `*` acceso = tutti gli step, altrimenti gli step
// con un aggancio acceso. Un aggancio spento su un solo step (creato via API)
// esclude quello step anche col `*` acceso (skills.registry.bindings_for): il
// wizard non lo crea e la mappa dei prompt lo mostra.
export function bindingChoice(entries: StepSkillEntry[], skillId: number): BindingChoice {
    const own = entries.filter(entry => entry.skill_id === skillId && entry.enabled);
    if (own.some(entry => entry.step_id === '*')) return { mode: 'all', steps: [] };
    const steps = own.map(entry => entry.step_id);
    return steps.length ? { mode: 'steps', steps } : { mode: 'off', steps: [] };
}

// Nuova mappa dello strumento per `PUT /admin/skills/step-map`, che sostituisce
// tutte le righe: quelle delle altre skill restano identiche. L'aggancio `*`
// esistente si spegne invece di sparire, perche' il seed ricrea quelli mancanti
// delle skill di serie al riavvio.
export function applyBindingChoice(
    entries: StepSkillEntry[],
    skillId: number,
    instrument: string,
    choice: BindingChoice,
    sortOrder = 0,
): StepSkillEntry[] {
    const others = entries.filter(entry => entry.skill_id !== skillId);
    const own = entries.filter(entry => entry.skill_id === skillId);
    const row = (stepId: string): StepSkillEntry => {
        const existing = own.find(entry => entry.step_id === stepId);
        return existing ?? {
            questionnaire_type: instrument, step_id: stepId, skill_id: skillId,
            sort_order: sortOrder, enabled: true, override_params: null,
        };
    };
    const result = [...others];
    const wildcard = own.find(entry => entry.step_id === '*');
    if (choice.mode === 'all') result.push({ ...row('*'), enabled: true });
    else if (wildcard) result.push({ ...wildcard, enabled: false });
    if (choice.mode === 'steps') {
        for (const stepId of [...new Set(choice.steps)].filter(id => id && id !== '*')) {
            result.push({ ...row(stepId), enabled: true });
        }
    }
    return result;
}

// Esito dell'anteprima per la skill in prova: entra, arriva nel prompt, e se no
// perche' (motivo della trace, oppure scartata dal router / non agganciata).
export function previewOutcome(result: PreviewResult, slug: string): PreviewOutcome {
    const delivered = result.delivery.filter(entry => entry.slug === slug);
    if (delivered.length) {
        return { entered: true, delivered: delivered.every(entry => entry.in_prompt), reason: '' };
    }
    const skipped = result.trace
        .filter(entry => entry.slug === slug && typeof entry.skipped === 'string' && entry.skipped)
        .map(entry => String(entry.skipped));
    return { entered: false, delivered: false, reason: skipped[skipped.length - 1] ?? '' };
}
