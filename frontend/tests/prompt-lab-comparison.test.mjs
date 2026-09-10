import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCandidate } from '../src/components/admin/prompt-lab-comparison.ts';

const metric = (variant_id, passed, extra = {}) => ({ variant_id, passed, total: 4, errors: 0, preset_id: 1, language: 'it', split: 'final', ...extra });
test('keeps opposing model/language results separate instead of averaging them', () => {
    const report = compareCandidate([
        metric('baseline', 1), metric('c1', 3),
        metric('baseline', 4, { language: 'en' }), metric('c1', 1, { language: 'en' }),
        metric('baseline', 2, { preset_id: 2 }), metric('c1', 2, { preset_id: 2 }),
        metric('c2', 4),
    ], 'c1');
    assert.deepEqual(report.pairs.map((p) => p.direction), ['pro', 'con', 'neutral']);
    assert.equal(report.incomplete, false);
});
test('missing, unequal or errored samples cannot be reported as benefits', () => {
    for (const rows of [[], [metric('c1', 4)], [metric('baseline', 1), metric('c1', 4, { total: 5 })]]) {
        const report = compareCandidate(rows, 'c1');
        assert.equal(report.incomplete, true);
        assert.equal(report.pairs.length, 0);
    }
    assert.equal(compareCandidate([metric('baseline', 1), metric('c1', 4, { errors: 1 })], 'c1').pairs[0].direction, 'incomplete');
    assert.equal(compareCandidate([metric('baseline', 1), metric('c1', 4, { split: 'development' })], 'c1').pairs.length, 0);
});
