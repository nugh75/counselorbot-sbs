// Avvisi sui prompt (#760): tipi e funzioni pure del pannello admin.

export type PromptHealthSeverity = 'high' | 'medium' | 'low';

export interface PromptHealthSentence {
    prompt: string;
    text: string;
    field?: string;
    value?: unknown;
}

export interface PromptHealthFinding {
    id: string;
    code: string;
    severity: PromptHealthSeverity;
    prompts: string[];
    surfaces: string[];
    sentences: PromptHealthSentence[];
    params: Record<string, unknown>;
}

export interface PromptHealthRun {
    id: number;
    created_at: string | null;
    counts: { high?: number; medium?: number; low?: number; total?: number };
    findings: PromptHealthFinding[];
    current: boolean;
}

export const PROMPT_SAVED_EVENT = 'prompt-health:saved';

/** Stessa regola del backend (`prompt_registry.is_prompt_config_key`): solo testi per il modello. */
export function isPromptConfigKey(key: string): boolean {
    if (key.startsWith('prompt_components_') || key.startsWith('prompt_guidance_') || key === 'log_full_prompt') return false;
    if (/__(it|en|es|fr|de|sv)$/.test(key)) return false;
    return /^(prompt_|directive_|rag_chat_context_)/.test(key)
        || /(_prompt|_chat_context|_platform_context|_knowledge_card)$/.test(key);
}

/** Id del registro per una voce della mappa dei prompt, o null se non è un testo per il modello. */
export function promptHealthId(entry: { kind: string; key: string; field?: string; editor?: { path?: string } }): string | null {
    if (entry.kind === 'config') {
        const key = entry.key.replace(/__level_.*$/, '').replace(/__short$/, '');
        return isPromptConfigKey(key) ? `config:${key}` : null;
    }
    if (entry.kind === 'guided_step' && entry.field === 'prompt') {
        const stepId = (entry.editor?.path || '').split('/').pop();
        return stepId ? `guided_step:${decodeURIComponent(stepId)}` : null;
    }
    return null;
}

/** Nome leggibile di un id del registro: la chiave senza il prefisso. */
export function promptLabel(id: string): string {
    return id.replace(/^(config|guided_step|code):/, '');
}

export function topSeverity(counts: PromptHealthRun['counts']): PromptHealthSeverity | null {
    if (counts.high) return 'high';
    if (counts.medium) return 'medium';
    if (counts.low) return 'low';
    return null;
}

/** Prime `max` superfici e quante ne restano. */
export function visibleSurfaces(surfaces: string[], max = 3): { shown: string[]; hidden: number } {
    return { shown: surfaces.slice(0, max), hidden: Math.max(0, surfaces.length - max) };
}

/** Parametri del messaggio come testo: gli elenchi diventano "a, b". */
export function messageParams(params: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]));
}
