import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { datePeriod, eventDates, sortedTimeline, validTimelineDates } from './timeline-dates.ts';
import type { TimelineEvent } from './visual-tools.ts';

test('calendar accepts all four date forms and rejects impossible or inverted dates', () => {
    for (const value of [
        { date_mode: 'point', start_date: '2028-02-29' },
        { date_mode: 'period', start_date: '2026-10-01', end_date: '2026-10-31' },
        { date_mode: 'period', start_date: '2026-10-01' },
        { date_mode: 'period', end_date: '2026-10-31' },
    ] as const) assert.equal(validTimelineDates(value), true);
    for (const value of [
        { date_mode: 'point' }, { date_mode: 'period' },
        { date_mode: 'point', start_date: '2026-02-29' },
        { date_mode: 'point', start_date: '0000-01-01' },
        { date_mode: 'point', start_date: '2026-10-01', end_date: '2026-10-02' },
        { date_mode: 'period', start_date: '2026-10-31', end_date: '2026-10-01' },
    ] as const) assert.equal(validTimelineDates(value), false);
    assert.equal(validTimelineDates({}), true);
    assert.equal(datePeriod({ date_mode: 'period', start_date: '2026-10-01' }), '2026-10-01 → …');
});

test('chronology uses the known boundary, preserves legacy periods and does not mutate work', () => {
    const base: TimelineEvent = { id: 'legacy', title: 'School', period: 'During school', tense: 'past', symbol: 'study', reflection: '', source: '', action_ids: [], portfolio: [] };
    const events: TimelineEvent[] = [base,
        { ...base, id: 'later', date_mode: 'period', start_date: '2026-10-01' },
        { ...base, id: 'deadline', date_mode: 'period', end_date: '2026-09-01' },
        { ...base, id: 'institution', institution_event: 'open-day', period: '2026-08-01T10:00:00Z' },
    ];
    assert.deepEqual(sortedTimeline(events).map(event => event.id), ['institution', 'deadline', 'later', 'legacy']);
    assert.equal(events[0].period, 'During school');
    assert.equal(eventDates(events[3]).start_date, '2026-08-01');
});

test('institutional dates use the same local calendar day as their details', () => {
    const previous = process.env.TZ;
    const event: TimelineEvent = { id: 'institution', institution_event: 'open-day', title: 'Open day', period: '2026-11-10T23:30:00Z', tense: 'future', symbol: 'study', reflection: '', source: '', action_ids: [], portfolio: [] };
    try {
        process.env.TZ = 'Europe/Rome';
        assert.equal(eventDates(event).start_date, '2026-11-11');
        process.env.TZ = 'America/Los_Angeles';
        assert.equal(eventDates({ ...event, period: '2026-11-10T00:30:00Z' }).start_date, '2026-11-09');
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});
