const STORAGE_KEY = 'counselorbot_pqbl_progress_v1';

function browserStorage(): Storage | null {
    return typeof window === 'undefined' ? null : window.localStorage;
}

export function loadPqblProgress<T>(storage: Storage | null = browserStorage()): T | null {
    if (!storage) return null;
    try {
        const value = storage.getItem(STORAGE_KEY);
        return value ? JSON.parse(value) as T : null;
    } catch {
        return null;
    }
}

export function savePqblProgress(value: unknown, storage: Storage | null = browserStorage()): void {
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Storage can be unavailable or full; the active session still works.
    }
}

// Cambi di progresso da un'altra scheda: stesso aggancio del punto di ripresa
// della chat in `lib/resume.ts`.
export function subscribeToPqblProgress(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
}

// Attività pQBL da riprendere: c'è un progresso salvato e non è né l'inizio né
// la scheda dei risultati finali, che non ha più nulla da portare avanti.
export function hasPqblProgress(storage: Storage | null = browserStorage()): boolean {
    const saved = loadPqblProgress<{ phase?: string }>(storage);
    const phase = saved?.phase;
    return Boolean(phase) && phase !== 'setup' && phase !== 'finalResults';
}

export function clearPqblProgress(storage: Storage | null = browserStorage()): void {
    try {
        storage?.removeItem(STORAGE_KEY);
    } catch {
        // Nothing else to do if storage is unavailable.
    }
}
