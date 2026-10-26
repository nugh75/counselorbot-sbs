import assert from 'node:assert/strict';
import test from 'node:test';
import { latestPausedByTool, suggestTools } from './catalog-status.ts';

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

const pausedRow = (id: string, tool: string) => ({ session_id: id, questionnaire_type: tool, current_phase: 'p1' });

test('suggestions put paused chats before Bussola picks, without duplicates', () => {
    const suggestions = suggestTools({
        activeIds: ['QSA', 'IDEA', 'SAVICKAS', 'ZTPI'],
        completed: [],
        paused: [pausedRow('s1', 'IDEA')],
        orientation: [{ id: 'IDEA', reason: 'again' }, { id: 'QSA', reason: 'study habits' }],
    });
    assert.deepEqual(suggestions, [
        { id: 'IDEA', source: 'paused' },
        { id: 'QSA', source: 'orientation', reason: 'study habits' },
    ]);
});

test('suggestions skip completed and inactive tools and stop at three', () => {
    const suggestions = suggestTools({
        activeIds: ['A', 'B', 'C', 'D', 'E'],
        completed: ['A'],
        paused: [],
        orientation: ['A', 'X', 'B', 'C', 'D', 'E'].map((id) => ({ id, reason: id })),
    });
    assert.deepEqual(suggestions.map((s) => s.id), ['B', 'C', 'D']);
});

test('no signal means no suggestions', () => {
    assert.deepEqual(suggestTools({ activeIds: ['QSA'], completed: [], paused: [], orientation: [] }), []);
});
