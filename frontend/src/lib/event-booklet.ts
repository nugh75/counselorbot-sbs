// Bozza del libretto che la sintesi dell'Evento significativo prepara in un
// blocco privato (backend/event_booklet.py). La persona la vede in un modulo,
// la corregge e la salva: senza conferma non si scrive niente.

export const EVENT_INSTRUMENTS = ['EVENTO_STUDIO', 'EVENTO_PROFESSIONALE'] as const;
export const EVENT_ROLES = ['protagonist', 'observer', 'alongside'] as const;
export type EventRole = (typeof EVENT_ROLES)[number] | '';

export interface EventBookletDraft {
    title: string;
    bio_date: string;
    event_role: EventRole;
    bio_context: string;
    strength: string[];
    growth_area: string[];
    discovery: string;
    objective: string;
    strategy: string;
}

export interface EventBookletForm {
    title: string;
    bio_date: string;
    event_role: EventRole;
    bio_context: string;
    worked: string;
    didNotWork: string;
    discovery: string;
    objective: string;
    strategy: string;
}

export function isEventInstrument(questionnaireType: string): boolean {
    return (EVENT_INSTRUMENTS as readonly string[]).includes(questionnaireType);
}

const lines = (items: string[] | undefined): string => (items ?? []).join('\n');
const items = (text: string): string[] => text.split('\n').map((item) => item.trim()).filter(Boolean);

export function formFromDraft(draft: Partial<EventBookletDraft> | null | undefined): EventBookletForm {
    const role = draft?.event_role ?? '';
    return {
        title: draft?.title ?? '',
        bio_date: draft?.bio_date ?? '',
        event_role: (EVENT_ROLES as readonly string[]).includes(role) ? role : '',
        bio_context: draft?.bio_context ?? '',
        worked: lines(draft?.strength),
        didNotWork: lines(draft?.growth_area),
        discovery: draft?.discovery ?? '',
        objective: draft?.objective ?? '',
        strategy: draft?.strategy ?? '',
    };
}

export function bookletDataFromForm(form: EventBookletForm): EventBookletDraft {
    return {
        title: form.title.trim(),
        bio_date: form.bio_date,
        event_role: form.event_role,
        bio_context: form.bio_context.trim(),
        strength: items(form.worked),
        growth_area: items(form.didNotWork),
        discovery: form.discovery.trim(),
        objective: form.objective.trim(),
        strategy: form.strategy.trim(),
    };
}
