import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionStatus, errorText, formatUsd, jobCollectionText, jobPercent, STATUS_TEXT } from './document-retrieval.ts';
import { documentRetrievalText } from './i18n-document-retrieval.ts';

const base = { id: 'c', label: 'C', builtin: true, api_publishable: true, vectors_allowed: true,
    vectors_match: true, building: false, last_build_error: null, n_chunks: 3 };

test('collection status follows the saved provider, mode and index', () => {
    assert.equal(collectionStatus(base, 'mistral', 'hybrid'), 'ready');
    assert.equal(collectionStatus({ ...base, vectors_match: false }, 'mistral', 'hybrid'), 'stale');
    assert.equal(collectionStatus({ ...base, vectors_allowed: false }, 'mistral', 'hybrid'), 'private');
    assert.equal(collectionStatus(base, 'none', 'hybrid'), 'lexical');
    assert.equal(collectionStatus(base, 'ollama', 'lexical'), 'lexical');
    assert.equal(collectionStatus({ ...base, building: true, last_build_error: 'x' }, 'ollama', 'hybrid'), 'building');
    assert.equal(collectionStatus({ ...base, last_build_error: 'embedding_timeout' }, 'ollama', 'hybrid'), 'error');
});

test('only sanitized codes are explained, others get a generic reason', () => {
    assert.equal(errorText('embedding_missing_key'), 'errMissingKey');
    assert.equal(errorText('embedding_disabled'), 'errDisabled');
    assert.equal(errorText('Connection refused http://ollama:11434'), 'errConfig');
    assert.equal(errorText(null), 'errConfig');
});

test('every status and message exists in the six languages with placeholders filled', () => {
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv'] as const) {
        for (const key of Object.values(STATUS_TEXT)) assert.ok(documentRetrievalText(lang, key, { reason: 'r' }));
        const text = documentRetrievalText(lang, 'keyHelp', { env: 'API_KEY_MISTRAL' });
        assert.ok(text.includes('API_KEY_MISTRAL') && text.includes('.env') && !text.includes('{env}'));
    }
    assert.equal(documentRetrievalText('it', 'title'), 'Recupero documenti');
    assert.equal(documentRetrievalText('sv', 'title'), 'Dokumentsökning');
});

test('cost formatting never shows a misleading zero for small paid amounts', () => {
    assert.equal(formatUsd(0.0004), '< 0.01 USD');
    assert.equal(formatUsd(0.32), '0.32 USD');
});

const entry = { id: 'a', label: 'A', status: 'pending' as const, phase: null, done: 0, total: 0, error: null };

test('provider errors map to a readable reason each', () => {
    const codes = {
        embedding_auth_failed: 'errAuth', embedding_quota_exceeded: 'errQuota', embedding_model_unavailable: 'errModel',
        embedding_request_rejected: 'errRequest', embedding_rate_limited: 'errRateLimited', embedding_provider_error: 'errProvider',
        embedding_network: 'errNetwork', embedding_dimensions_mismatch: 'errDimensions', embedding_input_limit: 'errInputLimit',
        embedding_input_empty: 'errInputEmpty', embedding_privacy_unavailable: 'errPrivacyRouting',
    };
    for (const [code, key] of Object.entries(codes)) {
        assert.equal(errorText(code), key);
        for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv'] as const) assert.ok(documentRetrievalText(lang, errorText(code)));
    }
});

test('job percentage counts finished collections and the share of the current one', () => {
    assert.equal(jobPercent({ status: 'running', collections: [] }), 0);
    assert.equal(jobPercent({ status: 'running', collections: [
        { ...entry, status: 'done' }, { ...entry, status: 'error' },
        { ...entry, status: 'running', phase: 'embedding', done: 50, total: 100 }, { ...entry },
    ] }), 62);
    assert.equal(jobPercent({ status: 'done', collections: [{ ...entry, status: 'done' }] }), 100);
    assert.equal(jobPercent({ status: 'done', collections: [{ ...entry, status: 'done' }, { ...entry, status: 'skipped' }] }), 100);
});

test('each collection line says waiting, x/y, done or error', () => {
    assert.deepEqual(jobCollectionText(entry), { key: 'jobPending', values: {} });
    assert.equal(jobCollectionText({ ...entry, status: 'running', phase: 'collecting' }).key, 'jobCollecting');
    assert.deepEqual(jobCollectionText({ ...entry, status: 'running', phase: 'embedding', done: 32, total: 7641 }),
        { key: 'jobEmbedding', values: { done: 32, total: 7641 } });
    assert.equal(jobCollectionText({ ...entry, status: 'running', phase: 'saving', done: 9, total: 9 }).key, 'jobSaving');
    assert.equal(jobCollectionText({ ...entry, status: 'done', total: 9 }).key, 'jobDone');
    assert.equal(jobCollectionText({ ...entry, status: 'done' }).key, 'jobUpToDate');
    assert.equal(jobCollectionText({ ...entry, status: 'error', error: 'embedding_rate_limited' }).key, 'jobError');
    assert.equal(jobCollectionText({ ...entry, status: 'interrupted' }).key, 'jobInterrupted');
    assert.equal(jobCollectionText({ ...entry, status: 'skipped', error: 'collection_removed' }).key, 'jobSkipped');
    const line = documentRetrievalText('it', 'jobEmbedding', { done: 32, total: 7641 });
    assert.equal(line, 'in corso: 32/7641 passaggi');
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv'] as const) {
        const text = documentRetrievalText(lang, 'reindexConfirm', { inputs: 3, tokens: '1,000', cost: '< 0.01 USD' });
        assert.ok(text.includes('1,000') && text.includes('< 0.01 USD') && !text.includes('{'));
        assert.ok(!documentRetrievalText(lang, 'jobError', { reason: 'r' }).includes('{reason}'));
    }
});
