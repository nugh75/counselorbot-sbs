export type TimelineGlyph = 'milestone' | 'goal-review' | 'check' | 'action' | 'review-date';
export type TimelineGlyphItem = { kind: 'event' | 'action'; id: string; tense?: string; action_kind?: string; review_date?: boolean };

/** The five-symbol shorthand shown on the personal timeline (`PersonalTimeline`'s legend, drawn
    with lucide icons): a past milestone, a goal's balance logged as a milestone (id `goal-review-*`),
    a check-type action, any other action, and a date still to look ahead to — a goal's review
    date or an institution appointment. */
export function timelineGlyph(item: TimelineGlyphItem): TimelineGlyph {
    if (item.kind === 'action') return item.action_kind === 'check' ? 'check' : 'action';
    if (item.id.startsWith('goal-review-')) return 'goal-review';
    if (item.review_date || item.tense !== 'past') return 'review-date';
    return 'milestone';
}

/** Order the legend is rendered in; pair with the matching `glyph*` i18n labels by index. */
export const TIMELINE_GLYPHS: TimelineGlyph[] = ['milestone', 'goal-review', 'check', 'action', 'review-date'];
