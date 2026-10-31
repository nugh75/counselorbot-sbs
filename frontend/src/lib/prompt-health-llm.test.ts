import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node runs TypeScript files directly.
import { canPropose, cellStatus, estimateCost, mergeFindings } from './prompt-health.ts';

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
