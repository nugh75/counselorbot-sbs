import { apiFetch } from './auth.ts';
// Selezione del counselor lato utente: persistita in localStorage e iniettata
// come `counselor_id` nelle richieste di chat dei questionari guidati.

export interface PublicCounselor {
    id: number;
    slug: string;
    name: string;
    description?: string | null;
    tagline?: string | null;
    tagline_i18n?: Record<string, string> | null;
    approach_categories?: string[] | null;
    avatar_url?: string | null;
    approach_summary?: string | null;
    voice_mapping?: Record<string, string> | null;
    avatar?: string | null;
    questionnaire_types?: string[] | null;
    language: string[];
    is_active?: boolean;
    is_personal?: boolean;
    show_in_assistant?: boolean;
    assistant_audience?: string | null;
    model_origin?: 'local' | 'external' | null;
    model?: string | null;
    // Adatto allo strumento chiesto. I non adatti arrivano lo stesso: servono
    // a dire perche' quello scelto non va e quali si possono usare.
    suitable?: boolean;
    // Il modello puo' ragionare: falso solo per le famiglie note come
    // non-reasoning.
    reasoning_capable?: boolean;
}

export interface CounselorRecommendationRequest {
    query: string;
    language?: string;
    questionnaire_type?: string;
    audience?: string;
}

export interface CounselorRecommendationResponse {
    counselor?: PublicCounselor | null;
    confidence: number;
    explanation: string;
    matched_categories: string[];
    match_reasons: string[];
    alternatives: PublicCounselor[];
}

const KEY = 'counselorbot_selected_counselor';
const COUNSELOR_EVENT = 'counselorbot-counselor-change';

// The header shows the active conversation's counselor while account defaults
// can change independently (including in another browser tab).
let activeSessionCounselorId: number | null = null;

export function getDisplayedCounselorId(): number | null {
    return activeSessionCounselorId ?? getSelectedCounselorId();
}

export function setActiveSessionCounselorId(id: number | null): void {
    activeSessionCounselorId = id;
    window.dispatchEvent(new Event(COUNSELOR_EVENT));
}

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

export async function fetchCounselors(
    lang?: string,
    languageFilter?: string,
    questionnaireType?: string,
): Promise<PublicCounselor[]> {
    try {
        const params = new URLSearchParams();
        if (lang) params.set('lang', lang);
        if (languageFilter) params.set('language', languageFilter);
        if (questionnaireType) params.set('questionnaire_type', questionnaireType);
        const qs = params.toString();
        const url = qs ? `/api/counselors?${qs}` : '/api/counselors';
        const res = await apiFetch(url, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/**
 * Risolve la frase distintiva (tagline) del counselor localizzata per la lingua richiesta
 * con fallback ordinato sulle altre lingue, su approach_summary o description.
 */
export function getCounselorTagline(counselor: PublicCounselor, lang?: string): string {
    if (counselor.tagline_i18n) {
        if (lang && counselor.tagline_i18n[lang]) {
            return counselor.tagline_i18n[lang];
        }
        const fallbacks = ['it', 'en', 'es', 'fr', 'de', 'sv', 'pt'];
        for (const fb of fallbacks) {
            if (counselor.tagline_i18n[fb]) return counselor.tagline_i18n[fb];
        }
        const values = Object.values(counselor.tagline_i18n);
        if (values.length > 0 && typeof values[0] === 'string') return values[0];
    }
    if (counselor.tagline) {
        return counselor.tagline;
    }
    return counselor.approach_summary || counselor.description || '';
}

/**
 * Recupera l'elenco di tutte le categorie di approccio censite dal backend.
 * In caso di errore di rete o backend non raggiungibile, fa fallback sulle categorie base.
 */
export async function fetchCounselorCategories(): Promise<string[]> {
    try {
        const res = await apiFetch('/api/counselors/categories', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) return data;
        }
    } catch {
        // Ignora e usa fallback
    }
    return ['filosofo', 'psicologo', 'docente', 'orientatore', 'tutor'];
}

/**
 * Interroga il motore semantico di raccomandazione per query libera sullo stile o approccio cercato.
 */
export async function recommendCounselor(
    req: CounselorRecommendationRequest
): Promise<CounselorRecommendationResponse | null> {
    try {
        const res = await apiFetch('/api/counselors/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) return null;
        return (await res.json()) as CounselorRecommendationResponse;
    } catch {
        return null;
    }
}
