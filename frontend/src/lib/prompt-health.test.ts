import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node runs TypeScript files directly.
import { isPromptConfigKey, messageParams, promptHealthId, promptLabel, topSeverity, visibleSurfaces } from './prompt-health.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { PROMPT_HEALTH_DICTS } from './i18n-prompt-health.ts';

test('only model text keys are checked after a save (same rule as the backend registry)', () => {
    assert.equal(isPromptConfigKey('prompt_meta_QSA'), true);
    assert.equal(isPromptConfigKey('directive_language'), true);
    assert.equal(isPromptConfigKey('site_chat_platform_context'), true);
    assert.equal(isPromptConfigKey('rag_chat_context_custom'), true);
    assert.equal(isPromptConfigKey('prompt_components_QSA_intro'), false);
    assert.equal(isPromptConfigKey('prompt_guidance_QSA_intro'), false);
    assert.equal(isPromptConfigKey('text_qsar_conclusion__en'), false);
    assert.equal(isPromptConfigKey('log_full_prompt'), false);
    assert.equal(isPromptConfigKey('label_guided_questions'), false);
});

test('prompt map entries map to registry ids', () => {
    assert.equal(promptHealthId({ kind: 'config', key: 'prompt_factor__level_compact' }), 'config:prompt_factor');
    assert.equal(promptHealthId({ kind: 'config', key: 'text_guided_conclusion' }), null);
    assert.equal(promptHealthId({ kind: 'guided_step', key: 'guided_step:sl-social:prompt', field: 'prompt', editor: { path: '/admin/guided-steps/sl-social' } }), 'guided_step:sl-social');
    assert.equal(promptHealthId({ kind: 'guided_step', key: 'guided_step:sl-social:label', field: 'label', editor: { path: '/admin/guided-steps/sl-social' } }), null);
    assert.equal(promptHealthId({ kind: 'counselor_persona', key: 'counselor_persona' }), null);
});

test('counter colour follows the most severe finding; long lists are shortened', () => {
    assert.equal(topSeverity({ high: 0, medium: 2, low: 1 }), 'medium');
    assert.equal(topSeverity({ total: 0 }), null);
    assert.deepEqual(visibleSurfaces(['a', 'b', 'c', 'd', 'e']), { shown: ['a', 'b', 'c'], hidden: 2 });
    assert.equal(promptLabel('guided_step:sl-social'), 'sl-social');
    assert.deepEqual(messageParams({ codes: ['C9', 'K1'], stated: 5 }), { codes: 'C9, K1', stated: '5' });
});

test('every finding code has a message and a suggested fix in the six languages', () => {
    const codes = ['rule_conflict', 'unregistered_prompt', 'empty_prompt', 'step_without_prompt', 'unmarked_difference',
        'factory_update_pending', 'rules_unverified', 'unknown_placeholder', 'unknown_factor', 'unknown_step',
        'number_mismatch', 'assembly_failed', 'llm_contradiction'];
    const keys = Object.keys(PROMPT_HEALTH_DICTS.it).sort();
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv'] as const) {
        assert.deepEqual(Object.keys(PROMPT_HEALTH_DICTS[lang]).sort(), keys, lang);
        for (const code of codes) {
            assert.ok(PROMPT_HEALTH_DICTS[lang][`admin.promptHealth.code.${code}`], `${lang} ${code}`);
            assert.ok(PROMPT_HEALTH_DICTS[lang][`admin.promptHealth.fix.${code}`], `${lang} fix ${code}`);
        }
    }
});
