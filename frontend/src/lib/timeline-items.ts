import type { Action, TimelineEvent } from './visual-tools';
import type { PersonalGoal } from './goals';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { eventDates } from './timeline-dates.ts';

export type TimelineItemKind = 'milestone' | 'action' | 'goal' | 'appointment';
export type TimelineItem = {
    key: string; kind: TimelineItemKind; title: string; start: string | null; end: string | null;
    href: string | null; editable: boolean; eventId?: string; stage?: string; status?: string;
};

const UNDATED = '9999-99-99';
const sortKey = (item: TimelineItem) => (item.start ?? item.end ?? UNDATED) + '\u0000' + item.title;

/** Builds the unified personal timeline: past milestones and institution appointments from the
    workspace, dated activities, and active goals' review dates. Ordered by start-or-end then title;
    items without either date sort last (a caller wanting them separate should use splitByToday). */
export function timelineItems(workspace: { actions: Action[]; timeline: { events: TimelineEvent[] } }, goals: Pick<PersonalGoal, 'id' | 'title' | 'status' | 'review_date'>[]): TimelineItem[] {
    const items: TimelineItem[] = [];
    for (const event of workspace.timeline.events) {
        const dates = eventDates(event);
        const kind: TimelineItemKind = event.institution_event ? 'appointment' : 'milestone';
        items.push({
            key: `${kind}-${event.id}`, kind, title: event.title,
            start: dates.start_date ?? null, end: dates.end_date ?? null,
            href: null, editable: !event.institution_event, eventId: event.id,
        });
    }
    for (const action of workspace.actions) {
        if (!action.date_mode) continue;
        items.push({
            key: `action-${action.id}`, kind: 'action', title: action.title,
            start: action.start_date ?? null, end: action.end_date ?? null,
            href: `/profilo/azioni#action-${action.id}`, editable: false, stage: action.stage,
        });
    }
    for (const goal of goals) {
        if (goal.status !== 'active' || !goal.review_date) continue;
        items.push({
            key: `goal-${goal.id}`, kind: 'goal', title: goal.title, start: goal.review_date, end: null,
            href: `/profilo/obiettivi?goal=${goal.id}`, editable: false, status: goal.status,
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
