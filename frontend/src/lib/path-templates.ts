// Path templates (#172): abstract steps as the server stores and accepts them.
export type TemplateStepType = 'tool' | 'questionnaire_administration' | 'guided_results_chat' | 'assignment' | 'forum';
export const TEMPLATE_STEP_TYPES: TemplateStepType[] = ['tool', 'questionnaire_administration', 'guided_results_chat', 'assignment', 'forum'];
export const TEMPLATE_QUESTIONNAIRES = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
export const TEMPLATE_LOCALES = ['it', 'en', 'es', 'fr', 'de', 'sv'];
// The tool menu lists personal tools only (#173); standalone guided chats have their own choice.
export const TEMPLATE_TOOLS = ['tavolo', 'goals', 'actions', 'timeline', 'portfolio', 'pqbl', 'flashcards', 'cards',
    'comparison', 'bussola', 'assistant'];

export interface TemplateStep {
    id?: number;
    step_type: TemplateStepType;
    title?: string | null;
    instructions?: string | null;
    tool_key?: string;
    instrument_code?: string;
    locale?: string;
    plan_title?: string;
    results_position?: number;
    goal_id?: number;
    goal_title?: string | null;
    attachments?: {source_kind: 'strategy' | 'reading'; source_id: number}[];
    tool_keys?: string[];
    assignment_instructions?: string;
    intent?: 'proposal' | 'requested';
    response_prompt?: string;
    language?: string;
    topic_title?: string;
    topic_body?: string;
}

export interface PathTemplate {
    id: number;
    title: string;
    description: string | null;
    mode: 'recommended' | 'strict';
    owner_username: string;
    owner_name: string;
    is_owner: boolean;
    shared: boolean;
    revision: number;
    steps: TemplateStep[];
}

const text = (value: unknown) => (value == null ? '' : String(value));

function parseStep(input: unknown): TemplateStep {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const type = TEMPLATE_STEP_TYPES.includes(raw.step_type as TemplateStepType) ? raw.step_type as TemplateStepType : 'tool';
    return {
        id: raw.id != null ? Number(raw.id) : undefined,
        step_type: type,
        title: raw.title ? String(raw.title) : null,
        instructions: raw.instructions ? String(raw.instructions) : null,
        tool_key: text(raw.tool_key),
        instrument_code: text(raw.instrument_code) || 'QSA',
        locale: text(raw.locale) || 'it',
        plan_title: text(raw.plan_title),
        results_position: raw.results_position != null ? Number(raw.results_position) : undefined,
        goal_id: raw.goal_id != null ? Number(raw.goal_id) : undefined,
        goal_title: raw.goal_title ? String(raw.goal_title) : null,
        attachments: Array.isArray(raw.attachments) ? raw.attachments as TemplateStep['attachments'] : [],
        tool_keys: Array.isArray(raw.tool_keys) ? raw.tool_keys.map(String) : [],
        assignment_instructions: text(raw.assignment_instructions),
        intent: raw.intent === 'requested' ? 'requested' : 'proposal',
        response_prompt: text(raw.response_prompt),
        language: text(raw.language) || 'it',
        topic_title: text(raw.topic_title),
        topic_body: text(raw.topic_body),
    };
}

export function parsePathTemplate(input: unknown): PathTemplate {
    if (!input || typeof input !== 'object') throw new Error('Invalid template payload');
    const raw = input as Record<string, unknown>;
    return {
        id: Number(raw.id),
        title: text(raw.title),
        description: raw.description ? String(raw.description) : null,
        mode: raw.mode === 'strict' ? 'strict' : 'recommended',
        owner_username: text(raw.owner_username),
        owner_name: text(raw.owner_name) || text(raw.owner_username),
        is_owner: Boolean(raw.is_owner),
        shared: Boolean(raw.shared),
        revision: Number(raw.revision || 1),
        steps: Array.isArray(raw.steps) ? raw.steps.map(parseStep) : [],
    };
}

export function parsePathTemplateList(input: unknown): {mine: PathTemplate[]; shared: PathTemplate[]} {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    if (!Array.isArray(raw.mine) || !Array.isArray(raw.shared)) throw new Error('Invalid template list');
    return {mine: raw.mine.map(parsePathTemplate), shared: raw.shared.map(parsePathTemplate)};
}

export function newTemplateStep(type: TemplateStepType): TemplateStep {
    return parseStep({step_type: type});
}

/** Moving or removing steps keeps every results chat on the same questionnaire step. */
export function moveTemplateStep(steps: TemplateStep[], from: number, to: number | null): TemplateStep[] {
    const order = steps.map((_, index) => index);
    if (to === null) order.splice(from, 1);
    else order.splice(to, 0, order.splice(from, 1)[0]);
    const position = new Map(order.map((oldIndex, newIndex) => [oldIndex + 1, newIndex + 1]));
    return order.map(index => {
        const step = steps[index];
        if (step.step_type !== 'guided_results_chat' || step.results_position == null) return step;
        return {...step, results_position: position.get(step.results_position)};
    });
}

/** The strict server payload: only the fields of each step type. */
export function templateStepPayload(step: TemplateStep) {
    const base = {
        ...(step.id ? {id: step.id} : {}),
        step_type: step.step_type,
        title: step.title?.trim() || null,
        instructions: step.instructions?.trim() || null,
    };
    switch (step.step_type) {
        case 'tool': return {...base, tool_key: step.tool_key};
        case 'questionnaire_administration':
            return {...base, instrument_code: step.instrument_code, locale: step.locale, plan_title: step.plan_title?.trim() || ''};
        case 'guided_results_chat': return {...base, results_position: step.results_position};
        case 'assignment':
            return {...base, goal_id: step.goal_id, attachments: step.attachments ?? [], tool_keys: step.tool_keys ?? [],
                assignment_instructions: step.assignment_instructions?.trim() || '', intent: step.intent ?? 'proposal',
                response_prompt: step.response_prompt?.trim() || '', language: step.language ?? 'it'};
        case 'forum': return {...base, topic_title: step.topic_title?.trim(), topic_body: step.topic_body?.trim()};
    }
}

/** Client-side check before saving; the server repeats every rule. */
export function templateStepsValid(steps: TemplateStep[]): boolean {
    return steps.every((step, index) => {
        switch (step.step_type) {
            case 'tool': return Boolean(step.tool_key);
            case 'questionnaire_administration': return Boolean(step.instrument_code);
            case 'guided_results_chat': {
                const source = step.results_position;
                return source != null && source - 1 < index && steps[source - 1]?.step_type === 'questionnaire_administration';
            }
            case 'assignment': return Boolean(step.goal_id);
            case 'forum': return Boolean(step.topic_title?.trim() && step.topic_body?.trim());
        }
    });
}

// «Update from template»: differences the server found between a class path and its template.
export interface TemplateChange {
    change: 'added' | 'changed' | 'removed';
    step_type: TemplateStepType;
    tool_key: string | null;
    title: string | null;
    status: 'apply' | 'started' | 'created' | 'tool_disabled';
}

export interface TemplateUpdatePreview {
    template_title: string;
    template_revision: number;
    changes: TemplateChange[];
}

export function parseTemplateUpdate(input: unknown): TemplateUpdatePreview {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    if (!Array.isArray(raw.changes)) throw new Error('Invalid template update');
    return {
        template_title: text(raw.template_title),
        template_revision: Number(raw.template_revision),
        changes: raw.changes.map(item => {
            const row = item as Record<string, unknown>;
            return {
                change: row.change === 'added' || row.change === 'removed' ? row.change : 'changed',
                step_type: (TEMPLATE_STEP_TYPES as string[]).includes(String(row.step_type)) ? row.step_type as TemplateStepType : 'tool',
                tool_key: row.tool_key ? String(row.tool_key) : null,
                title: row.title ? String(row.title) : null,
                status: row.status === 'apply' || row.status === 'started' || row.status === 'created' ? row.status : 'tool_disabled',
            };
        }),
    };
}
