// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { emptyWorkspace, workspaceText, cardColumnsOf, type VisualWorkspace } from './visual-tools.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { readingText } from './i18n-reading.ts';

export const notebookFields: Record<string, string> = {
    context: 'lp.field.context', goal: 'lp.field.goal', main_difficulty: 'lp.field.difficulty',
    strengths: 'lp.field.strengths', weaknesses: 'lp.field.weaknesses', notes: 'lp.field.notes',
};
export type PersonalContext = {
    questionnaire_type: string | null;
    limits: { notebook: number; reading: number };
    sources: Record<string, string>;
    notebook: Record<string, string>;
    // «La mia lettura» della compilazione di questa sessione; null se la sessione non ha compilazione.
    reading: { session_id: string; note: string } | null;
};
export const readingLabel = (lang: string) => `${readingText(lang, 'title')} · ${readingText(lang, 'note')}`;
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

export function annotationEntries(data: PersonalContext, t: (key: string) => string, l: (key: string) => string, lang: string): TransferEntry[] {
    const notebook = Object.entries(notebookFields).filter(([key]) => data.notebook[key]?.trim()).map(([key, label]) => ({
        id: `notebook_${key}`, label: `${l('notebook')} · ${t(label)}`, text: data.notebook[key], source: `${l('notebook')} · ${t(label)}`,
    }));
    const reading = data.reading?.note.trim() ? [{
        id: 'reading_note', label: `${readingLabel(lang)} · ${data.questionnaire_type ?? ''}`.trim(), text: data.reading.note,
        source: `${readingLabel(lang)} · ${data.questionnaire_type ?? ''}`.trim().slice(0, 300),
    }] : [];
    return [...notebook, ...reading];
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
    if (target === 'cards') return { ...work, cards: [...work.cards, { id, text: text.trim(), bucket: cardColumnsOf(work)[0].id, source }] };
    if (target === 'actions') return { ...work, actions: [...work.actions, { id, title: title.trim(), detail: text.trim(), stage: 'todo', reflection: '', source }] };
    return { ...work, comparison: { ...work.comparison, options: [...work.comparison.options, { id, title: text.trim(), source }] } };
}
