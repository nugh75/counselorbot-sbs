// Logica pura e definizioni per il wizard di creazione nuovi strumenti e chat guidate (admin).
// Usato da CreateInstrumentDialog e testabile isolatamente senza browser.

export type StepTemplateKey = 'three_steps' | 'single_step' | 'empty';

export interface StepTemplateDef {
    suffix: string;
    label_it: string;
    label_i18n: Record<string, string>;
    prompt: string;
}

export interface InstrumentWizardForm {
    code: string;
    name_it: string;
    name_en: string;
    name_es: string;
    name_fr: string;
    name_de: string;
    name_sv: string;
    description_it: string;
    description_en: string;
    description_es: string;
    description_fr: string;
    description_de: string;
    description_sv: string;
    tool_category: 'guided' | 'assessment';
    target_audience: 'student' | 'teacher' | 'both';
    icon: 'compass' | 'briefcase' | 'lightbulb' | 'target' | 'clock' | 'clipboard' | 'chart';
    color_theme: string;
    interview_mode: 'interactive' | 'direct';
    is_active: boolean;
    template: StepTemplateKey;
    selected_counselor_ids: number[];
}

export const INITIAL_WIZARD_FORM: InstrumentWizardForm = {
    code: '',
    name_it: '',
    name_en: '',
    name_es: '',
    name_fr: '',
    name_de: '',
    name_sv: '',
    description_it: '',
    description_en: '',
    description_es: '',
    description_fr: '',
    description_de: '',
    description_sv: '',
    tool_category: 'guided',
    target_audience: 'student',
    icon: 'compass',
    color_theme: 'blue',
    interview_mode: 'interactive',
    is_active: false,
    template: 'three_steps',
    selected_counselor_ids: [],
};

export const STEP_TEMPLATES: Record<StepTemplateKey, {
    key: StepTemplateKey;
    steps: StepTemplateDef[];
}> = {
    three_steps: {
        key: 'three_steps',
        steps: [
            {
                suffix: 'intro',
                label_it: 'Introduzione',
                label_i18n: {
                    en: 'Introduction',
                    es: 'Introducción',
                    fr: 'Introduction',
                    de: 'Einführung',
                    sv: 'Introduktion',
                },
                prompt: 'Accogli lo studente, presenta il senso e lo scopo di questo percorso di riflessione e invita a condividere la propria prospettiva iniziale.',
            },
            {
                suffix: 'explore',
                label_it: 'Esplorazione',
                label_i18n: {
                    en: 'Exploration',
                    es: 'Exploración',
                    fr: 'Exploration',
                    de: 'Vertiefung',
                    sv: 'Fördjupning',
                },
                prompt: 'Approfondisci con domande aperte le risposte fornite, incoraggiando lo studente ad analizzare le proprie esperienze, dubbi e motivazioni.',
            },
            {
                suffix: 'synthesis',
                label_it: 'Conclusione e sintesi',
                label_i18n: {
                    en: 'Synthesis & Next Steps',
                    es: 'Síntesis y pasos a seguir',
                    fr: 'Synthèse et prochaines étapes',
                    de: 'Synthese und nächste Schritte',
                    sv: 'Syntes och åtgärder',
                },
                prompt: 'Aiuta lo studente a trarre le conclusioni dal dialogo, sintetizza i punti chiave emersi e guida la definizione di passi concreti.',
            },
        ],
    },
    single_step: {
        key: 'single_step',
        steps: [
            {
                suffix: 'chat',
                label_it: 'Colloquio guidato',
                label_i18n: {
                    en: 'Guided discussion',
                    es: 'Coloquio guiado',
                    fr: 'Discussion guidée',
                    de: 'Geleitetes Gespräch',
                    sv: 'Vägledande samtal',
                },
                prompt: 'Conduci il colloquio guidato supportando lo studente con ascolto attivo, domande di approfondimento e rilanci riflessivi.',
            },
        ],
    },
    empty: {
        key: 'empty',
        steps: [],
    },
};

export function sanitizeInstrumentCode(raw: string): string {
    return raw.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_-]/g, '');
}

export function validateInstrumentCode(code: string): { valid: boolean; errorKey?: string } {
    const trimmed = code.trim();
    if (!trimmed) {
        return { valid: false, errorKey: 'codeRequired' };
    }
    if (!/^[A-Z0-9_-]+$/.test(trimmed)) {
        return { valid: false, errorKey: 'codeInvalid' };
    }
    if (trimmed.length < 2 || trimmed.length > 40) {
        return { valid: false, errorKey: 'codeLength' };
    }
    return { valid: true };
}

export function buildInstrumentPayload(form: InstrumentWizardForm) {
    const code = sanitizeInstrumentCode(form.code);

    const name_i18n: Record<string, string> = {};
    if (form.name_it.trim()) name_i18n.it = form.name_it.trim();
    if (form.name_en.trim()) name_i18n.en = form.name_en.trim();
    if (form.name_es.trim()) name_i18n.es = form.name_es.trim();
    if (form.name_fr.trim()) name_i18n.fr = form.name_fr.trim();
    if (form.name_de.trim()) name_i18n.de = form.name_de.trim();
    if (form.name_sv.trim()) name_i18n.sv = form.name_sv.trim();

    const description_i18n: Record<string, string> = {};
    if (form.description_it.trim()) description_i18n.it = form.description_it.trim();
    if (form.description_en.trim()) description_i18n.en = form.description_en.trim();
    if (form.description_es.trim()) description_i18n.es = form.description_es.trim();
    if (form.description_fr.trim()) description_i18n.fr = form.description_fr.trim();
    if (form.description_de.trim()) description_i18n.de = form.description_de.trim();
    if (form.description_sv.trim()) description_i18n.sv = form.description_sv.trim();

    return {
        code,
        name_it: form.name_it.trim() || null,
        name_en: form.name_en.trim() || null,
        name_es: form.name_es.trim() || null,
        name_sv: form.name_sv.trim() || null,
        name_i18n: Object.keys(name_i18n).length ? name_i18n : null,
        description_i18n: Object.keys(description_i18n).length ? description_i18n : null,
        tool_category: form.tool_category,
        target_audience: form.target_audience,
        icon: form.icon,
        color_theme: form.color_theme,
        interview_mode: form.interview_mode,
        is_active: form.is_active,
        status: 'experimental',
        response_scale_min: 1,
        response_scale_max: 4,
        report_scale_type: 'stanine',
    };
}

export function buildInitialSteps(
    code: string,
    templateKey: StepTemplateKey,
    colorTheme: string,
) {
    const template = STEP_TEMPLATES[templateKey];
    if (!template || !template.steps.length) return [];
    const cleanCode = sanitizeInstrumentCode(code);
    return template.steps.map((step, index) => ({
        id: `${cleanCode.toLowerCase()}_${step.suffix}`,
        sort_order: index + 1,
        label: step.label_it,
        label_i18n: step.label_i18n,
        prompt: step.prompt,
        system_prompt_mode: 'generic',
        color_theme: colorTheme,
        questionnaire_type: cleanCode,
    }));
}

export function counselorNeedsUpdate(
    counselor: { questionnaire_types?: string[] | null },
    code: string,
): boolean {
    const cleanCode = sanitizeInstrumentCode(code);
    const types = counselor.questionnaire_types || [];
    return !types.includes(cleanCode);
}

export function updatedCounselorTypes(
    counselor: { questionnaire_types?: string[] | null },
    code: string,
): string[] {
    const cleanCode = sanitizeInstrumentCode(code);
    const existing = counselor.questionnaire_types || [];
    return existing.includes(cleanCode) ? existing : [...existing, cleanCode];
}

export interface CounselorSummary {
    id: number;
    name: string;
    slug: string;
    avatar?: string | null;
    is_active?: boolean;
    questionnaire_types?: string[] | null;
}

export interface CreateInstrumentResult {
    ok: boolean;
    code: string;
    error?: string;
    stepsCreated?: number;
    counselorsUpdated?: number;
}

export async function executeCreateInstrument(
    form: InstrumentWizardForm,
    counselors: CounselorSummary[],
    fetcher: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<CreateInstrumentResult> {
    const validation = validateInstrumentCode(form.code);
    if (!validation.valid) {
        return { ok: false, code: form.code, error: validation.errorKey || 'codeInvalid' };
    }
    const cleanCode = sanitizeInstrumentCode(form.code);

    // 1. POST /api/admin/instruments
    const instrumentPayload = buildInstrumentPayload(form);
    const instRes = await fetcher('/api/admin/instruments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instrumentPayload),
    });

    if (!instRes.ok) {
        let errorDetail = `Status ${instRes.status}`;
        try {
            const errData = await instRes.json();
            if (errData?.detail) errorDetail = errData.detail;
        } catch {
            // keep status
        }
        return { ok: false, code: cleanCode, error: errorDetail };
    }

    // 2. Creazione step iniziali se previsti dal template
    const steps = buildInitialSteps(cleanCode, form.template, form.color_theme);
    let stepsCreated = 0;
    for (const step of steps) {
        const stepRes = await fetcher('/api/admin/guided-steps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(step),
        });
        if (stepRes.ok) {
            stepsCreated++;
        }
    }

    // 3. Associazione counselor selezionati
    let counselorsUpdated = 0;
    const selectedIds = new Set(form.selected_counselor_ids);
    for (const counselor of counselors) {
        if (selectedIds.has(counselor.id) && counselorNeedsUpdate(counselor, cleanCode)) {
            const newTypes = updatedCounselorTypes(counselor, cleanCode);
            const updRes = await fetcher(`/api/admin/counselors/${counselor.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionnaire_types: newTypes }),
            });
            if (updRes.ok) {
                counselorsUpdated++;
            }
        }
    }

    return {
        ok: true,
        code: cleanCode,
        stepsCreated,
        counselorsUpdated,
    };
}
