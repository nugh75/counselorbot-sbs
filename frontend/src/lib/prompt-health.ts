// Avvisi sui prompt (#760): tipi e funzioni pure del pannello admin.

export type PromptHealthSeverity = 'high' | 'medium' | 'low';

export interface PromptHealthSentence {
    prompt: string;
    text: string;
    field?: string;
    value?: unknown;
    /** Posizione nel testo da cui è stato letto (#761); null per i prompt nel codice. */
    start?: number | null;
    end?: number | null;
}

export interface PromptHealthAck {
    note: string;
    author?: string | null;
    created_at?: string | null;
}

export interface PromptHealthFinding {
    id: string;
    code: string;
    severity: PromptHealthSeverity;
    prompts: string[];
    surfaces: string[];
    sentences: PromptHealthSentence[];
    params: Record<string, unknown>;
    /** Prompt modificabili dall'admin e prompt ancora col testo di fabbrica (#761). */
    editable?: string[];
    factory?: string[];
    ack?: PromptHealthAck | null;
}

export interface PromptHealthRun {
    id: number;
    created_at: string | null;
    counts: { high?: number; medium?: number; low?: number; total?: number; acknowledged?: number };
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

// --- Schermata di confronto (#761) -------------------------------------------------

export interface PromptHealthRange {
    start: number;
    end: number;
    /** Numero dell'avviso nel pannello: lo stesso nel testo e nell'elenco sotto. */
    number: number;
    findingId: string;
    severity: PromptHealthSeverity;
}

function locate(text: string, needle: string, hint?: number | null, hintEnd?: number | null): [number, number] | null {
    if (!needle) return null;
    if (hint != null && hintEnd != null && text.slice(hint, hintEnd) === needle) return [hint, hintEnd];
    let start = text.indexOf(needle);
    if (start < 0) start = text.toLowerCase().indexOf(needle.toLowerCase());
    return start < 0 ? null : [start, start + needle.length];
}

/** Passaggi da evidenziare in un prompt: cercati nel testo corrente, così seguono le modifiche. */
export function findingRanges(findings: PromptHealthFinding[], promptId: string, text: string): PromptHealthRange[] {
    const ranges: PromptHealthRange[] = [];
    let number = 0;
    for (const finding of findings) {
        const found = finding.sentences
            .filter(sentence => sentence.prompt === promptId)
            .map(sentence => locate(text, sentence.text, sentence.start, sentence.end))
            .filter((range): range is [number, number] => range !== null);
        if (!found.length) continue;
        number += 1;
        for (const [start, end] of found) ranges.push({ start, end, number, findingId: finding.id, severity: finding.severity });
    }
    return ranges;
}

/** Il testo diviso in tratti: ogni tratto sa quali avvisi lo coprono. */
export function highlightSegments(text: string, ranges: PromptHealthRange[]): { text: string; numbers: number[] }[] {
    const cuts = new Set([0, text.length]);
    for (const range of ranges) { cuts.add(Math.max(0, range.start)); cuts.add(Math.min(text.length, range.end)); }
    const points = [...cuts].sort((a, b) => a - b);
    const segments: { text: string; numbers: number[] }[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
        const [from, to] = [points[i], points[i + 1]];
        if (from === to) continue;
        const numbers = [...new Set(ranges.filter(r => r.start <= from && r.end >= to).map(r => r.number))].sort((a, b) => a - b);
        segments.push({ text: text.slice(from, to), numbers });
    }
    return segments;
}

/** La frase dell'altro prompt coinvolto, per spiegare il conflitto. */
export function otherSentence(finding: PromptHealthFinding, promptId: string): PromptHealthSentence | null {
    return finding.sentences.find(sentence => sentence.prompt !== promptId) ?? null;
}

export type PromptCellStatus = 'ok' | 'warning' | 'error' | 'unused';

/** Avvisi legati ai turni (percorso · passo · modalità) invece che ai singoli prompt. */
const SURFACE_CODES = new Set(['rule_conflict', 'assembly_failed', 'llm_contradiction']);

/** Stato di una casella percorso x passo; gli avvisi segnati come voluti non contano. */
export function cellStatus(step: { prompts: string[]; surfaces: string[] }, findings: PromptHealthFinding[]): PromptCellStatus {
    const prompts = new Set(step.prompts);
    const surfaces = new Set(step.surfaces);
    const relevant = findings.filter(finding => !finding.ack && (SURFACE_CODES.has(finding.code)
        ? finding.surfaces.some(surface => surfaces.has(surface))
        : finding.prompts.some(prompt => prompts.has(prompt))));
    if (relevant.some(finding => finding.code === 'step_without_prompt' || finding.code === 'empty_prompt')) return 'unused';
    if (relevant.some(finding => finding.severity === 'high')) return 'error';
    return relevant.length ? 'warning' : 'ok';
}

/** Prompt da aprire nel confronto per un avviso: quelli modificabili, al massimo tre. */
export function compareTargets(finding: PromptHealthFinding): string[] {
    return (finding.editable ?? finding.prompts.filter(id => !id.startsWith('code:'))).slice(0, 3);
}

export interface DiffLine { type: 'same' | 'del' | 'add'; text: string }

/** Diff riga per riga (LCS), sufficiente per i prompt. */
export function lineDiff(before: string, after: string): DiffLine[] {
    const a = before.split('\n');
    const b = after.split('\n');
    if (a.length * b.length > 250000) return [...a.map((text): DiffLine => ({ type: 'del', text })), ...b.map((text): DiffLine => ({ type: 'add', text }))];
    const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i -= 1) {
        for (let j = b.length - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i += 1; j += 1; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i += 1; }
        else { out.push({ type: 'add', text: b[j] }); j += 1; }
    }
    while (i < a.length) { out.push({ type: 'del', text: a[i] }); i += 1; }
    while (j < b.length) { out.push({ type: 'add', text: b[j] }); j += 1; }
    return out;
}

export const PROMPT_HEALTH_REPO = 'https://github.com/nugh75/counselorbot-sbs';

/** «Da correggere nel codice»: issue GitHub precompilata per un avviso sul testo di fabbrica. */
export function codeIssueUrl(finding: PromptHealthFinding, message: string): string {
    const body = [
        `Prompt health finding \`${finding.id}\` (${finding.code}, ${finding.severity}) on factory text.`,
        '',
        `Prompts: ${finding.prompts.map(id => `\`${id}\``).join(', ')}`,
        ...finding.sentences.map(sentence => `- \`${sentence.prompt}\`: «${sentence.text}»`),
        finding.surfaces.length ? `\nWhere: ${finding.surfaces.slice(0, 10).join('; ')}` : '',
        '',
        'Found by the static prompt check (Administration › Prompt health).',
    ].join('\n');
    const params = new URLSearchParams({ title: `fix: ${message}`, body });
    return `${PROMPT_HEALTH_REPO}/issues/new?${params.toString()}`;
}

// --- Controllo con un modello (#763) -------------------------------------------------

export interface PromptHealthLlmSettings {
    provider: string;
    model: string;
    configured: boolean;
    providers: string[];
    max_calls_per_run: number;
}

export interface PromptHealthLlmEstimate {
    configured: boolean;
    combinations: number;
    cached: number;
    calls: number;
    max_calls_per_run: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number | null;
}

export interface PromptHealthLlmRun {
    calls: number;
    failed: number;
    cached: number;
    remaining: number;
    findings: PromptHealthFinding[];
}

/** Riscrittura proposta dal modello per un prompt: testo prima e dopo. */
export interface PromptHealthProposal { prompt_id: string; before: string; after: string }

/** «Proponi correzione»: serve almeno una frase in un prompt modificabile. */
export function canPropose(finding: PromptHealthFinding): boolean {
    const editable = new Set(compareTargets(finding));
    return finding.sentences.some(sentence => editable.has(sentence.prompt));
}

/** Avvisi del controllo statico e del modello in un solo elenco, senza doppioni. */
export function mergeFindings(first: PromptHealthFinding[], second: PromptHealthFinding[]): PromptHealthFinding[] {
    const seen = new Set(first.map(finding => finding.id));
    return [...first, ...second.filter(finding => !seen.has(finding.id) && seen.add(finding.id))];
}

/** Costo stimato leggibile, o null se il modello non è a listino. */
export function estimateCost(usd: number | null): string | null {
    if (usd == null) return null;
    return usd < 0.01 ? '< $0.01' : `$${usd.toFixed(2)}`;
}
