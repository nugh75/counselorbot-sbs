// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { emptyWorkspace, workspaceText, type VisualWorkspace } from './visual-tools.ts';

export const notebookFields: Record<string, string> = {
    context: 'lp.field.context', goal: 'lp.field.goal', main_difficulty: 'lp.field.difficulty',
    strengths: 'lp.field.strengths', weaknesses: 'lp.field.weaknesses', notes: 'lp.field.notes',
};
export const bookletFields: Record<string, string> = {
    motivation: 'booklet.field.motivation', objective: 'booklet.field.objective', strategy: 'booklet.field.strategy',
    difficulties: 'booklet.field.difficulties', improvements: 'booklet.field.improvements',
    discovery: 'booklet.field.discovery', bio_context: 'booklet.bio.context', bio_discovery: 'booklet.bio.discovery',
    bio_keywords: 'booklet.bio.keywords', student_notes: 'booklet.field.studentNotes', final_observations: 'booklet.field.finalObservations',
};
export type PersonalContext = {
    questionnaire_type: string | null;
    limits: { notebook: number; booklet: number };
    sources: Record<string, string>;
    notebook: Record<string, string>;
    booklets: { id: number; title: string; data: Record<string, string> }[];
};
export type TransferEntry = { id: string; label: string; text: string; source: string };
export type ImportTarget = 'cards' | 'actions' | 'comparison';

export function visualEntries(work: VisualWorkspace, l: (key: string) => string): TransferEntry[] {
    const asText = (part: VisualWorkspace) => workspaceText(part, l).slice(l('handoff').length).trim();
    return [
        ...work.actions.map(item => ({ id: `actions:${item.id}`, label: item.title,
            text: asText({ ...emptyWorkspace(), actions: [item] }), source: 'actions' })),
        ...work.cards.map(item => ({ id: `cards:${item.id}`, label: item.text,
            text: asText({ ...emptyWorkspace(), cards: [item] }), source: 'cards' })),
        ...(work.comparison.options.length ? [{ id: `comparison:${work.comparison.options[0].id}`, label: l('comparison'),
            text: asText({ ...emptyWorkspace(), comparison: work.comparison }), source: 'comparison' }] : []),
    ];
}

export function annotationEntries(data: PersonalContext, t: (key: string) => string, l: (key: string) => string): TransferEntry[] {
    const notebook = Object.entries(notebookFields).filter(([key]) => data.notebook[key]?.trim()).map(([key, label]) => ({
        id: `notebook_${key}`, label: `${l('notebook')} · ${t(label)}`, text: data.notebook[key], source: `${l('notebook')} · ${t(label)}`,
    }));
    const booklets = data.booklets.flatMap(booklet => Object.entries(bookletFields).filter(([key]) => booklet.data[key]?.trim()).map(([key, label]) => ({
        id: `booklet_${booklet.id}_${key}`, label: `${l('booklet')} · ${booklet.title || data.questionnaire_type} · ${t(label)}`,
        text: booklet.data[key], source: `${l('booklet')} · ${booklet.title || data.questionnaire_type} · ${t(label)}`.slice(0, 300),
    })));
    return [...notebook, ...booklets];
}

export function importAnnotation(work: VisualWorkspace, entry: TransferEntry, target: ImportTarget, text: string, title: string): VisualWorkspace {
    const id = crypto.randomUUID();
    const items = target === 'comparison' ? work.comparison.options : work[target];
    if (items.some(item => item.source === entry.source && ('text' in item ? item.text === text.trim()
        : 'detail' in item ? item.detail === text.trim() && item.title === title.trim() : item.title === text.trim()))) throw new Error('personalDuplicate');
    if (items.length >= (target === 'comparison' ? 3 : 30)) throw new Error('limit');
    if (!text.trim() || text.length > (target === 'actions' ? 1000 : target === 'cards' ? 600 : 160)
        || (target === 'actions' && (!title.trim() || title.length > 160))) throw new Error('personalLength');
    const source = entry.source;
    if (target === 'cards') return { ...work, cards: [...work.cards, { id, text: text.trim(), bucket: 'unsorted', source }] };
    if (target === 'actions') return { ...work, actions: [...work.actions, { id, title: title.trim(), detail: text.trim(), stage: 'todo', reflection: '', source }] };
    return { ...work, comparison: { ...work.comparison, options: [...work.comparison.options, { id, title: text.trim(), source }] } };
}
