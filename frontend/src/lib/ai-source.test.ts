import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { aiSourceView } from './ai-source.ts';

const base = { owner_label: null, connection: 'api', model: 'm-1', fallback: false, fallback_reason: null, viewer_role: 'student' } as const;

// #1020: each source shows its role badge, provider logo and tooltip owner.
test('the four sources render the right icons and tooltip', () => {
    const cases = [
        [{ ...base, source: 'system', owner_role: 'admin', provider: 'anthropic' }, 'admin', 'anthropic', 'Chiave di sistema', 'L’istituzione'],
        [{ ...base, source: 'own_api', owner_role: 'student', provider: 'mistral' }, 'student', 'generic', 'La tua chiave', 'Tu'],
        [{ ...base, source: 'teacher_api', owner_role: 'teacher', owner_label: 'Prof. Rossi', provider: 'gemini' }, 'teacher', 'gemini', 'Chiave del docente · Prof. Rossi', 'Il docente'],
        [{ ...base, source: 'chatgpt', owner_role: 'student', provider: 'openai', connection: 'subscription' }, 'student', 'openai', 'Il tuo abbonamento ChatGPT', 'Il tuo abbonamento'],
    ] as const;
    for (const [source, badge, logo, owner, pays] of cases) {
        const view = aiSourceView(source, 'it');
        assert.equal(view.badge, badge);
        assert.equal(view.logo, logo);
        assert.equal(view.owner, owner);
        assert.equal(view.warning, null);
        assert.deepEqual(view.rows.at(-1), ['Chi paga', pays]);
        assert.ok(view.aria.includes(owner) && view.aria.includes('m-1'));
    }
    const chatgpt = aiSourceView(cases[3][0], 'it');
    assert.deepEqual(chatgpt.rows[1], ['Collegamento', 'abbonamento']);
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
        assert.ok(view.title && view.manage && view.warning && view.rows.every(([label, value]) => label && value), lang);
    }
});
