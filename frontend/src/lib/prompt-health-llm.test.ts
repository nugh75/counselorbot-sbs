import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node runs TypeScript files directly.
import { canPropose, cellStatus, estimateCost, findingBrief, hasCodeSource, mergeFindings } from './prompt-health.ts';

// Contradiction found by the model (#763): quotes with positions, surfaces where it happens.
const llm = {
    id: 'b1', code: 'llm_contradiction', severity: 'high' as const,
    prompts: ['code:request', 'guided_step:sl-social'],
    surfaces: ['QSA · sl-social · entry'],
    sentences: [
        { prompt: 'code:request', text: 'Ask three questions.', start: null, end: null },
        { prompt: 'guided_step:sl-social', text: 'Never ask questions.', start: 10, end: 30 },
    ],
    params: { explanation: 'Three questions vs none.', model: 'test/cheap' },
    editable: ['guided_step:sl-social'], factory: [],
};

test('model contradictions colour the steps where they happen', () => {
    const step = { id: 'sl-social', prompts: ['guided_step:sl-social'], surfaces: ['QSA · sl-social · entry'] };
    const other = { id: 'sl-other', prompts: ['guided_step:sl-other'], surfaces: ['QSA · sl-other · entry'] };
    assert.equal(cellStatus(step, [llm]), 'error');
    assert.equal(cellStatus(other, [llm]), 'ok');
});

test('«Proponi correzione» needs a quote in a prompt the owner can edit', () => {
    assert.equal(canPropose(llm), true);
    assert.equal(canPropose({ ...llm, editable: [] }), false);
    assert.equal(canPropose({ ...llm, sentences: [] }), false);
});

test('model findings join the static ones without duplicates', () => {
    const fixed = { ...llm, id: 'a1', code: 'rule_conflict' };
    assert.deepEqual(mergeFindings([fixed], [llm, fixed]).map(f => f.id), ['a1', 'b1']);
});

test('estimate shows the cost only when the model is priced', () => {
    assert.equal(estimateCost(null), null);
    assert.equal(estimateCost(0), '< $0.01');
    assert.equal(estimateCost(0.004), '< $0.01');
    assert.equal(estimateCost(1.234), '$1.23');
});

test('code origin is independent of factory ownership and allows a code-only resolution', () => {
    assert.equal(hasCodeSource(llm), true);
    const promptsOnly = { ...llm, prompts: ['guided_step:sl-social'], sentences: llm.sentences.slice(1), factory: ['guided_step:sl-social'] };
    assert.equal(hasCodeSource(promptsOnly), false);
    const codeOnly = { ...llm, editable: [], prompts: ['code:request'], sentences: llm.sentences.slice(0, 1) };
    assert.equal(hasCodeSource(codeOnly), true);
    assert.equal(canPropose(codeOnly), false);
});

test('coding-agent brief includes exact evidence, turn and real repository references', () => {
    const brief = findingBrief({ ...llm, sources: [
        { id: 'code:turn_contract', kind: 'code', consumer: 'backend.prompt_contract:turn_contract', factory_source: null },
        { id: 'guided_step:sl-social', kind: 'guided_step', consumer: 'backend.chat_preparation:prepare_chat_turn', factory_source: 'prompt_config.QSA_STEPS' },
    ] }, 'Questions disagree');
    for (const evidence of ['Questions disagree', 'b1', 'llm_contradiction', 'Ask three questions.', 'Never ask questions.', 'code:request', 'QSA · sl-social · entry', 'backend.prompt_contract:turn_contract', 'prompt_config.QSA_STEPS']) {
        assert.ok(brief.includes(evidence), evidence);
    }
    assert.ok(!brief.includes('null'));
});
