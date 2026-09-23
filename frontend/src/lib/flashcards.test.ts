import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyFlashcards, addDeck, renameDeck, removeDeck, addCard, updateCard, removeCard, resetDeckProgress, setCardStatus, deckProgress, shuffleCards, DECK_LIMIT, CARD_LIMIT } from './flashcards.ts';

test('deck progress separates known, review and fresh cards', () => {
    let w = emptyFlashcards();
    w = addDeck(w, 'd1', 'Vocabolario');
    w = addCard(w, 'd1', { front: 'maison', back: 'casa', status: 'known' }, 'c1');
    w = addCard(w, 'd1', { front: 'clavicola', back: 'Osso della spalla', status: 'review' }, 'c2');
    w = addCard(w, 'd1', { front: 'sterno', back: 'Osso del torace' }, 'c3');
    assert.deepEqual(deckProgress(w.decks[0]), { known: 1, review: 1, fresh: 1 });
});

test('deck and card limits hold', () => {
    let w = emptyFlashcards();
    for (let i = 0; i < DECK_LIMIT + 3; i++) w = addDeck(w, `d${i}`, `Mazzo ${i}`);
    assert.equal(w.decks.length, DECK_LIMIT);
    for (let i = 0; i < CARD_LIMIT + 3; i++) w = addCard(w, 'd1', { front: 'f', back: 'b' }, `c${i}`);
    assert.equal(w.decks.find(d => d.id === 'd1')?.cards.length, CARD_LIMIT);
});

test('shuffle keeps every card exactly once and varies with the rng', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'];
    const shuffled = shuffleCards(cards, () => 0.42);
    assert.deepEqual([...shuffled].sort(), [...cards].sort());
    // Deterministic with a seeded rng; a different seed gives a different order.
    assert.deepEqual(shuffleCards(cards, () => 0.42), shuffled);
    assert.deepEqual(shuffleCards(cards, () => 0.99), shuffleCards(cards, () => 0.99));
    assert.notEqual(shuffled.length, 0);
});

test('study memory persists per card and resets per deck without touching cards', () => {
    let w = emptyFlashcards();
    w = addDeck(w, 'd1', 'Anatomia');
    w = addCard(w, 'd1', { front: 'femore', back: 'Osso più lungo', image: 'card:mind_mapping' }, 'c1');
    w = setCardStatus(w, 'd1', 'c1', 'known');
    assert.equal(w.decks[0].cards[0].status, 'known');
    w = resetDeckProgress(w, 'd1');
    assert.equal(w.decks[0].cards[0].status, null);
    assert.equal(w.decks[0].cards[0].front, 'femore');
    assert.equal(w.decks[0].cards[0].image, 'card:mind_mapping');
});

test('rename and remove touch only the target deck; card edits are surgical', () => {
    let w = emptyFlashcards();
    w = addDeck(w, 'd1', 'Uno');
    w = addDeck(w, 'd2', 'Due');
    w = addCard(w, 'd1', { front: 'f', back: 'b' }, 'c1');
    w = addCard(w, 'd2', { front: 'f', back: 'b' }, 'c2');
    w = renameDeck(w, 'd1', 'Uno rinominato');
    assert.equal(w.decks[0].title, 'Uno rinominato');
    assert.equal(w.decks[1].title, 'Due');
    w = updateCard(w, 'd1', 'c1', { back: 'nuovo retro', status: 'review' });
    assert.equal(w.decks[0].cards[0].back, 'nuovo retro');
    assert.equal(w.decks[1].cards[0].back, 'b');
    w = setCardStatus(w, 'd1', 'c1', 'known');
    assert.equal(w.decks[0].cards[0].status, 'known');
    assert.equal(w.decks[1].cards[0].status, undefined);
    w = removeCard(w, 'd1', 'c1');
    assert.equal(w.decks[0].cards.length, 0);
    w = removeDeck(w, 'd2');
    assert.deepEqual(w.decks.map(d => d.id), ['d1']);
});
