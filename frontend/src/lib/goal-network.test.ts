import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { buildForest, compareGoals, descendants, ancestors, wouldCycle, effectiveShares, progress, visibilityDelta, visibleGoals, orderBranches, catalogGoals } from './goal-network.ts';
import type { PersonalGoal, TeacherCatalogEntry } from './goals';

const g = (id: number, parent_ids: number[] = [], values: Partial<PersonalGoal> = {}) =>
    ({ id, title: `G${id}`, status: 'active', priority: 2, review_date: null, shared_group_id: null, parent_ids, links: [], ...values } as PersonalGoal);
// 1 Erasmus → 3 Inglese ← 2 Laurea; 3 → 4 (B2, concluso), 3 → 5
const net = () => [g(1, [], { shared_group_id: 7 }), g(2), g(3, [1, 2]), g(4, [3], { status: 'completed' }), g(5, [3])];

test('descendants, ancestors and cycles follow every parent', () => {
    assert.deepEqual([...descendants(net(), 1)].sort(), [3, 4, 5]);
    assert.deepEqual([...ancestors(net(), 4)].sort(), [1, 2, 3]);
    assert.equal(wouldCycle(net(), 1, 5), true);
    assert.equal(wouldCycle(net(), 1, 1), true);
    assert.equal(wouldCycle(net(), 5, 2), false);
});
test('shares are inherited from any ancestor and progress counts direct children', () => {
    assert.deepEqual([...effectiveShares(net(), 5).keys()], [7]);
    assert.equal(effectiveShares(net(), 5).get(7)?.id, 1);
    assert.equal(effectiveShares(net(), 2).size, 0);
    assert.deepEqual(progress(net(), 3), { done: 1, total: 2 });
});
test('visibility delta reports groups gained and lost by a branch', () => {
    const before = net();
    const detached = before.map(x => x.id === 3 ? { ...x, parent_ids: [2] } : x);
    assert.deepEqual(visibilityDelta(before, detached, [3]), { gained: [], lost: [7] });
    assert.deepEqual(visibilityDelta(detached, before, [3]), { gained: [7], lost: [] });
});
test('forest repeats multi-parent goals, collapses later occurrences and hides closed leaves', () => {
    const forest = buildForest(net(), false);
    assert.deepEqual(forest.map(n => n.goal.id), [2, 1]);
    const under2 = forest[0].children[0]; const under1 = forest[1].children[0];
    assert.equal(under2.goal.id, 3); assert.equal(under2.repeat, false);
    assert.deepEqual(under2.otherParents.map(p => p.id), [1]);
    assert.equal(under1.repeat, true);
    assert.deepEqual(under2.children.map(n => n.goal.id), [5]);
    assert.deepEqual(buildForest(net(), true)[0].children[0].children.map(n => n.goal.id).sort(), [4, 5]);
    assert.equal(under2.children[0].depth, 2);
});
test('closed goals with open descendants stay visible', () => {
    const rows = [g(1, [], { status: 'completed' }), g(2, [1])];
    assert.deepEqual(visibleGoals(rows, false).map(x => x.id).sort(), [1, 2]);
    assert.deepEqual(visibleGoals([g(9, [], { status: 'archived' })], false), []);
});
test('ordering uses priority, review date, newest first', () => {
    const rows = [g(1, [], { priority: 2 }), g(2, [], { priority: 1 }), g(3, [], { priority: 2, review_date: '2026-10-01' }), g(4, [], { priority: 2 })];
    assert.deepEqual(rows.sort(compareGoals).map(x => x.id), [2, 3, 4, 1]);
});
test('shared branches are ordered depth-first once each', () => {
    const rows = [{ id: 10, parent_ids: [] }, { id: 12, parent_ids: [11] }, { id: 11, parent_ids: [10] }];
    assert.deepEqual(orderBranches(rows).map(r => [r.row.id, r.depth]), [[10, 0], [11, 1], [12, 2]]);
});

test('catalog entries become a goal network without inherited visibility', () => {
    const entry = (id: number, parent_ids: number[], group_id: number | null = null) =>
        ({ id, author_username: 't', group_id, status: 'published', version: 1, parent_ids, data: { title: `C${id}` } }) as TeacherCatalogEntry;
    const goals = catalogGoals([entry(1, [], 7), entry(2, [1]), entry(3, [1, 2])]);
    assert.deepEqual(goals.map(goal => [goal.id, goal.title, goal.status, goal.parent_ids]), [[1, 'C1', 'published', []], [2, 'C2', 'published', [1]], [3, 'C3', 'published', [1, 2]]]);
    assert.equal(effectiveShares(goals, 3).size, 0);
    assert.deepEqual(buildForest(goals, true).map(node => [node.goal.id, node.children.map(child => child.goal.id)]), [[1, [3, 2]]]);
    assert.equal(wouldCycle(goals, 1, 3), true);
});
