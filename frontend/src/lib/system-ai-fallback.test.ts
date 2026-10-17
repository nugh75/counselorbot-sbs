import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Lang } from './i18n';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { systemAIText } from './i18n-system-ai.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { formatProbeDetail, formatSystemAIError, systemAIRoleLabel, type SystemAIProbeResult } from './system-ai-fallback.ts';

const LANGUAGES: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];

test('systemAIText returns localized non-empty string for all languages', () => {
    for (const lang of LANGUAGES) {
        assert.ok(systemAIText(lang, 'title').length > 0);
        assert.ok(systemAIText(lang, 'orderHelp').includes('1)'));
        assert.ok(systemAIText(lang, 'noFallbackWarning').length > 0);
        assert.ok(systemAIText(lang, 'testButton').length > 0);
    }
    assert.equal(
        systemAIText('it', 'noFallbackWarning'),
        "Nessuna riserva di sistema configurata: gli utenti senza ChatGPT o chiave personale non possono chattare.",
    );
});

test('formatSystemAIError maps readable error codes in all languages', () => {
    const codes = [
        'auth',
        'model_not_found',
        'quota',
        'network',
        'timeout',
        'rate_limit',
        'invalid_request',
        'not_configured',
        'unknown',
    ];
    for (const lang of LANGUAGES) {
        for (const code of codes) {
            const translated = formatSystemAIError(lang, code);
            assert.ok(translated.length > 0, `Missing translation for ${code} in ${lang}`);
        }
    }
    assert.equal(formatSystemAIError('it', 'auth'), 'Autenticazione non valida o chiave mancante');
    assert.equal(formatSystemAIError('it', 'model_not_found'), 'Modello inesistente o non disponibile');
    assert.equal(formatSystemAIError('it', 'quota'), 'Quota esaurita o credito insufficiente');
    assert.equal(formatSystemAIError('it', 'network'), 'Errore di rete o provider non raggiungibile');
    assert.equal(formatSystemAIError('it', 'timeout'), 'Tempo limite scaduto');
});

test('systemAIRoleLabel formats primary and numbered fallbacks', () => {
    assert.equal(systemAIRoleLabel('it', 'primary'), 'Riserva principale');
    assert.equal(systemAIRoleLabel('it', 'fallback', 1), 'Ripiego 1');
    assert.equal(systemAIRoleLabel('it', 'fallback', 2), 'Ripiego 2');
    assert.equal(systemAIRoleLabel('en', 'primary'), 'Primary fallback');
    assert.equal(systemAIRoleLabel('en', 'fallback', 1), 'Fallback 1');
});

test('formatProbeDetail formats success and failure outputs without secrets', () => {
    const successProbe: SystemAIProbeResult = {
        role: 'primary',
        provider: 'mistral',
        model: 'mistral-small-latest',
        effective_model: 'mistral-small-latest',
        ok: true,
        elapsed_ms: 125,
    };
    assert.equal(formatProbeDetail('it', successProbe), '125 ms');

    const aliasedProbe: SystemAIProbeResult = {
        role: 'fallback',
        provider: 'openrouter',
        model: 'openrouter/free',
        effective_model: 'meta-llama/llama-3-8b',
        ok: true,
        elapsed_ms: 240,
    };
    assert.equal(formatProbeDetail('it', aliasedProbe), 'modello effettivo: meta-llama/llama-3-8b · 240 ms');

    const failedProbe: SystemAIProbeResult = {
        role: 'primary',
        provider: 'openai',
        model: 'gpt-4o',
        ok: false,
        error_code: 'auth',
        elapsed_ms: 10,
    };
    assert.equal(formatProbeDetail('it', failedProbe), 'Autenticazione non valida o chiave mancante');
});
