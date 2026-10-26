import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { parseClassPathStep, parseStudentClassPathStep } from './class-paths.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { pathAssignmentTexts } from './i18n-path-assignments.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { assignmentSaveError, assignmentStepInput, parsePathAssignments, selectablePathAssignments } from './path-assignments.ts';

const summary = {id: 7, title: 'Plan the study week', attachments: [{kind: 'strategy', title: 'Spaced review'}],
    intent: 'requested', due_date: '2026-10-20'};

test('assignment steps keep their target for teacher and student without an administration summary', () => {
    const payload = {id: 21, path_id: 1, position: 3, step_type: 'assignment', tool_key: null,
        administration_plan_id: null, results_step_id: null, assignment_id: 7, auto_detect: true,
        can_self_mark: false, target_summary: summary, completion_kind: 'assignment_submission',
        state: 'done', source: 'automatic', start_href: '/profilo/assegnazioni#assignment-7'};
    const teacher = parseClassPathStep(payload);
    const student = parseStudentClassPathStep(payload);
    for (const step of [teacher, student]) {
        assert.equal(step.step_type, 'assignment');
        assert.equal(step.assignment_id, 7);
        assert.equal(step.target_summary, null);
        assert.equal(step.assignment_summary?.title, 'Plan the study week');
        assert.deepEqual(step.assignment_summary?.attachments, [{kind: 'strategy', title: 'Spaced review'}]);
    }
    assert.equal(student.start_href, '/profilo/assegnazioni#assignment-7');
    assert.equal(student.completion_kind, 'assignment_submission');
    assert.equal(parseClassPathStep({tool_key: 'timeline', assignment_id: 7}).assignment_id, null);
});

test('the builder lists each live whole-class assignment once and sends only its id', () => {
    const rows = parsePathAssignments([
        {id: 7, snapshot: {title: 'Plan the study week'}, attachments: [{kind: 'reading', source_id: 3, title: 'Film'}],
            due_date: null, intent: 'proposal', recipient_username: null, revoked_at: null},
        {id: 8, snapshot: {title: 'Targeted'}, recipient_username: 'alice', revoked_at: null},
        {id: 9, snapshot: {title: 'Revoked'}, recipient_username: null, revoked_at: '2026-10-09T10:00:00Z'},
        null,
    ]);
    assert.deepEqual(rows.map(row => row.id), [7]);
    assert.deepEqual(rows[0].attachments, [{kind: 'reading', title: 'Film'}]);
    const steps = [parseClassPathStep({step_type: 'assignment', assignment_id: 7})];
    assert.deepEqual(selectablePathAssignments(rows, steps), []);
    assert.deepEqual(selectablePathAssignments(rows, []).map(row => row.id), [7]);
    const step = assignmentStepInput(rows[0], 4);
    assert.equal(step.step_type, 'assignment');
    assert.equal(step.assignment_id, 7);
    assert.equal(step.position, 4);
    assert.equal(step.can_self_mark, false);
    assert.equal(step.assignment_summary?.title, 'Plan the study week');
});

test('assignment target errors keep the draft with a specific notice', () => {
    for (const detail of ['assignment_class_mismatch', 'assignment_targeted', 'assignment_revoked',
        'assignment_not_goal', 'assignment_class_inactive', 'duplicate_assignment_step']) {
        assert.equal(assignmentSaveError(detail), true, detail);
    }
    assert.equal(assignmentSaveError('Class path revision mismatch'), false);
    assert.equal(assignmentSaveError(undefined), false);
});

test('path assignment texts exist in six languages without glyph labels', () => {
    for (const [key, values] of Object.entries(pathAssignmentTexts)) {
        assert.equal(values.length, 6, key);
        for (const value of values) {
            assert.ok(value.trim(), key);
            assert.doesNotMatch(value, /^\s*\+|\p{Extended_Pictographic}/u, key);
        }
    }
});

test('progress and student views name an assignment step by its delivered goal', async () => {
    // @ts-expect-error -- Node's direct TypeScript runner requires the extension.
    const { typedStepTargetLabel } = await import('./i18n-administration-steps.ts');
    const step = parseStudentClassPathStep({id: 21, step_type: 'assignment', assignment_id: 7, target_summary: summary});
    assert.equal(typedStepTargetLabel('en', step), 'Assignment · Plan the study week');
    assert.equal(typedStepTargetLabel('it', {step_type: 'assignment', assignment_summary: null}), null);
});
