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
        case 'embedding_auth_failed': return 'errAuth';
        case 'embedding_quota_exceeded': return 'errQuota';
        case 'embedding_model_unavailable': return 'errModel';
        case 'embedding_request_rejected': return 'errRequest';
        case 'embedding_rate_limited': return 'errRateLimited';
        case 'embedding_provider_error': return 'errProvider';
        case 'embedding_network': return 'errNetwork';
        case 'embedding_dimensions_mismatch': case 'embedding_invalid_dimensions': return 'errDimensions';
        case 'embedding_input_limit': return 'errInputLimit';
        default: return 'errConfig';
    }
}

export type JobStatus = 'idle' | 'running' | 'done' | 'error' | 'interrupted';
export type JobCollectionStatus = 'pending' | 'running' | 'done' | 'error' | 'interrupted';

export interface ReindexJobCollection {
    id: string;
    label: string;
    status: JobCollectionStatus;
    phase: 'collecting' | 'embedding' | 'saving' | null;
    done: number;
    total: number;
    error: string | null;
}

export interface ReindexJob {
    status: JobStatus;
    started_at?: number;
    finished_at?: number | null;
    current?: string | null;
    collections: ReindexJobCollection[];
}

/** Whole-job percentage: finished collections plus the share of the current one. */
export function jobPercent(job: ReindexJob): number {
    const items = job.collections;
    if (!items.length) return job.status === 'running' ? 0 : 100;
    const units = items.reduce((sum, c) => {
        if (c.status === 'done' || c.status === 'error') return sum + 1;
        if (c.status === 'running' && c.total > 0) return sum + Math.min(1, c.done / c.total) * 0.95;
        return sum;
    }, 0);
    return Math.round((units / items.length) * 100);
}

/** One readable line per collection: waiting, x/y, done, error with reason. */
export function jobCollectionText(c: ReindexJobCollection): { key: DocumentRetrievalKey; values: Record<string, string | number> } {
    switch (c.status) {
        case 'pending': return { key: 'jobPending', values: {} };
        case 'running':
            if (c.phase === 'embedding' && c.total > 0) return { key: 'jobEmbedding', values: { done: c.done, total: c.total } };
            return { key: c.phase === 'saving' ? 'jobSaving' : 'jobCollecting', values: {} };
        case 'done': return { key: c.total > 0 ? 'jobDone' : 'jobUpToDate', values: { total: c.total } };
        case 'error': return { key: 'jobError', values: {} };
        default: return { key: 'jobInterrupted', values: {} };
    }
}

/** Approximate cost with enough precision for cents of a dollar. */
export function formatUsd(value: number): string {
    return value < 0.01 ? `< 0.01 USD` : `${value.toFixed(2)} USD`;
}
