import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node direct typescript execution requires extension
import { latestPausedByTool } from './catalog-status.ts';

test('each tool keeps its most recent paused session', () => {
    const paused = latestPausedByTool([
        { session_id: 'b', questionnaire_type: 'QSA', current_phase: 'p2', updated_at: '2026-10-10T10:00:00Z' },
        { session_id: 'a', questionnaire_type: 'QSA', current_phase: 'p1', updated_at: '2026-10-01T10:00:00Z' },
        { session_id: 'c', questionnaire_type: 'IDEA', current_phase: 'p1', updated_at: '2026-10-05T10:00:00Z' },
    ]);
    assert.equal(paused.size, 2);
    assert.equal(paused.get('QSA')?.session_id, 'b');
    assert.equal(paused.get('IDEA')?.session_id, 'c');
});

test('no paused sessions leaves every tool unchanged', () => {
    assert.equal(latestPausedByTool([]).size, 0);
});
