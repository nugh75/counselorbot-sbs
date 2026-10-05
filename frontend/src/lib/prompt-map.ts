// Mappa dei prompt delle chat guidate (admin): tipi della risposta di
// GET /api/admin/prompt-map e regole pure della vista. I livelli e le chiavi
// arrivano dal backend (backend/prompt_map.py): qui nessuna lista di chiavi.

export type PromptMapLevel = 'common' | 'group' | 'instrument' | 'step';
export type PromptMapDestination = 'model' | 'student' | 'admin' | 'context_filter';
export type PromptMapWhen = 'entry' | 'every_turn' | 'follow_up' | 'student' | 'admin';
export type PromptMapBadge = 'model-entry' | 'model-turn' | 'model-follow-up' | 'student' | 'admin' | 'context';

export interface PromptMapUser {
    instrument: string;
    step_id: string;
    label: string;
    label_i18n?: Record<string, string>;
    fixed?: boolean;
}

export interface PromptMapCounselor {
    id: number;
    name: string;
    persona: string;
}

export interface PromptMapEntry {
    key: string;
    kind: 'config' | 'guided_step' | 'step_questions' | 'counselor_persona';
    role: string;
    field?: string;
    level: PromptMapLevel;
    destination: PromptMapDestination;
    when: PromptMapWhen;
    label?: string;
    description?: string;
    value: unknown;
    stored: boolean;
    default?: string | null;
    shared: boolean;
    used_by: { instruments: string[]; steps: PromptMapUser[] };
    editor: { method: string; path: string; field?: string; panel?: string; questionnaire_type?: string; step_id?: string };
    read_only: boolean;
    translations?: Record<string, string>;
    effective?: Record<string, unknown>;
}

export interface PromptMapRef {
    key: string;
    level: PromptMapLevel;
    role: string;
    when: PromptMapWhen;
    override_key?: string;
}

export interface PromptMapStep {
    id: string;
    label: string;
    label_i18n: Record<string, string>;
    color_theme: string | null;
    sort_order: number | null;
    system_prompt_mode: string | null;
    system_prompt_key: string | null;
    follow_up_mode: string | null;
    fixed: boolean;
    entries: PromptMapEntry[];
    refs: PromptMapRef[];
}

export interface PromptMapGroup {
    instruments: string[];
    entries: PromptMapEntry[];
}

export interface PromptMapInstrument {
    id: string;
    step_count: number;
}

export interface PromptMap {
    instrument: string;
    instruments: PromptMapInstrument[];
    levels: {
        common: PromptMapEntry[];
        groups: PromptMapGroup[];
        instrument: PromptMapEntry[];
        steps: PromptMapStep[];
    };
}

export const PROMPT_MAP_LANGUAGES = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;

export function badgeFor(entry: Pick<PromptMapEntry, 'destination' | 'when'>): PromptMapBadge {
    if (entry.destination === 'student') return 'student';
    if (entry.destination === 'admin') return 'admin';
    if (entry.destination === 'context_filter') return 'context';
    if (entry.when === 'entry') return 'model-entry';
    if (entry.when === 'follow_up') return 'model-follow-up';
    return 'model-turn';
}

/** Una voce usata da più strumenti o da più step chiede conferma prima del salvataggio. */
export function needsSharedConfirm(entry: PromptMapEntry): boolean {
    return entry.level === 'group' || entry.used_by.instruments.length > 1 || entry.used_by.steps.length > 1;
}

/** Step che usano la voce, raggruppati per strumento nell'ordine di `used_by.instruments`. */
export function stepsByInstrument(entry: PromptMapEntry): { instrument: string; steps: PromptMapUser[] }[] {
    const { instruments, steps } = entry.used_by;
    return instruments.map(instrument => ({ instrument, steps: steps.filter(step => step.instrument === instrument) }));
}

export function entryAnchor(key: string): string {
    return `pm-${key.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

export function levelAnchor(level: PromptMapLevel): string {
    return `pm-level-${level}`;
}

export function stepAnchor(stepId: string): string {
    return `pm-step-${stepId.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

/** Voce a cui punta un riferimento ereditato, cercata nei livelli superiori. */
export function findEntry(map: PromptMap, key: string): PromptMapEntry | undefined {
    const { common, groups, instrument, steps } = map.levels;
    return [...common, ...groups.flatMap(group => group.entries), ...instrument, ...steps.flatMap(step => step.entries)]
        .find(entry => entry.key === key);
}

export function levelCounts(map: PromptMap): Record<PromptMapLevel, number> {
    return {
        common: map.levels.common.length,
        group: map.levels.groups.reduce((total, group) => total + group.entries.length, 0),
        instrument: map.levels.instrument.length,
        step: map.levels.steps.length,
    };
}

/** Testo della voce nella lingua scelta: `it` è il valore base, le altre le traduzioni. */
export function entryText(entry: PromptMapEntry, language: string): string {
    if (entry.kind === 'guided_step' && entry.field === 'label') {
        return language === 'it' ? String(entry.value ?? '') : entry.translations?.[language] ?? '';
    }
    if (language !== 'it' && entry.translations) return entry.translations[language] ?? '';
    return typeof entry.value === 'string' ? entry.value : '';
}

export interface SaveRequest {
    url: string;
    method: 'POST' | 'PUT';
    body: Record<string, unknown>;
}

/**
 * Richiesta all'API esistente che salva la voce.
 * Testi per lo studente in altre lingue: `<chiave>__<lingua>`, come "Testi interfaccia".
 * Nome dello step: `label` per l'italiano, `label_i18n` per le altre lingue.
 */
export function saveRequest(entry: PromptMapEntry, value: string, language = 'it'): SaveRequest {
    if (entry.kind === 'guided_step') {
        const field = entry.field || '';
        if (field === 'label' && language !== 'it') {
            return {
                url: `/api${entry.editor.path}`,
                method: 'PUT',
                body: { label_i18n: { ...(entry.translations ?? {}), [language]: value } },
            };
        }
        return { url: `/api${entry.editor.path}`, method: 'PUT', body: { [field]: value } };
    }
    if (entry.kind !== 'config') throw new Error(`read-only entry: ${entry.key}`);
    const key = language !== 'it' && entry.translations ? `${entry.key}__${language}` : entry.key;
    return { url: '/api/admin/config', method: 'POST', body: { key, value, description: entry.description || entry.key } };
}

/** JSON dei componenti: le modifiche ai flag sopra quanto già salvato (strategie e limiti restano). */
export function componentsValue(stored: unknown, flags: Record<string, boolean>): string {
    let saved: Record<string, unknown> = {};
    try {
        const parsed = typeof stored === 'string' && stored.trim() ? JSON.parse(stored) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
    } catch {
        saved = {};
    }
    return JSON.stringify({ ...saved, ...flags });
}

export function booleanFlags(effective: Record<string, unknown> | undefined): Record<string, boolean> {
    return Object.fromEntries(Object.entries(effective ?? {}).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>;
}

/** Lista con l'elemento `from` spostato in `to`; spostamenti fuori dalla lista non cambiano nulla. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
    if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items];
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

export interface SortOrderItem<Id = string | number> {
    id: Id;
    sort_order: number;
}

/**
 * `sort_order` per una lista già nel nuovo ordine: riusa i valori che la lista
 * aveva (in ordine crescente), così gli altri elementi non si muovono; con valori
 * ripetuti rinumera 0..n-1. Restituisce solo gli elementi che cambiano.
 */
export function sortOrderChanges<Id>(ordered: SortOrderItem<Id>[]): SortOrderItem<Id>[] {
    let slots = ordered.map(item => item.sort_order).sort((a, b) => a - b);
    if (new Set(slots).size !== slots.length) slots = ordered.map((_, index) => index);
    return ordered.flatMap((item, index) => (item.sort_order === slots[index] ? [] : [{ id: item.id, sort_order: slots[index] }]));
}
