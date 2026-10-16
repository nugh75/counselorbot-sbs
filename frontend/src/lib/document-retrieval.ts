import type { DocumentRetrievalKey } from './i18n-document-retrieval';

export type RetrievalProvider = 'ollama' | 'mistral' | 'openrouter' | 'none';
export type RetrievalMode = 'hybrid' | 'lexical' | 'vector';

export interface RetrievalCollection {
    id: string;
    label: string;
    builtin: boolean;
    api_publishable: boolean;
    vectors_allowed: boolean;
    vectors_match: boolean;
    building: boolean;
    last_build_error: string | null;
    n_chunks: number;
}

export type CollectionStatus = 'building' | 'error' | 'private' | 'lexical' | 'ready' | 'stale';

/** One status per collection, for the configuration saved on the server. */
export function collectionStatus(c: RetrievalCollection, provider: RetrievalProvider, mode: RetrievalMode): CollectionStatus {
    if (c.building) return 'building';
    if (c.last_build_error) return 'error';
    if (provider === 'none' || mode === 'lexical') return 'lexical';
    if (!c.vectors_allowed) return 'private';
    return c.vectors_match ? 'ready' : 'stale';
}

export const STATUS_TEXT: Record<CollectionStatus, DocumentRetrievalKey> = {
    building: 'statusBuilding', error: 'statusError', private: 'statusPrivate',
    lexical: 'statusLexical', ready: 'statusReady', stale: 'statusStale',
};

/** Sanitized backend codes only; anything unknown gets a generic reason. */
export function errorText(code: string | null | undefined): DocumentRetrievalKey {
    switch (code) {
        case 'embedding_missing_key': return 'errMissingKey';
        case 'embedding_disabled': return 'errDisabled';
        case 'embedding_timeout': return 'errTimeout';
        case 'embedding_budget_exceeded': return 'errBudget';
        case 'embedding_price_missing': return 'errPrice';
        case 'embedding_unavailable': return 'errUnavailable';
        default: return 'errConfig';
    }
}

/** Approximate cost with enough precision for cents of a dollar. */
export function formatUsd(value: number): string {
    return value < 0.01 ? `< 0.01 USD` : `${value.toFixed(2)} USD`;
}
