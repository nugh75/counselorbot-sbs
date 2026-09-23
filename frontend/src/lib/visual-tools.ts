export type ActionStage = 'todo' | 'doing' | 'done';
export type CardBucket = 'unsorted' | 'yes' | 'explore' | 'no';
export type ActionKind = 'activity' | 'book' | 'article' | 'film';
export type CardColumn = { id: string; label?: string };
export type CardDeck = { id: string; title: string; card_columns?: CardColumn[] };
/** Empty card_columns means the default set; preset ids stay localized. */
export const cardColumnPresets: { key: string; columns: CardColumn[] }[] = [
    { key: 'cardPresetSort', columns: [{ id: 'unsorted' }, { id: 'yes' }, { id: 'explore' }, { id: 'no' }] },
    { key: 'cardPresetKanban', columns: [{ id: 'card_todo' }, { id: 'card_doing' }, { id: 'card_done' }] },
    { key: 'cardPresetExplore', columns: [{ id: 'to_explore' }, { id: 'explored' }, { id: 'reflecting' }] },
    { key: 'cardPresetBlank', columns: [{ id: 'col_1', label: 'Colonna 1' }, { id: 'col_2', label: 'Colonna 2' }, { id: 'col_3', label: 'Colonna 3' }] },
];
const defaultCardColumns = cardColumnPresets[0].columns;
export type VisualAction = { kind?: ActionKind; id: string; title: string; detail: string; stage: ActionStage; reflection: string; source: string };
export type ReflectionCard = { id: string; text: string; bucket: string; source: string; image?: string | null; deck_id?: string | null };
export type ComparisonOption = { id: string; title: string; source: string };
export type TimelineEvent = { date_mode?: 'point' | 'period' | null; start_date?: string | null; end_date?: string | null; planned?: string; institution_event?: string | null; institution_available?: boolean; institution_date?: 'start' | 'deadline'; personal_links?: ('notebook' | 'booklet' | 'orientation')[]; id: string; title: string; period: string; tense: 'past' | 'future'; symbol: 'milestone' | 'study' | 'work' | 'change'; reflection: string; source: string; action_ids: string[]; portfolio: { id: number; title: string }[] };
export type Timeline = { title: string; events: TimelineEvent[] };
export type VisualWorkspace = {
    timeline?: Timeline;
    actions: VisualAction[];
    cards: ReflectionCard[];
    card_columns?: CardColumn[];
    card_decks?: CardDeck[];
    active_deck_id?: string | null;
    comparison: {
        options: ComparisonOption[];
        criteria: { id: string; label: string }[];
        cells: { option_id: string; criterion_id: string; note: string }[];
        chosen: string | null;
        reason: string;
    };
};
export type SavedWorkspace = { revision: number; workspace: VisualWorkspace };
export const emptyWorkspace = (): VisualWorkspace => ({ actions: [], cards: [], card_columns: [], card_decks: [], active_deck_id: null, comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' } });

export const DEFAULT_DECK_ID = 'default';

/** Deck presets offered by the creation dialog; each fixes its column set
    (empty labels keep the localized preset name, renamable after creation). */
export type DeckType = 'flashcard' | 'kanban' | 'reflection' | 'exploration' | 'prosCons' | 'questions';

export const deckTypeColumns: Record<DeckType, CardColumn[]> = {
    flashcard: [{ id: 'fronte' }, { id: 'retro' }],
    kanban: [{ id: 'card_todo' }, { id: 'card_doing' }, { id: 'card_done' }],
    reflection: [{ id: 'unsorted' }, { id: 'yes' }, { id: 'explore' }, { id: 'no' }],
    exploration: [{ id: 'to_explore' }, { id: 'explored' }, { id: 'reflecting' }],
    prosCons: [{ id: 'pro' }, { id: 'con' }],
    questions: [{ id: 'question' }, { id: 'answer' }],
};

/** Returns all decks in the workspace. If no decks are explicitly saved, returns a default deck. */
export function cardDecksOf(w: VisualWorkspace, defaultTitle: string = 'Mazzo principale'): CardDeck[] {
    if (w.card_decks && w.card_decks.length > 0) return w.card_decks;
    return [{ id: DEFAULT_DECK_ID, title: defaultTitle, card_columns: w.card_columns }];
}

/** Returns the active deck ID, defaulting to the first available deck. */
export function activeDeckIdOf(w: VisualWorkspace): string {
    const decks = cardDecksOf(w);
    if (w.active_deck_id && decks.some(d => d.id === w.active_deck_id)) {
        return w.active_deck_id;
    }
    return decks[0].id;
}

/** Adds a new card deck. If migrating from no decks, includes the default deck too. */
export function addCardDeck(w: VisualWorkspace, title: string, defaultTitle: string = 'Mazzo principale', initialCards?: { text: string; image?: string | null; bucket?: string }[], initialColumns?: CardColumn[]): VisualWorkspace {
    const currentDecks = cardDecksOf(w, defaultTitle);
    if (currentDecks.length >= 20) return w;
    const newDeck: CardDeck = {
        id: crypto.randomUUID(),
        title: title.trim().slice(0, 100),
        card_columns: initialColumns,
    };
    const columns = initialColumns?.length ? initialColumns : cardColumnsOf(w);
    const defaultCol = columns[0]?.id || 'unsorted';
    const newCards: ReflectionCard[] = (initialCards || []).map(c => ({
        id: crypto.randomUUID(),
        text: c.text,
        bucket: c.bucket || defaultCol,
        source: '',
        image: c.image || null,
        deck_id: newDeck.id,
    }));
    return {
        ...w,
        card_decks: [...currentDecks, newDeck],
        active_deck_id: newDeck.id,
        cards: [...w.cards, ...newCards],
    };
}

/** Renames a deck by its ID. */
export function renameCardDeck(w: VisualWorkspace, id: string, title: string, defaultTitle: string = 'Mazzo principale'): VisualWorkspace {
    const currentDecks = cardDecksOf(w, defaultTitle);
    return {
        ...w,
        card_decks: currentDecks.map(d => d.id === id ? { ...d, title: title.trim().slice(0, 100) } : d),
    };
}

/** Removes a deck and moves all its cards to the default/fallback deck. */
export function removeCardDeck(w: VisualWorkspace, id: string, defaultTitle: string = 'Mazzo principale'): VisualWorkspace {
    const currentDecks = cardDecksOf(w, defaultTitle);
    if (currentDecks.length <= 1) return w;
    const remaining = currentDecks.filter(d => d.id !== id);
    const fallbackId = remaining[0].id;
    const nextActive = (w.active_deck_id === id) ? fallbackId : (w.active_deck_id || fallbackId);
    return {
        ...w,
        card_decks: remaining,
        active_deck_id: nextActive,
        cards: w.cards.map(c => {
            const cardDeck = c.deck_id || DEFAULT_DECK_ID;
            return cardDeck === id ? { ...c, deck_id: fallbackId } : c;
        }),
    };
}

/** Switches the active deck. */
export function setActiveCardDeck(w: VisualWorkspace, id: string): VisualWorkspace {
    return { ...w, active_deck_id: id };
}

/** Returns cards belonging to a given deck (cards with no deck_id belong to DEFAULT_DECK_ID). */
export function cardsInDeck(w: VisualWorkspace, deckId: string): ReflectionCard[] {
    return w.cards.filter(c => (c.deck_id || DEFAULT_DECK_ID) === deckId);
}

/** Effective card columns for a deck (or active deck): deck-specific if present, otherwise workspace-level or default. */
export function cardColumnsOf(w: VisualWorkspace, deckId?: string | null): CardColumn[] {
    const targetDeckId = deckId !== undefined ? deckId : activeDeckIdOf(w);
    if (targetDeckId) {
        const deck = w.card_decks?.find(d => d.id === targetDeckId);
        if (deck?.card_columns?.length) return deck.card_columns;
        if (targetDeckId === DEFAULT_DECK_ID && w.card_columns?.length) return w.card_columns;
    }
    return w.card_columns?.length ? w.card_columns : defaultCardColumns;
}
/** Student text wins over the localized preset label. */
export function cardColumnLabel(w: VisualWorkspace, column: CardColumn, label: (key: string) => string): string {
    return column.label || label(column.id);
}
/** Replaces the column set for a deck (or active deck); cards in that deck outside it return to the first column. */
export function setCardColumns(w: VisualWorkspace, columns: CardColumn[], deckId?: string | null): VisualWorkspace {
    const targetDeckId = deckId !== undefined ? deckId : activeDeckIdOf(w);
    const ids = new Set(columns.map(c => c.id));
    const firstColId = columns[0]?.id || 'unsorted';

    // If deck-specific decks are used:
    if (w.card_decks && w.card_decks.length > 0 && targetDeckId) {
        const updatedDecks = w.card_decks.map(d => d.id === targetDeckId ? { ...d, card_columns: columns } : d);
        return {
            ...w,
            card_decks: updatedDecks,
            cards: w.cards.map(c => {
                const cardDeckId = c.deck_id || DEFAULT_DECK_ID;
                if (cardDeckId === targetDeckId && !ids.has(c.bucket)) {
                    return { ...c, bucket: firstColId };
                }
                return c;
            }),
        };
    }

    // Default / single-deck fallback
    return {
        ...w,
        card_columns: columns,
        cards: w.cards.map(c => ids.has(c.bucket) ? c : { ...c, bucket: firstColId }),
    };
}
export function renameCardColumn(w: VisualWorkspace, id: string, name: string, deckId?: string | null): VisualWorkspace {
    const targetDeckId = deckId !== undefined ? deckId : activeDeckIdOf(w);
    const updated = cardColumnsOf(w, targetDeckId).map(c => c.id === id ? { ...c, label: name } : c);
    return setCardColumns(w, updated, targetDeckId);
}
export function removeCardColumn(w: VisualWorkspace, id: string, deckId?: string | null): VisualWorkspace {
    const targetDeckId = deckId !== undefined ? deckId : activeDeckIdOf(w);
    const current = cardColumnsOf(w, targetDeckId);
    if (current.length <= 1) return w;
    const remaining = current.filter(c => c.id !== id);
    return setCardColumns(w, remaining, targetDeckId);
}
export function addCardColumn(w: VisualWorkspace, name: string, deckId?: string | null): VisualWorkspace {
    const targetDeckId = deckId !== undefined ? deckId : activeDeckIdOf(w);
    const current = cardColumnsOf(w, targetDeckId);
    if (current.length >= 8) return w;
    return setCardColumns(w, [...current, { id: crypto.randomUUID(), label: name }], targetDeckId);
}

export function removeAction(w: VisualWorkspace, id: string): VisualWorkspace {
    return { ...w, actions: w.actions.filter(a => a.id !== id), ...(w.timeline ? {
        timeline: { ...w.timeline, events: w.timeline.events.map(e => ({ ...e, action_ids: e.action_ids.filter(a => a !== id) })) },
    } : {}) };
}

export function timelineText(w: VisualWorkspace, label: (key: string) => string, selected?: string[]): string {
    const timeline = w.timeline;
    if (!timeline?.events.length) return '';
    return [label('timeline') + ' — ' + timeline.title, ...timeline.events.filter(e => !selected || selected.includes(e.id)).map(e =>
        [e.period + (e.date_mode ? '' : ' — ' + label(e.tense)) + ': ' + e.title, e.planned && label('planned') + ': ' + e.planned, e.reflection && label('diary') + ': ' + e.reflection,
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
    if (w.cards.length) parts.push(label('cards'), ...w.cards.map(c => {
        const deckCols = cardColumnsOf(w, c.deck_id);
        const column = deckCols.find(item => item.id === c.bucket);
        return (column?.label || label(c.bucket)) + ': ' + c.text + (c.source ? '\n' + label('source') + ': ' + c.source : '');
    }));
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
