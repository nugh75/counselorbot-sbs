import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { emptyWorkspace, removeOption, removeCriterion, setCell, workspaceText } from './visual-tools.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { visualLabel } from './i18n-visual-tools.ts';

test('removing a chosen alternative removes its notes and choice without mutating history', () => {
    const w = emptyWorkspace();
    w.comparison.options = [{ id: 'a', title: 'Course A', source: '' }, { id: 'b', title: 'Course B', source: '' }];
    w.comparison.criteria = [{ id: 'time', label: 'Time' }];
    w.comparison.chosen = 'a';
    const filled = setCell(w, 'a', 'time', 'Evenings');
    const removed = removeOption(filled, 'a');
    assert.equal(removed.comparison.chosen, null);
    assert.equal(removed.comparison.cells.length, 0);
    assert.equal(filled.comparison.cells[0].note, 'Evenings');
    assert.equal(filled.comparison.options.length, 2);
    assert.equal(removeCriterion(filled, 'time').comparison.cells.length, 0);
});

test('notes replace the same cell, and clearing it preserves other alternatives', () => {
    let w = setCell(emptyWorkspace(), 'a', 'time', 'Morning');
    w = setCell(w, 'b', 'time', 'Evening');
    w = setCell(w, 'a', 'time', 'Afternoon');
    assert.equal(w.comparison.cells.length, 2);
    w = setCell(w, 'a', 'time', '');
    assert.deepEqual(w.comparison.cells, [{ option_id: 'b', criterion_id: 'time', note: 'Evening' }]);
});

test('the chat handoff attributes student choices and preserves reflection and sources', () => {
    const w = emptyWorkspace();
    w.actions = [{ id: 'a', title: 'Try recall', detail: 'Close the book', stage: 'done', reflection: 'I recalled three ideas', source: 'Suggested strategy' }];
    w.cards = [{ id: 'c', text: 'Examples help me', bucket: 'yes', source: '' }];
    const result = workspaceText(w, key => visualLabel('en', key));
    assert.match(result, /choices and reflections of mine/);
    assert.match(result, /I recalled three ideas/);
    assert.match(result, /Source: Suggested strategy/);
    assert.match(result, /Fits me: Examples help me/);
});
