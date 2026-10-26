import assert from 'node:assert/strict';
import test from 'node:test';

import type { PreviewResult, StepSkillEntry } from './skill-wizard';
// @ts-expect-error -- Node runs TypeScript files directly.
import { applyBindingChoice, bindingChoice, conditionsToForm, formToConditions, previewOutcome, slugify } from './skill-wizard.js';
// @ts-expect-error -- Node runs TypeScript files directly.
import { SKILLS_DICTS } from './i18n-skills.js';

function row(overrides: Partial<StepSkillEntry>): StepSkillEntry {
    return { questionnaire_type: 'QSA', step_id: '*', skill_id: 1, sort_order: 0, enabled: true, override_params: null, ...overrides };
}

test('slug comes from the name, without accents or spaces', () => {
    assert.equal(slugify('Consigli sull’Ansia da esame!'), 'consigli-sull-ansia-da-esame');
    assert.equal(slugify('  Città  '), 'citta');
});

test('conditions round-trip between JSON and the form', () => {
    const form = conditionsToForm({ intents: ['advice'], requires_scores: true, languages: ['it'] });
    assert.deepEqual(form.intents, ['advice']);
    assert.equal(form.requiresScores, true);
    assert.deepEqual(JSON.parse(form.extra), { languages: ['it'] });
    assert.deepEqual(formToConditions(form), { languages: ['it'], intents: ['advice'], requires_scores: true });
    assert.deepEqual(formToConditions({ intents: [], requiresScores: false, extra: '' }), {});
    assert.equal(formToConditions({ intents: [], requiresScores: false, extra: '[1]' }), null);
    assert.equal(formToConditions({ intents: [], requiresScores: false, extra: '{oops' }), null);
});

test('binding choice reads like the runtime: only enabled rows count', () => {
    assert.deepEqual(bindingChoice([row({})], 1), { mode: 'all', steps: [] });
    assert.deepEqual(bindingChoice([row({ enabled: false }), row({ step_id: 'qsa-1' })], 1), { mode: 'steps', steps: ['qsa-1'] });
    assert.deepEqual(bindingChoice([row({ enabled: false }), row({ skill_id: 2 })], 1), { mode: 'off', steps: [] });
});

test('applying a choice keeps other skills and switches the wildcard off instead of deleting it', () => {
    const entries = [row({}), row({ skill_id: 2, step_id: 'qsa-2' })];
    const steps = applyBindingChoice(entries, 1, 'QSA', { mode: 'steps', steps: ['qsa-1', 'qsa-1'] });
    assert.deepEqual(steps.filter(e => e.skill_id === 2), [entries[1]]);
    assert.deepEqual(steps.filter(e => e.skill_id === 1).map(e => [e.step_id, e.enabled]), [['*', false], ['qsa-1', true]]);
    assert.deepEqual(bindingChoice(steps, 1), { mode: 'steps', steps: ['qsa-1'] });

    const off = applyBindingChoice(steps, 1, 'QSA', { mode: 'off', steps: [] });
    assert.deepEqual(off.filter(e => e.skill_id === 1).map(e => [e.step_id, e.enabled]), [['*', false]]);

    const all = applyBindingChoice([], 7, 'IDEA', { mode: 'all', steps: [] }, 30);
    assert.deepEqual(all, [{ questionnaire_type: 'IDEA', step_id: '*', skill_id: 7, sort_order: 30, enabled: true, override_params: null }]);
});

test('preview outcome says whether the skill entered, reached the prompt or why not', () => {
    const base: PreviewResult = { engine_enabled: true, intent: 'advice', blocks: {}, trace: [], delivery: [] };
    assert.deepEqual(previewOutcome({ ...base, delivery: [{ slug: 'x', slot: 'directive_tail', chars: 10, in_prompt: true }] }, 'x'),
        { entered: true, delivered: true, reason: '' });
    assert.deepEqual(previewOutcome({ ...base, delivery: [{ slug: 'x', slot: 'knowledge', chars: 10, in_prompt: false }] }, 'x'),
        { entered: true, delivered: false, reason: '' });
    assert.deepEqual(previewOutcome({ ...base, trace: [{ slug: 'x', skipped: 'intenzione non ammessa' }] }, 'x'),
        { entered: false, delivered: false, reason: 'intenzione non ammessa' });
    assert.deepEqual(previewOutcome(base, 'x'), { entered: false, delivered: false, reason: '' });
});

test('skills panel strings exist in all six languages', () => {
    const keys = Object.keys(SKILLS_DICTS.it);
    assert.ok(keys.length > 60);
    for (const lang of ['en', 'es', 'fr', 'de', 'sv'] as const) {
        assert.deepEqual(Object.keys(SKILLS_DICTS[lang]).sort(), [...keys].sort(), lang);
    }
});
