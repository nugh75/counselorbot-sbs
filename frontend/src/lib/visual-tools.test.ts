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

test('timeline order preserves uncertain periods and selected handoff follows live action state', async () => {
    // @ts-expect-error -- Node runs TypeScript files directly.
    const { moveTimelineEvent, timelineText } = await import('./visual-tools.ts');
    const w = emptyWorkspace();
    w.actions = [{ id: 'a', title: 'Prepare slides', stage: 'doing', detail: '', reflection: '', source: '' }];
    const event = { id: 'e', title: 'Presentation', period: 'Around June', tense: 'future' as const, symbol: 'milestone' as const, reflection: 'Try together', source: '', action_ids: ['a'], portfolio: [{ id: 1, title: 'Slides' }] };
    w.timeline = { title: 'My journey', events: [event, { ...event, id: 'p', title: 'Earlier experience', period: 'At school' }] };
    const moved = moveTimelineEvent(w, 'p', -1);
    assert.equal(moved.timeline?.events[0].period, 'At school');
    assert.equal(w.timeline.events[0].id, 'e');
    assert.equal(moveTimelineEvent(w, 'e', -1), w);
    const label = (key: string) => visualLabel('en', key);
    const selected = timelineText(w, label, ['e']);
    assert.match(selected, /In progress/);
    assert.match(selected, /Slides/);
    assert.doesNotMatch(selected, /Earlier experience/);
    const removed = { ...w, actions: [] };
    assert.match(timelineText(removed, label), /Unavailable/);
    assert.match(workspaceText(w, label), /Around June/);
});

test('removing an unsaved action unlinks it without deleting its milestone or Portfolio work', async () => {
    // @ts-expect-error -- Node runs TypeScript files directly.
    const { removeAction } = await import('./visual-tools.ts');
    const w = emptyWorkspace();
    w.actions = [{ id: 'new', title: 'Read', kind: 'book', stage: 'todo', detail: '', reflection: '', source: '' }];
    w.timeline = { title: 'Journey', events: [{ id: 'e', title: 'Reading', period: 'Soon', tense: 'future', symbol: 'study', reflection: '', source: '', action_ids: ['new'], portfolio: [{ id: 1, title: 'Notes' }] }] };
    const next = removeAction(w, 'new');
    assert.equal(next.actions.length, 0);
    assert.deepEqual(next.timeline?.events[0].action_ids, []);
    assert.equal(next.timeline?.events[0].portfolio[0].title, 'Notes');
    assert.deepEqual(w.timeline.events[0].action_ids, ['new']);
});
