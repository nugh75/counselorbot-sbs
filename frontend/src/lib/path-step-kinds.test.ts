import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { TEMPLATE_STEP_KINDS, STEP_KINDS, guidedChatKeys, isLegacyQuestionnaireTool, isPersonalTool, isStandaloneGuidedChat } from './path-step-kinds.ts';

const row = (key: string, kind: 'instrument' | 'personal', category: string) => ({ key, kind, category });

test('the tool menu keeps personal and support tools only', () => {
    const tools = [row('tavolo', 'personal', 'personal'), row('bussola', 'personal', 'support'), row('forum', 'personal', 'forum'),
        row('notebook', 'personal', 'always_on'), row('QSA', 'instrument', 'guided'), row('SAVICKAS', 'instrument', 'guided')];
    assert.deepEqual(tools.filter(isPersonalTool).map(tool => tool.key), ['tavolo', 'bussola']);
    assert.deepEqual(tools.filter(isStandaloneGuidedChat).map(tool => tool.key), ['SAVICKAS']);
});

test('six step kinds, meetings not yet in templates, older questionnaire tools recognised', () => {
    assert.equal(STEP_KINDS.length, 6);
    assert.ok(!TEMPLATE_STEP_KINDS.includes('meeting'));
    assert.equal(isLegacyQuestionnaireTool({ tool_key: 'QSA' }), true);
    assert.equal(isLegacyQuestionnaireTool({ step_type: 'questionnaire_administration', tool_key: 'QSA' }), false);
    assert.equal(isLegacyQuestionnaireTool({ step_type: 'tool', tool_key: 'SAVICKAS' }), false);
});

test('guided paths: enabled catalog rows plus built-in ones without a row', () => {
    const tools = [{ ...row('SAVICKAS', 'instrument', 'guided'), enabled: false }, { ...row('QSA', 'instrument', 'guided'), enabled: true },
        { ...row('tavolo', 'personal', 'personal'), enabled: true }];
    assert.deepEqual(guidedChatKeys(tools), ['EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'IDEA']);
    assert.deepEqual(guidedChatKeys([]).length, 5);
});
