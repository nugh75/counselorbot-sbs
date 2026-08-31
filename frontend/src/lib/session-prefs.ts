// Scelte di percorso ricordate da uno strumento all'altro: metodo di
// inserimento e modalità di chat. Il counselor ha già la sua persistenza in
// `lib/counselor.ts`. Le fasi restano nella catena — ci si torna con
// "indietro" o dalla schermata iniziale — ma non si ripetono a ogni strumento.

export type InputMethodPref = 'manual' | 'upload';
export type ExperiencePref = 'standard' | 'opencode';

const METHOD_KEY = 'counselorbot_input_method';
const EXPERIENCE_KEY = 'counselorbot_experience';
const EVENT = 'counselorbot-prefs-change';

function read<T extends string>(key: string, allowed: readonly T[]): T | null {
    if (typeof window === 'undefined') return null;
    try {
        const value = window.localStorage.getItem(key) as T | null;
        return value && allowed.includes(value) ? value : null;
    } catch {
        return null;
    }
}

function write(key: string, value: string | null): void {
    if (typeof window === 'undefined') return;
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    } catch {
        /* storage non disponibile: la scelta vale solo per questa sessione */
    }
    window.dispatchEvent(new Event(EVENT));
}

export function getInputMethodPref(): InputMethodPref | null {
    return read(METHOD_KEY, ['manual', 'upload'] as const);
}

export function setInputMethodPref(value: InputMethodPref | null): void {
    write(METHOD_KEY, value);
}

export function getExperiencePref(): ExperiencePref | null {
    return read(EXPERIENCE_KEY, ['standard', 'opencode'] as const);
}

// Idea offre due esperienze sostanzialmente diverse (mappa grafica e workspace
// OpenCode): la scelta va mostrata a ogni nuova sessione, anche se altrove è
// stata ricordata una modalità.
export function experiencePrefForInstrument(
    instrument: string,
    preference: ExperiencePref | null,
): ExperiencePref | null {
    return instrument === 'IDEA' ? null : preference;
}

export function setExperiencePref(value: ExperiencePref | null): void {
    write(EXPERIENCE_KEY, value);
}

// Torna a farsi chiedere metodo e modalità al prossimo strumento.
export function clearFlowPrefs(): void {
    write(METHOD_KEY, null);
    write(EXPERIENCE_KEY, null);
}

export function subscribeToFlowPrefs(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(EVENT, onChange);
    };
}
