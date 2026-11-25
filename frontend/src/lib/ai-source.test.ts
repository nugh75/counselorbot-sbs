import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { aiSourceView, isAISource } from './ai-source.ts';

const base = { owner_label: null, connection: 'api', model: 'm-1', fallback: false, fallback_reason: null, viewer_role: 'student' } as const;

// #1022: each source shows its role badge, provider logo and a two-line tooltip.
test('the four sources render the right icons and two-line tooltip', () => {
    const cases = [
        [{ ...base, source: 'system', owner_role: 'admin', provider: 'anthropic' }, 'admin', 'anthropic', 'Gestito da: la piattaforma', 'Anthropic API · m-1'],
        [{ ...base, source: 'own_api', owner_role: 'student', provider: 'mistral' }, 'student', 'generic', 'Gestito da: te', 'Mistral API · m-1'],
        [{ ...base, source: 'teacher_api', owner_role: 'teacher', owner_label: 'Prof. Rossi', provider: 'openai' }, 'teacher', 'openai', 'Gestito da: il tuo docente (Prof. Rossi)', 'OpenAI API · m-1'],
        [{ ...base, source: 'chatgpt', owner_role: 'student', provider: 'openai', connection: 'subscription' }, 'student', 'openai', 'Gestito da: te', 'ChatGPT (abbonamento) · m-1'],
    ] as const;
    for (const [source, badge, logo, managed, detail] of cases) {
        const view = aiSourceView(source, 'it');
        assert.equal(view.badge, badge);
        assert.equal(view.logo, logo);
        assert.equal(view.managed, managed);
        assert.equal(view.detail, detail);
        assert.equal(view.warning, null);
        assert.ok(view.aria.includes(managed) && view.aria.includes(detail));
    }
});

test('the fallback warns in the tooltip and in the accessible name', () => {
    const view = aiSourceView({ ...base, source: 'system', owner_role: 'admin', provider: 'openai', fallback: true, fallback_reason: 'disabled' }, 'it');
    assert.equal(view.warning, 'La tua chiave non risponde: stai usando la chiave di sistema');
    assert.ok(view.aria.endsWith(view.warning));
});

test('the manage link follows the viewer role and every language is filled', () => {
    const source = { ...base, source: 'system', owner_role: 'admin', provider: 'openai' } as const;
    assert.equal(aiSourceView(source, 'it').manageHref, '/profilo/api-personali');
    assert.equal(aiSourceView({ ...source, viewer_role: 'teacher' }, 'it').manageHref, '/docente/api-personali');
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv'] as const) {
        const view = aiSourceView({ ...source, fallback: true }, lang);
        assert.ok(view.title && view.manage && view.warning && view.managed && view.detail, lang);
    }
});

test('isAISource rejects unexpected payloads safely', () => {
    assert.equal(isAISource(null), false);
    assert.equal(isAISource([]), false);
    assert.equal(isAISource({}), false);
    assert.equal(isAISource({ source: 'unknown', owner_role: 'admin' }), false);
    assert.equal(isAISource({ source: 'system', owner_role: 'unknown' }), false);
    assert.equal(isAISource({ ...base, source: 'system', owner_role: 'admin', provider: 'openai' }), true);
});
