import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { personalResumeItems } from './personal-area.ts';
import type { PersonalGoal } from './goals';

const goal = (id: number, values: Partial<PersonalGoal> = {}) => ({ id, title: `Goal ${id}`, status: 'active', review_date: null, links: [], ...values } as PersonalGoal);
test('resume deduplicates shared actions, skips completed work and caps the combined list', () => {
    const action = { kind: 'action' as const, target_id: 'shared', title: 'Shared action', href: '/profilo/azioni', available: true, stage: 'doing' };
    const rows = personalResumeItems([
        goal(1, { links: [action, { ...action, target_id: 'done', stage: 'done' }, { ...action, target_id: 'missing', available: false }] }),
        goal(2, { links: [action] }), goal(3, { status: 'completed' }),
    ], [
        { id: 1, snapshot: { title: 'Due first' }, due_date: '2026-09-24' },
        { id: 2, snapshot: { title: 'Due second' }, due_date: '2026-09-25' },
        { id: 3, snapshot: { title: 'Already sent' }, due_date: '2026-09-20', progress: { shared: true, planned: true, feedback_available: false } },
    ]);
    assert.deepEqual(rows.map(r => r.id), ['assignment-1', 'assignment-2', 'action-shared']);
    assert.equal(rows[2].href, '/profilo/azioni#action-shared');
});
test('resume keeps feedback explicit and active goals without activities reachable', () => {
    const rows = personalResumeItems([goal(1)], [{ id: 1, snapshot: { title: 'Reviewed' }, due_date: null, progress: { shared: true, planned: true, feedback_available: true } }]);
    assert.equal(rows.find(r => r.kind === 'assignment')?.feedback, true);
    assert.equal(rows.find(r => r.kind === 'goal')?.href, '/profilo/obiettivi?goal=1');
    assert.deepEqual(personalResumeItems([], []), []);
});
