// Selezione del counselor lato utente: persistita in localStorage e iniettata
// come `counselor_id` nelle richieste di chat dei questionari guidati.

export interface PublicCounselor {
    id: number;
    slug: string;
    name: string;
    description?: string | null;
    avatar?: string | null;
    questionnaire_types?: string[] | null;
    language: string[];
    is_active?: boolean;
    show_in_assistant?: boolean;
    assistant_audience?: string | null;
    model_origin?: 'local' | 'external' | null;
}

const KEY = 'counselorbot_selected_counselor';
const COUNSELOR_EVENT = 'counselorbot-counselor-change';

export function getSelectedCounselorId(): number | null {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(KEY);
    return v ? Number(v) : null;
}

export function setSelectedCounselorId(id: number | null): void {
    if (typeof window === 'undefined') return;
    if (id == null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(id));
    window.dispatchEvent(new Event(COUNSELOR_EVENT));
}

// Sottoscrizione per useSyncExternalStore: notifica quando il counselor
// selezionato cambia, anche da un'altra parte della UI (header / selettore).
export function subscribeToCounselor(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', onChange);
    window.addEventListener(COUNSELOR_EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(COUNSELOR_EVENT, onChange);
    };
}

export async function fetchCounselors(lang?: string, languageFilter?: string): Promise<PublicCounselor[]> {
    try {
        const params = new URLSearchParams();
        if (lang) params.set('lang', lang);
        if (languageFilter) params.set('language', languageFilter);
        const qs = params.toString();
        const url = qs ? `/api/counselors?${qs}` : '/api/counselors';
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}
