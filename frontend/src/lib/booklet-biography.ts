export type BiographyEvent = {
    id: string;
    date: string;
    context: string;
    discovery: string;
    keywords: string;
};

type BookletRecord = Record<string, unknown>;

export function emptyBiographyEvent(id = ''): BiographyEvent {
    return { id, date: '', context: '', discovery: '', keywords: '' };
}

function text(value: unknown): string {
    return value == null ? '' : String(value);
}

export function biographyEventsFromBooklet(source: BookletRecord): BiographyEvent[] {
    const raw = source.bio_events;
    if (Array.isArray(raw)) {
        const events = raw.flatMap((value, index) => {
            if (!value || typeof value !== 'object') return [];
            const item = value as BookletRecord;
            return [{
                id: text(item.id) || `event-${index + 1}`,
                date: text(item.date),
                context: text(item.context),
                discovery: text(item.discovery),
                keywords: text(item.keywords),
            }];
        });
        if (events.length > 0) return events;
    }

    const legacy = {
        id: 'legacy-1',
        date: text(source.bio_date),
        context: text(source.bio_context),
        discovery: text(source.bio_discovery),
        keywords: text(source.bio_keywords),
    };
    return Object.values(legacy).some((value, index) => index > 0 && value.trim()) ? [legacy] : [];
}

export function bookletWithBiographyEvents<T extends BookletRecord>(source: T, events: BiographyEvent[]): T & {
    bio_events: BiographyEvent[];
    bio_date: string;
    bio_context: string;
    bio_discovery: string;
    bio_keywords: string;
} {
    const meaningful = events.filter(event => [event.date, event.context, event.discovery, event.keywords].some(value => value.trim()));
    const first = meaningful[0] ?? emptyBiographyEvent();
    return {
        ...source,
        bio_events: meaningful,
        // Keep the first event in the legacy fields used by older exports and
        // by guided-event drafts. New code reads bio_events.
        bio_date: first.date,
        bio_context: first.context,
        bio_discovery: first.discovery,
        bio_keywords: first.keywords,
    };
}
