// Taccuino nel contesto della chat guidata: il docente sceglie quale taccuino
// passa al prompt (studente, docente, di prova, nessuno) dal popover Opzioni.
// La scelta vive per browser (localStorage), come le classi della chat
// docenza; il server la riverifica a ogni turno e per chi non è docente vale
// il default dello strumento. "default" non viene mai inviato: il backend
// applica le sue regole (docenza → docente, resto → studente).

export type NotebookContext = 'student' | 'teacher' | 'practice' | 'none';

const STORAGE_KEY = 'cb-notebook-context';
// Taccuino studente di prova scelto (solo con "practice"): un id del docente.
const PRACTICE_STORAGE_KEY = 'cb-practice-notebook-id';

export type NotebookContextChoice = NotebookContext | 'default';

export function readStoredNotebookContext(): NotebookContextChoice {
    if (typeof window === 'undefined') return 'default';
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'student' || raw === 'teacher' || raw === 'practice' || raw === 'none' ? raw : 'default';
}

export function storeNotebookContext(value: NotebookContextChoice): void {
    try {
        if (value === 'default') window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, value);
    } catch { /* storage pieno o non disponibile */ }
}

export function readStoredPracticeNotebookId(): number | null {
    if (typeof window === 'undefined') return null;
    try {
        const id = Number(window.localStorage.getItem(PRACTICE_STORAGE_KEY));
        return Number.isInteger(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
}

export function storePracticeNotebookId(id: number | null): void {
    try {
        if (id === null) window.localStorage.removeItem(PRACTICE_STORAGE_KEY);
        else window.localStorage.setItem(PRACTICE_STORAGE_KEY, String(id));
    } catch { /* storage pieno o non disponibile */ }
}

// Campi da inviare al server per il turno: solo per i docenti e mai
// "default"; l'id del taccuino di prova viaggia solo con "practice".
export function notebookContextPayload(isTeacher: boolean, choice: NotebookContextChoice, practiceId: number | null): {
    notebook_context?: NotebookContext;
    practice_notebook_id?: number;
} {
    if (!isTeacher || choice === 'default') return {};
    if (choice === 'practice') return practiceId ? { notebook_context: 'practice', practice_notebook_id: practiceId } : { notebook_context: 'practice' };
    return { notebook_context: choice };
}
