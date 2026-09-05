// Catalogo delle raccomandazioni di una sessione: letture/film e strategie
// certificate. Il modulo resta senza import (lo esegue anche il runner TS di
// Node nei test): la chiamata di rete vive nel pannello, qui c'e' solo la forma
// dei dati e cio' che si puo' verificare da solo.

export type RecommendationType = 'reading' | 'strategy';

// Lo stato e' scelto dallo studente, non dal modello: "proposta" e' il punto di
// partenza, "archiviata" non cancella nulla e resta recuperabile.
export type RecommendationStatus = 'proposed' | 'selected' | 'tried' | 'dismissed';

const STATUSES: RecommendationStatus[] = ['proposed', 'selected', 'tried', 'dismissed'];

interface RecommendationBase {
    slug: string;
    turn_index?: number | null;
    status?: RecommendationStatus;
    helpful?: boolean | null;
    // Perche' la voce e' entrata in questo turno: temi del catalogo, codici
    // fattore o `scope:STRUMENTO`. Sono marcatori tecnici e non si mostrano
    // come sono; vedi `provenanceKind`.
    matched_on?: string[];
    themes?: string[];
}

export interface ReadingRecommendation extends RecommendationBase {
    recommendation_type?: 'reading';
    title?: string;
    creators?: string;
    year?: string;
    publisher?: string;
    kind?: string;
    kind_label?: string;
    summary?: string;
    why?: string;
    synopsis?: string;
    languages?: string[];
    where?: string;
    audience?: string[];
    warning?: string;
}

export interface StrategyRecommendation extends RecommendationBase {
    recommendation_type?: 'strategy';
    name?: string;
    description?: string;
    recommended_when?: string;
}

export interface RecommendationCatalog {
    reading: ReadingRecommendation[];
    strategy: StrategyRecommendation[];
}

export interface RecommendationPatch {
    status?: RecommendationStatus;
    helpful?: boolean | null;
}

export const EMPTY_RECOMMENDATIONS: RecommendationCatalog = {
    reading: [],
    strategy: [],
};

function normalizeStatus(value: unknown): RecommendationStatus {
    return STATUSES.includes(value as RecommendationStatus)
        ? value as RecommendationStatus
        : 'proposed';
}

function normalizeHelpful(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function normalizeBucket<T extends { slug: string }>(value: unknown): T[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const slug = typeof Reflect.get(item, 'slug') === 'string'
            ? Reflect.get(item, 'slug').trim()
            : '';
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        // Gli altri campi passano com'erano: `turn_index` e `matched_on`
        // servono al pannello e non vanno persi in questo giro.
        result.push({
            ...item,
            slug,
            status: normalizeStatus(Reflect.get(item, 'status')),
            helpful: normalizeHelpful(Reflect.get(item, 'helpful')),
        } as T);
    }
    return result;
}

export function normalizeRecommendationCatalog(value: unknown): RecommendationCatalog {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { reading: [], strategy: [] };
    }
    return {
        reading: normalizeBucket<ReadingRecommendation>(Reflect.get(value, 'reading')),
        strategy: normalizeBucket<StrategyRecommendation>(Reflect.get(value, 'strategy')),
    };
}

export function recommendationPatchUrl(
    sessionId: string,
    type: RecommendationType,
    slug: string,
): string {
    return `/api/session/${encodeURIComponent(sessionId)}/recommendations/${type}/${encodeURIComponent(slug)}`;
}

// --- Provenienza -----------------------------------------------------------
// `matched_on` dice da dove viene una proposta, ma lo dice in codice: temi del
// catalogo (`ansia-e-prestazione`), codici fattore (`C2`), oppure lo strumento
// (`scope:QSA`). Allo studente si dice il tipo di aggancio, non il marcatore.

export type ProvenanceKind = 'themes' | 'scores' | 'scope' | null;

const SCORE_CODE = /^[A-Z]{1,3}\d{1,2}$/;

export function provenanceKind(item: { matched_on?: unknown }): ProvenanceKind {
    const entries = Array.isArray(item.matched_on)
        ? item.matched_on.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
        : [];
    if (!entries.length) return null;
    if (entries.some((entry) => !entry.startsWith('scope:') && !SCORE_CODE.test(entry))) return 'themes';
    if (entries.some((entry) => SCORE_CODE.test(entry))) return 'scores';
    return 'scope';
}

// --- Link ------------------------------------------------------------------
// "Dove trovarlo" e' prosa scritta a mano: a volte contiene un indirizzo, a
// volte solo il nome di una biblioteca. Diventa cliccabile solo cio' che e'
// davvero http(s); tutto il resto resta testo.

export interface TextSegment {
    text: string;
    href?: string;
}

const URL_IN_TEXT = /https?:\/\/\S+/gi;
const TRAILING_PUNCTUATION = '.,;:!?«»"’\'';

// La punteggiatura finale appartiene alla frase, non all'indirizzo. Le parentesi
// si tolgono solo se non erano state aperte dentro l'indirizzo, altrimenti si
// spezzano le URL di Wikipedia.
function trimTrailing(candidate: string): string {
    let end = candidate.length;
    while (end > 0) {
        const char = candidate[end - 1];
        if (TRAILING_PUNCTUATION.includes(char)) {
            end -= 1;
            continue;
        }
        const opening = char === ')' ? '(' : char === ']' ? '[' : '';
        if (opening && !candidate.slice(0, end - 1).includes(opening)) {
            end -= 1;
            continue;
        }
        break;
    }
    return candidate.slice(0, end);
}

export function safeHttpUrl(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const candidate = trimTrailing(raw.trim());
    if (!candidate) return null;
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return null;
    }
    // `javascript:`, `data:` e i loro parenti non diventano mai un href.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.toString();
}

// Spezza la prosa in pezzi da rendere: `href` presente solo dove l'indirizzo e'
// sicuro. La somma dei `text` ridà la stringa di partenza: non si perde nulla.
export function linkedSegments(value: unknown): TextSegment[] {
    if (typeof value !== 'string' || !value.trim()) return [];
    const segments: TextSegment[] = [];
    let last = 0;
    for (const match of value.matchAll(URL_IN_TEXT)) {
        const start = match.index ?? 0;
        const token = trimTrailing(match[0]);
        const href = safeHttpUrl(token);
        if (start > last) segments.push({ text: value.slice(last, start) });
        if (href) {
            segments.push({ text: token, href });
            last = start + token.length;
        } else {
            segments.push({ text: match[0] });
            last = start + match[0].length;
        }
    }
    if (last < value.length) segments.push({ text: value.slice(last) });
    return segments;
}
