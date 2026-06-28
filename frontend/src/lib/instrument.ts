// Strumento (questionario/intervista) selezionato lato utente: persistito in
// localStorage e mostrato come badge nell'header durante il percorso. Stesso
// pattern del counselor (get/set/subscribe per useSyncExternalStore).

const KEY = 'counselorbot_selected_instrument';
const INSTRUMENT_EVENT = 'counselorbot-instrument-change';

export function getSelectedInstrumentId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(KEY);
}

export function setSelectedInstrumentId(id: string | null): void {
    if (typeof window === 'undefined') return;
    if (!id) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, id);
    window.dispatchEvent(new Event(INSTRUMENT_EVENT));
}

export function subscribeToInstrument(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', onChange);
    window.addEventListener(INSTRUMENT_EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(INSTRUMENT_EVENT, onChange);
    };
}
