import type { Action, TimelineEvent } from './visual-tools';
import type { PersonalGoal } from './goals';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { eventDates } from './timeline-dates.ts';

export type TimelineItemKind = 'milestone' | 'action' | 'goal' | 'appointment' | 'meeting';
export type TimelineItem = {
    key: string; kind: TimelineItemKind; title: string; start: string | null; end: string | null;
    href: string | null; editable: boolean; eventId?: string; stage?: string; status?: string;
    dateMode?: 'point' | 'period'; deadline?: boolean;
    /** #189: a class or group meeting, read from the class and never saved in the workspace. */
    time?: string; where?: string | null;
};

/** A class meeting placed on the timeline: `at` is the meeting's (or the student's slot's) start. */
export type TimelineMeeting = { id: number; title: string; at: string; status: string; place: string | null };

const UNDATED = '9999-99-99';
const sortKey = (item: TimelineItem) => (item.start ?? item.end ?? UNDATED) + '\u0000' + item.title;

/** Builds the unified personal timeline: past milestones and institution appointments from the
    workspace, dated activities, and active goals' review dates. Ordered by start-or-end then title;
    items without either date sort last (a caller wanting them separate should use splitByToday). */
export function timelineItems(workspace: { actions: Action[]; timeline: { events: TimelineEvent[] } }, goals: Pick<PersonalGoal, 'id' | 'title' | 'status' | 'review_date'>[],
    meetings: TimelineMeeting[] = []): TimelineItem[] {
    const items: TimelineItem[] = [];
    for (const event of workspace.timeline.events) {
        const dates = eventDates(event);
        const kind: TimelineItemKind = event.institution_event ? 'appointment' : 'milestone';
        items.push({
            key: `${kind}-${event.id}`, kind, title: event.title,
            start: dates.start_date ?? null, end: dates.end_date ?? null,
            href: null, editable: !event.institution_event, eventId: event.id,
            dateMode: dates.date_mode ?? undefined, deadline: event.institution_date === 'deadline',
        });
    }
    for (const action of workspace.actions) {
        if (!action.date_mode) continue;
        items.push({
            key: `action-${action.id}`, kind: 'action', title: action.title,
            start: action.start_date ?? null, end: action.end_date ?? null,
            href: `/profilo/azioni#action-${action.id}`, editable: false, stage: action.stage,
            dateMode: action.date_mode ?? undefined,
        });
    }
    for (const goal of goals) {
        if (goal.status !== 'active' || !goal.review_date) continue;
        items.push({
            key: `goal-${goal.id}`, kind: 'goal', title: goal.title, start: goal.review_date, end: null,
            href: `/profilo/obiettivi?goal=${goal.id}`, editable: false, status: goal.status,
        });
    }
    for (const meeting of meetings) {
        const at = new Date(meeting.at);
        if (Number.isNaN(at.getTime())) continue;
        const pad = (value: number) => String(value).padStart(2, '0');
        // The student's local day, so an evening meeting is not shown on the next day.
        const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
        items.push({
            key: `meeting-${meeting.id}`, kind: 'meeting', title: meeting.title, start: day, end: null,
            href: null, editable: false, status: meeting.status, time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
            where: meeting.place,
        });
    }
    return items.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** Splits already-built items into past, future and undated buckets against `today` (YYYY-MM-DD).
    A period counts as past only once it has fully ended: the comparison uses `end ?? start`. */
export function splitByToday(items: TimelineItem[], today: string): { past: TimelineItem[]; future: TimelineItem[]; undated: TimelineItem[] } {
    const past: TimelineItem[] = [], future: TimelineItem[] = [], undated: TimelineItem[] = [];
    for (const item of items) {
        if (!item.start && !item.end) { undated.push(item); continue; }
        ((item.end ?? item.start!) < today ? past : future).push(item);
    }
    return { past, future, undated };
}

export function filterItems(items: TimelineItem[], kinds: Set<TimelineItemKind>): TimelineItem[] {
    return items.filter(item => kinds.has(item.kind));
}
