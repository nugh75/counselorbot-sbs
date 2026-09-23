// Personal flashcards: student-owned decks of front/back cards with a
// per-card study memory (known / to review). Pure logic, no UI.
export type FlashcardStatus = 'known' | 'review';
export type Flashcard = { id: string; front: string; back: string; image?: string | null; status?: FlashcardStatus | null };
export type FlashcardDeck = { id: string; title: string; cards: Flashcard[] };
export type FlashcardWorkspace = { decks: FlashcardDeck[] };
export type SavedFlashcards = { revision: number; workspace: FlashcardWorkspace };

export const DECK_LIMIT = 20;
export const CARD_LIMIT = 200;

export const emptyFlashcards = (): FlashcardWorkspace => ({ decks: [] });

/** Study-memory counts of a deck: known, to review and never studied. */
export function deckProgress(deck: FlashcardDeck): { known: number; review: number; fresh: number } {
    const counts = { known: 0, review: 0, fresh: 0 };
    for (const card of deck.cards) {
        if (card.status === 'known') counts.known += 1;
        else if (card.status === 'review') counts.review += 1;
        else counts.fresh += 1;
    }
    return counts;
}

/** Fisher-Yates shuffle so each study session walks the deck in a new order. */
export function shuffleCards<T>(cards: T[], rng: () => number = Math.random): T[] {
    const order = [...cards];
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

export function addDeck(w: FlashcardWorkspace, id: string, title: string): FlashcardWorkspace {
    if (w.decks.length >= DECK_LIMIT) return w;
    return { decks: [...w.decks, { id, title: title.trim().slice(0, 100), cards: [] }] };
}

export function renameDeck(w: FlashcardWorkspace, deckId: string, title: string): FlashcardWorkspace {
    return { ...w, decks: w.decks.map(d => d.id === deckId ? { ...d, title: title.trim().slice(0, 100) } : d) };
}

/** Removes a deck outright: its cards exist only inside it. */
export function removeDeck(w: FlashcardWorkspace, deckId: string): FlashcardWorkspace {
    return { ...w, decks: w.decks.filter(d => d.id !== deckId) };
}

/** Clears the study memory of a deck without touching the cards. */
export function resetDeckProgress(w: FlashcardWorkspace, deckId: string): FlashcardWorkspace {
    return { ...w, decks: w.decks.map(d => d.id === deckId ? { ...d, cards: d.cards.map(c => ({ ...c, status: null })) } : d) };
}

export function addCard(w: FlashcardWorkspace, deckId: string, card: Omit<Flashcard, 'id'>, newId: string): FlashcardWorkspace {
    return {
        ...w,
        decks: w.decks.map(d => d.id === deckId
            ? (d.cards.length >= CARD_LIMIT ? d : { ...d, cards: [...d.cards, { ...card, id: newId }] })
            : d),
    };
}

export function updateCard(w: FlashcardWorkspace, deckId: string, cardId: string, patch: Partial<Omit<Flashcard, 'id'>>): FlashcardWorkspace {
    return {
        ...w,
        decks: w.decks.map(d => d.id === deckId
            ? { ...d, cards: d.cards.map(c => c.id === cardId ? { ...c, ...patch } : c) }
            : d),
    };
}

export function removeCard(w: FlashcardWorkspace, deckId: string, cardId: string): FlashcardWorkspace {
    return { ...w, decks: w.decks.map(d => d.id === deckId ? { ...d, cards: d.cards.filter(c => c.id !== cardId) } : d) };
}

/** A card answer moves only its own status: it never changes the deck order. */
export function setCardStatus(w: FlashcardWorkspace, deckId: string, cardId: string, status: FlashcardStatus): FlashcardWorkspace {
    return updateCard(w, deckId, cardId, { status });
}
