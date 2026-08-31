import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { ACTIVE_QUESTIONNAIRE_IDS, TOOL_CATEGORIES, isStartableQuestionnaireId } from './tool-catalog.ts';

test('every active questionnaire appears in exactly one home category', () => {
    const categorized = TOOL_CATEGORIES.flatMap((group) => group.questionnaireIds);
    assert.deepEqual([...categorized].sort(), [...ACTIVE_QUESTIONNAIRE_IDS].sort());
    assert.equal(new Set(categorized).size, categorized.length);
});

test('pQBL is part of the shared standalone catalog', () => {
    assert.equal(TOOL_CATEGORIES.some((group) => group.standaloneIds.includes('pqbl')), true);
});

test('deep-link validation uses the shared active catalog', () => {
    assert.equal(isStartableQuestionnaireId('QSA'), true);
    assert.equal(isStartableQuestionnaireId('UNKNOWN'), false);
});
