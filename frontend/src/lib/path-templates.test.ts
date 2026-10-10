import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { moveTemplateStep, newTemplateStep, parsePathTemplateList, templateStepPayload, templateStepsValid } from './path-templates.ts';

const questionnaire = { ...newTemplateStep('questionnaire_administration'), id: 1 };
const chat = { ...newTemplateStep('guided_results_chat'), results_position: 1 };
const tool = { ...newTemplateStep('tool'), tool_key: 'tavolo' };

test('moving steps keeps each results chat on its questionnaire', () => {
    const moved = moveTemplateStep([questionnaire, chat, tool], 2, 0);
    assert.deepEqual(moved.map(step => step.step_type), ['tool', 'questionnaire_administration', 'guided_results_chat']);
    assert.equal(moved[2].results_position, 2);
    const removed = moveTemplateStep([tool, questionnaire, { ...chat, results_position: 2 }], 0, null);
    assert.equal(removed[1].results_position, 1);
});

test('a results chat needs an earlier questionnaire and an activity needs a goal', () => {
    assert.equal(templateStepsValid([questionnaire, chat]), true);
    assert.equal(templateStepsValid([chat, questionnaire]), false);
    assert.equal(templateStepsValid([newTemplateStep('assignment')]), false);
    assert.equal(templateStepsValid([{ ...newTemplateStep('forum'), topic_title: 'T', topic_body: ' ' }]), false);
});

test('payloads carry only the fields of their step type', () => {
    assert.deepEqual(templateStepPayload(tool), { step_type: 'tool', title: null, instructions: null, tool_key: 'tavolo' });
    assert.deepEqual(Object.keys(templateStepPayload(questionnaire)).sort(),
        ['id', 'instructions', 'instrument_code', 'locale', 'plan_title', 'step_type', 'title']);
});

test('template lists must carry both sections', () => {
    assert.throws(() => parsePathTemplateList({ mine: [] }));
    assert.deepEqual(parsePathTemplateList({ mine: [], shared: [] }), { mine: [], shared: [] });
});
