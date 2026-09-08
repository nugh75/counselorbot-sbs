export type ActionStage = 'todo' | 'doing' | 'done';
export type CardBucket = 'unsorted' | 'yes' | 'explore' | 'no';
export type ActionKind = 'activity' | 'book' | 'article' | 'film';
export type VisualAction = { kind?: ActionKind; id: string; title: string; detail: string; stage: ActionStage; reflection: string; source: string };
export type ReflectionCard = { id: string; text: string; bucket: CardBucket; source: string };
export type ComparisonOption = { id: string; title: string; source: string };
export type TimelineEvent = { id: string; title: string; period: string; tense: 'past' | 'future'; symbol: 'milestone' | 'study' | 'work' | 'change'; reflection: string; source: string; action_ids: string[]; portfolio: { id: number; title: string }[] };
export type Timeline = { title: string; events: TimelineEvent[] };
export type VisualWorkspace = {
    timeline?: Timeline;
    actions: VisualAction[];
    cards: ReflectionCard[];
    comparison: {
        options: ComparisonOption[];
        criteria: { id: string; label: string }[];
        cells: { option_id: string; criterion_id: string; note: string }[];
        chosen: string | null;
        reason: string;
    };
};
export type SavedWorkspace = { revision: number; workspace: VisualWorkspace };
export const emptyWorkspace = (): VisualWorkspace => ({ actions: [], cards: [], comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' } });

export function removeAction(w: VisualWorkspace, id: string): VisualWorkspace {
    return { ...w, actions: w.actions.filter(a => a.id !== id), ...(w.timeline ? {
        timeline: { ...w.timeline, events: w.timeline.events.map(e => ({ ...e, action_ids: e.action_ids.filter(a => a !== id) })) },
    } : {}) };
}

export function timelineText(w: VisualWorkspace, label: (key: string) => string, selected?: string[]): string {
    const timeline = w.timeline;
    if (!timeline?.events.length) return '';
    return [label('timeline') + ' — ' + timeline.title, ...timeline.events.filter(e => !selected || selected.includes(e.id)).map(e =>
        [e.period + ' — ' + label(e.tense) + ': ' + e.title, e.reflection,
            ...e.action_ids.map(id => { const action = w.actions.find(a => a.id === id); return label('board') + ': ' + (action ? (action.kind && action.kind !== 'activity' ? label(action.kind) + ': ' : '') + action.title + ' — ' + label(action.stage) : label('unavailable')); }),
            ...e.portfolio.map(p => label('linkPortfolio') + ': ' + (p.title || label('unavailable')))].filter(Boolean).join('\n'))].join('\n\n');
}

export function moveTimelineEvent(w: VisualWorkspace, id: string, offset: number): VisualWorkspace {
    if (!w.timeline) return w;
    const events = [...w.timeline.events];
    const index = events.findIndex(e => e.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= events.length) return w;
    [events[index], events[target]] = [events[target], events[index]];
    return { ...w, timeline: { ...w.timeline, events } };
}

export function removeOption(workspace: VisualWorkspace, id: string): VisualWorkspace {
    const c = workspace.comparison;
    return { ...workspace, comparison: { ...c, options: c.options.filter(item => item.id !== id),
        cells: c.cells.filter(cell => cell.option_id !== id), chosen: c.chosen === id ? null : c.chosen } };
}
export function removeCriterion(workspace: VisualWorkspace, id: string): VisualWorkspace {
    const c = workspace.comparison;
    return { ...workspace, comparison: { ...c, criteria: c.criteria.filter(item => item.id !== id), cells: c.cells.filter(cell => cell.criterion_id !== id) } };
}
export function setCell(workspace: VisualWorkspace, option_id: string, criterion_id: string, note: string): VisualWorkspace {
    const c = workspace.comparison;
    return { ...workspace, comparison: { ...c, cells: [...c.cells.filter(cell => cell.option_id !== option_id || cell.criterion_id !== criterion_id), ...(note ? [{ option_id, criterion_id, note }] : [])] } };
}

/** Only explicit student work goes back to the composer; never private instructions. */
export function workspaceText(w: VisualWorkspace, label: (key: string) => string): string {
    const parts = [label('handoff')];
    if (w.actions.length) parts.push(label('board'), ...w.actions.map(a =>
        [a.title + ' — ' + label(a.stage), a.detail, a.reflection && label('reflection') + ': ' + a.reflection, a.source && label('source') + ': ' + a.source].filter(Boolean).join('\n')));
    if (w.cards.length) parts.push(label('cards'), ...w.cards.map(c => label(c.bucket) + ': ' + c.text + (c.source ? '\n' + label('source') + ': ' + c.source : '')));
    if (w.comparison.options.length) {
        const c = w.comparison;
        parts.push(label('comparison'), ...c.options.map(o => [o.title, ...c.criteria.map(k => k.label + ': ' + (c.cells.find(cell => cell.option_id === o.id && cell.criterion_id === k.id)?.note || '—')), o.source && label('source') + ': ' + o.source].filter(Boolean).join('\n')));
        if (c.chosen) parts.push(label('choice') + ': ' + c.options.find(o => o.id === c.chosen)?.title);
        if (c.reason) parts.push(label('reason') + ': ' + c.reason);
    }
    const timeline = timelineText(w, label);
    if (timeline) parts.push(timeline);
    return parts.join('\n\n');
}
