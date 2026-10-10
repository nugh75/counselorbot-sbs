import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { AVAILABLE_STEP_KINDS, STEP_KINDS, isLegacyQuestionnaireTool, isPersonalTool, isStandaloneGuidedChat } from './path-step-kinds.ts';

const row = (key: string, kind: 'instrument' | 'personal', category: string) => ({ key, kind, category });

test('the tool menu keeps personal and support tools only', () => {
    const tools = [row('tavolo', 'personal', 'personal'), row('bussola', 'personal', 'support'), row('forum', 'personal', 'forum'),
        row('notebook', 'personal', 'always_on'), row('QSA', 'instrument', 'guided'), row('SAVICKAS', 'instrument', 'guided')];
    assert.deepEqual(tools.filter(isPersonalTool).map(tool => tool.key), ['tavolo', 'bussola']);
    assert.deepEqual(tools.filter(isStandaloneGuidedChat).map(tool => tool.key), ['SAVICKAS']);
});

test('six step kinds, meetings not yet available, older questionnaire tools recognised', () => {
    assert.equal(STEP_KINDS.length, 6);
    assert.ok(!AVAILABLE_STEP_KINDS.includes('meeting'));
    assert.equal(isLegacyQuestionnaireTool({ tool_key: 'QSA' }), true);
    assert.equal(isLegacyQuestionnaireTool({ step_type: 'questionnaire_administration', tool_key: 'QSA' }), false);
    assert.equal(isLegacyQuestionnaireTool({ step_type: 'tool', tool_key: 'SAVICKAS' }), false);
});
