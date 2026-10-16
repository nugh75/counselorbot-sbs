import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node direct typescript execution requires extension
import { collectionStatus, errorText, formatUsd, STATUS_TEXT } from './document-retrieval.ts';
// @ts-expect-error -- Node direct typescript execution requires extension
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
