import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { mergePlanResumes } from './path-resume.ts';
import type { StudentClassPath } from './class-paths';

const attempt = {session_id: 'draft', state: 'in_progress', resumable: true, started_at: '2026-10-28T12:00:00Z'};
const plan = (current = attempt) => [{id: 1, title: 'Piano', steps: [{id: 2, title: 'Questionario',
    activity: {instrument_code: 'QSA', current, attempts: [current]}}]}] as unknown as StudentClassPath[];
const frozen = {session_id: 'draft', path_id: 1, path_step_id: 2, questionnaire_type: 'QSA', current_phase: 'reflection'};

test('a server draft can resume before a chat snapshot exists, and the saved snapshot is not duplicated', () => {
    assert.equal(mergePlanResumes([], plan()).rows[0].path_step_id, 2);
    const merged = mergePlanResumes([frozen], plan());
    assert.equal(merged.rows.length, 1);
    assert.equal(merged.rows[0].current_phase, 'reflection');
});

test('completed and inaccessible plan attempts leave Resume while personal conversations remain', () => {
    const personal = {...frozen, session_id: 'personal', path_id: null};
    const merged = mergePlanResumes([frozen, personal], plan({...attempt, state: 'completed'}));
    assert.deepEqual(merged.rows.map(row => row.session_id), ['personal']);
    assert.equal(merged.completed.has('draft'), true);
    assert.deepEqual(mergePlanResumes([frozen], []).rows, []);
    assert.deepEqual(mergePlanResumes([frozen], null).rows, [frozen]);
});
