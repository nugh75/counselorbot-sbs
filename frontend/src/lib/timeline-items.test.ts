import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { timelineItems, splitByToday, filterItems } from './timeline-items.ts';
import type { TimelineItemKind } from './timeline-items.ts';
import type { Action, TimelineEvent } from './visual-tools.ts';
import type { PersonalGoal } from './goals.ts';

const baseEvent = { title: 'Event', period: '', tense: 'past' as const, symbol: 'milestone' as const, reflection: '', source: '', action_ids: [], portfolio: [] };
const baseAction = { kind: 'activity' as const, detail: '', stage: 'todo' as const, reflection: '', source: '' };
const goal = (id: number, values: Partial<PersonalGoal> = {}) => ({ id, title: `Goal ${id}`, status: 'active', review_date: null, links: [], ...values } as Pick<PersonalGoal, 'id' | 'title' | 'status' | 'review_date'>);

test('timelineItems maps every kind, excludes undated activities and inactive/undated goals, and orders by start-or-end then title', () => {
    const events: TimelineEvent[] = [
        { ...baseEvent, id: 'evt-1', title: 'Colloquio', institution_event: 'open-day', date_mode: 'point', start_date: '2026-01-10' },
        { ...baseEvent, id: 'evt-2', title: 'Diploma', date_mode: 'period', start_date: '2026-01-05', end_date: '2026-01-06' },
        { ...baseEvent, id: 'evt-3', title: 'Ricordo senza data' },
    ];
    const actions: Action[] = [
        { ...baseAction, id: 'a1', title: 'Attivita datata', date_mode: 'point', start_date: '2026-01-08' },
        { ...baseAction, id: 'a2', title: 'Attivita senza data' },
    ];
    const goals = [
        goal(1, { title: 'Obiettivo attivo', review_date: '2026-01-01' }),
        goal(2, { title: 'Obiettivo senza revisione', review_date: null }),
        goal(3, { title: 'Obiettivo concluso', status: 'completed', review_date: '2026-01-02' }),
    ];

    const items = timelineItems({ actions, timeline: { events } }, goals);

    assert.deepEqual(items.map(i => i.key), ['goal-1', 'milestone-evt-2', 'action-a1', 'appointment-evt-1', 'milestone-evt-3']);

    const appointment = items.find(i => i.key === 'appointment-evt-1')!;
    assert.equal(appointment.kind, 'appointment');
    assert.equal(appointment.editable, false);
    assert.equal(appointment.href, null);
    assert.equal(appointment.eventId, 'evt-1');

    const milestone = items.find(i => i.key === 'milestone-evt-2')!;
    assert.equal(milestone.kind, 'milestone');
    assert.equal(milestone.editable, true);
    assert.equal(milestone.href, null);
    assert.equal(milestone.eventId, 'evt-2');
    assert.equal(milestone.start, '2026-01-05');
    assert.equal(milestone.end, '2026-01-06');

    const action = items.find(i => i.key === 'action-a1')!;
    assert.equal(action.kind, 'action');
    assert.equal(action.editable, false);
    assert.equal(action.href, '/profilo/azioni#action-a1');
    assert.equal(action.stage, 'todo');

    const goalItem = items.find(i => i.key === 'goal-1')!;
    assert.equal(goalItem.kind, 'goal');
    assert.equal(goalItem.editable, false);
    assert.equal(goalItem.href, '/profilo/obiettivi?goal=1');
    assert.equal(goalItem.start, '2026-01-01');

    const undatedMilestone = items.find(i => i.key === 'milestone-evt-3')!;
    assert.equal(undatedMilestone.start, null);
    assert.equal(undatedMilestone.end, null);
});

test('splitByToday buckets past/future by end-or-start and keeps a spanning period as future', () => {
    const items = [
        { key: 'past-1', kind: 'milestone' as TimelineItemKind, title: 'Past', start: '2026-01-01', end: null, href: null, editable: true },
        { key: 'spanning', kind: 'action' as TimelineItemKind, title: 'Spanning', start: '2026-01-01', end: '2026-01-31', href: null, editable: false },
        { key: 'future-1', kind: 'goal' as TimelineItemKind, title: 'Future', start: '2026-02-01', end: null, href: null, editable: false },
        { key: 'undated-1', kind: 'milestone' as TimelineItemKind, title: 'Undated', start: null, end: null, href: null, editable: true },
    ];
    const { past, future, undated } = splitByToday(items, '2026-01-15');
    assert.deepEqual(past.map(i => i.key), ['past-1']);
    assert.deepEqual(future.map(i => i.key), ['spanning', 'future-1']);
    assert.deepEqual(undated.map(i => i.key), ['undated-1']);
});

test('filterItems keeps only the requested kinds', () => {
    const items = [
        { key: 'a', kind: 'milestone' as TimelineItemKind, title: 'A', start: null, end: null, href: null, editable: true },
        { key: 'b', kind: 'action' as TimelineItemKind, title: 'B', start: null, end: null, href: null, editable: false },
        { key: 'c', kind: 'goal' as TimelineItemKind, title: 'C', start: null, end: null, href: null, editable: false },
    ];
    assert.deepEqual(filterItems(items, new Set(['milestone', 'goal'])).map(i => i.key), ['a', 'c']);
});

test('items sharing a start date break the tie by title', () => {
    const goals = [
        goal(1, { title: 'Zeta', review_date: '2026-03-01' }),
        goal(2, { title: 'Alpha', review_date: '2026-03-01' }),
    ];
    const items = timelineItems({ actions: [], timeline: { events: [] } }, goals);
    assert.deepEqual(items.map(i => i.title), ['Alpha', 'Zeta']);
});

test('a period with only a start date or only an end date is dated and bucketed by the end-or-start rule', () => {
    const events: TimelineEvent[] = [
        { ...baseEvent, id: 'evt-open-start', title: 'Open start', date_mode: 'period', start_date: '2026-01-01' },
        { ...baseEvent, id: 'evt-open-end', title: 'Open end', date_mode: 'period', end_date: '2026-01-31' },
    ];
    const items = timelineItems({ actions: [], timeline: { events } }, []);

    const startOnly = items.find(i => i.key === 'milestone-evt-open-start')!;
    assert.equal(startOnly.start, '2026-01-01');
    assert.equal(startOnly.end, null);
    const endOnly = items.find(i => i.key === 'milestone-evt-open-end')!;
    assert.equal(endOnly.start, null);
    assert.equal(endOnly.end, '2026-01-31');

    const { past, future } = splitByToday(items, '2026-01-15');
    assert.deepEqual(past.map(i => i.key), ['milestone-evt-open-start']); // end ?? start = '2026-01-01' < today
    assert.deepEqual(future.map(i => i.key), ['milestone-evt-open-end']); // end ?? start = '2026-01-31' >= today
});

test('an item dated exactly today is not past', () => {
    const items = [{ key: 'today-1', kind: 'milestone' as TimelineItemKind, title: 'Today', start: '2026-01-15', end: null, href: null, editable: true }];
    const { past, future } = splitByToday(items, '2026-01-15');
    assert.deepEqual(past, []);
    assert.deepEqual(future.map(i => i.key), ['today-1']);
});

test('a legacy event with free-text period and no date_mode is undated', () => {
    const events: TimelineEvent[] = [{ ...baseEvent, id: 'evt-legacy', title: 'School years', period: 'Durante la scuola superiore' }];
    const items = timelineItems({ actions: [], timeline: { events } }, []);
    const legacy = items.find(i => i.key === 'milestone-evt-legacy')!;
    assert.equal(legacy.start, null);
    assert.equal(legacy.end, null);
    const { undated } = splitByToday(items, '2026-01-15');
    assert.deepEqual(undated.map(i => i.key), ['milestone-evt-legacy']);
});
