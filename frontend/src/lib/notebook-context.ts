// Taccuino nel contesto della chat guidata: il docente sceglie quale taccuino
// passa al prompt (studente, docente, nessuno) dal popover Opzioni. La scelta
// vive per browser (localStorage), come le classi della chat docenza; il
// server la riverifica a ogni turno e per chi non è docente vale il default
// dello strumento. "default" non viene mai inviato: il backend applica le sue
// regole (docenza → docente, resto → studente).

export type NotebookContext = 'student' | 'teacher' | 'none';

const STORAGE_KEY = 'cb-notebook-context';

export type NotebookContextChoice = NotebookContext | 'default';

export function readStoredNotebookContext(): NotebookContextChoice {
    if (typeof window === 'undefined') return 'default';
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'student' || raw === 'teacher' || raw === 'none' ? raw : 'default';
}

export function storeNotebookContext(value: NotebookContextChoice): void {
    try {
        if (value === 'default') window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, value);
    } catch { /* storage pieno o non disponibile */ }
}
