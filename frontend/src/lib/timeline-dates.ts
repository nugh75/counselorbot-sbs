import type { TimelineEvent } from './visual-tools';

export type TimelineDates = Pick<TimelineEvent, 'date_mode' | 'start_date' | 'end_date'>;

export function validTimelineDates(event: TimelineDates): boolean {
    const { date_mode: mode, start_date: start, end_date: end } = event;
    if (!mode) return !start && !end; // Legacy periods remain intact until explicitly dated.
    const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 &&
        Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if ((start && !valid(start)) || (end && !valid(end))) return false;
    return mode === 'point' ? Boolean(start && !end) : Boolean((start || end) && (!start || !end || end >= start));
}

export function datePeriod(event: TimelineDates): string {
    return event.date_mode === 'point' ? event.start_date || '' : `${event.start_date || '…'} → ${event.end_date || '…'}`;
}

export function eventDates(event: TimelineEvent): TimelineDates {
    if (event.institution_event && /^\d{4}-\d{2}-\d{2}T/.test(event.period)) {
        // Match the local date shown in the institutional event details.
        return { date_mode: 'point', start_date: localDate(new Date(event.period)), end_date: null };
    }
    return event;
}

export function eventDateKey(event: TimelineEvent): string {
    const dates = eventDates(event);
    return dates.start_date || dates.end_date || '9999-99-99';
}

export function sortedTimeline(events: TimelineEvent[]): TimelineEvent[] {
    return [...events].sort((a, b) => eventDateKey(a).localeCompare(eventDateKey(b)));
}

function localDate(value: Date): string {
    return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function localToday(): string {
    return localDate(new Date());
}
