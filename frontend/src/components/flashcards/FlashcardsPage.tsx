'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, FolderPlus, GraduationCap, Image as ImageIcon, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { flashcardLabel } from '@/lib/i18n-flashcards';
import { BUILTIN_CARD_IMAGES, tavoloImageUrl } from '@/lib/tavolo-images';
import { InlineRename } from '@/components/ui/InlineRename';
import { addCard, addDeck, deckProgress, emptyFlashcards, removeCard, removeDeck, renameDeck, resetDeckProgress, setCardStatus, shuffleCards, updateCard, type Flashcard, type FlashcardDeck, type FlashcardStatus, type FlashcardWorkspace, type SavedFlashcards } from '@/lib/flashcards';

const inputClass = 'w-full min-w-0 rounded-control border border-line-strong bg-surface px-4 py-2 text-[15px] text-ink';
const buttonClass = 'h-control w-control shrink-0 p-0';
const FRONT_MAX = 300;
const BACK_MAX = 600;

type StudySession = { deckId: string; order: string[]; index: number; flipped: boolean; known: number; review: number };

export function FlashcardsPage() {
    const { lang } = useI18n();
    const l = (key: string) => flashcardLabel(lang, key);
    const id = useId();
    const [saved, setSaved] = useState<SavedFlashcards>({ revision: 0, workspace: emptyFlashcards() });
    const [work, setWork] = useState<FlashcardWorkspace>(emptyFlashcards);
    const [loaded, setLoaded] = useState(false);
    const [issue, setIssue] = useState('');
    const [view, setView] = useState<'list' | 'deck'>('list');
    const [openDeckId, setOpenDeckId] = useState<string | null>(null);
    const [study, setStudy] = useState<StudySession | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deckName, setDeckName] = useState('');
    // F23 (lotto 4): rinomina in linea al posto del prompt nativo del browser.
    const [renamingDeck, setRenamingDeck] = useState(false);
    const [draftFront, setDraftFront] = useState('');
    const [draftBack, setDraftBack] = useState('');
    const [draftImage, setDraftImage] = useState('');
    const [pickingImageId, setPickingImageId] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);
    // Latest values for the serialized auto-save, updated after each commit.
    const workRef = useRef(work);
    const savedRef = useRef(saved);
    useLayoutEffect(() => {
        workRef.current = work;
        savedRef.current = saved;
    });
    const saveChain = useRef<Promise<void>>(Promise.resolve());
    const dirty = JSON.stringify(work) !== JSON.stringify(saved.workspace);

    useEffect(() => { document.title = `${flashcardLabel(lang, 'title')} - CounselorBot`; }, [lang]);

    const load = useCallback(async () => {
        setIssue('');
        try {
            const response = await apiFetch('/api/user/flashcards', { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error();
            const state: SavedFlashcards = await response.json();
            setSaved(state); setWork(state.workspace); setLoaded(true);
        } catch { setIssue('loadError'); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const doSave = useCallback(async () => {
        const payload = workRef.current;
        if (JSON.stringify(payload) === JSON.stringify(savedRef.current.workspace)) return;
        setIssue('');
        try {
            const response = await apiFetch('/api/user/flashcards', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision: savedRef.current.revision, workspace: payload }),
            });
            if (response.status === 409) { setIssue('conflict'); return; }
            if (!response.ok) throw new Error();
            const state: SavedFlashcards = await response.json();
            setSaved(state);
        } catch { setIssue('saveError'); }
    }, []);
    // Auto-save: edits persist on their own about a second after the last
    // change; saves are serialized so a stale revision never races itself.
    useEffect(() => {
        if (!loaded || !dirty) return;
        const timer = window.setTimeout(() => { saveChain.current = saveChain.current.then(() => doSave()).catch(() => { }); }, 1000);
        return () => window.clearTimeout(timer);
    }, [work, saved, dirty, loaded, doSave]);
    useEffect(() => {
        if (!dirty) return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [dirty]);

    const edit = useCallback((update: (current: FlashcardWorkspace) => FlashcardWorkspace) => setWork(update), []);
    const openDeck = (deck: FlashcardDeck) => { setOpenDeckId(deck.id); setView('deck'); setStudy(null); };
    // Opening a deck goes straight into study mode: the full card list (with
    // the backs) stays hidden behind the explicit “Edit” action.
    const openDeckForStudy = (deck: FlashcardDeck) => {
        if (!deck.cards.length) { openDeck(deck); return; }
        openDeck(deck); startStudy(deck);
    };
    const currentDeck = work.decks.find(d => d.id === openDeckId) ?? null;
    const openDeckObj = work.decks.find(d => d.id === openDeckId);
    const startStudy = (deck: FlashcardDeck, onlyReview = false) => {
        const cards = onlyReview ? deck.cards.filter(c => c.status === 'review') : deck.cards;
        if (!cards.length) return;
        setStudy({ deckId: deck.id, order: shuffleCards(cards.map(c => c.id)), index: 0, flipped: false, known: 0, review: 0 });
    };
    const studyDeck = study ? work.decks.find(d => d.id === study.deckId) ?? null : null;
    const studyCard = study && studyDeck ? studyDeck.cards.find(c => c.id === study.order[study.index]) ?? null : null;
    const answer = useCallback((status: FlashcardStatus) => {
        if (!study || !studyCard) return;
        edit(current => setCardStatus(current, study.deckId, studyCard.id, status));
        setStudy(previous => previous ? { ...previous, index: previous.index + 1, flipped: false, known: previous.known + (status === 'known' ? 1 : 0), review: previous.review + (status === 'review' ? 1 : 0) } : previous);
    }, [study, studyCard, edit]);
    useEffect(() => {
        if (!study) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); setStudy(null); return; }
            if (event.key === ' ') { event.preventDefault(); setStudy(previous => previous ? { ...previous, flipped: !previous.flipped } : previous); return; }
            if (!study.flipped) return;
            if (event.key === 'ArrowLeft') { event.preventDefault(); answer('review'); }
            else if (event.key === 'ArrowRight') { event.preventDefault(); answer('known'); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [study, answer]);

    const applyImage = (imageId: string | null) => {
        if (pickingImageId === 'draft') setDraftImage(imageId || '');
        else if (pickingImageId) edit(current => updateCard(current, openDeckId!, pickingImageId, { image: imageId }));
        setPickingImageId(null);
    };
    const removeButton = (id: string, name: string, action: () => void, labelKey = 'deleteDeck') => confirming === id
        ? <ConfirmInline question={`${l(labelKey)}: "${name}"?`} onConfirm={() => { setConfirming(null); action(); }} onCancel={() => setConfirming(null)} />
        : <Tooltip content={`${l(labelKey)}: "${name}"`}><Button type="button" variant="ghost" className={buttonClass} aria-label={`${l(labelKey)}: "${name}"`} onClick={() => setConfirming(id)}><Trash2 className="h-4 w-4 text-danger" aria-hidden="true" /></Button></Tooltip>;

    return <main className="page-narrow space-y-4 p-4">
        <PersonalAreaHeader slug="flashcard" />
        {issue && <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">
            <p>{l(issue)}</p>
            {issue === 'conflict' && <Button type="button" variant="secondary" className="mt-2 min-h-control px-4" onClick={() => void load()}><RotateCcw className="mr-1 inline h-4 w-4" aria-hidden="true" />{l('reload')}</Button>}
        </div>}

        {view === 'list' && <section aria-label={l('myDecks')} className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 font-semibold text-ink"><GraduationCap className="h-4 w-4 text-link" aria-hidden="true" />{l('myDecks')}</h2>
                <Tooltip content={l('newDeck')}><Button type="button" variant="secondary" className="min-h-control gap-2 px-4" aria-label={l('newDeck')} disabled={work.decks.length >= 20} onClick={() => { setDeckName(''); setDialogOpen(true); }}><FolderPlus className="h-4 w-4" aria-hidden="true" />{l('newDeck')}</Button></Tooltip>
            </div>
            {work.decks.length === 0 ? <p className="rounded-card border border-line bg-surface-sunken p-6 text-center text-ink-muted">{l('emptyDecks')}</p> : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {work.decks.map(deck => {
                        const progress = deckProgress(deck);
                        return <article key={deck.id} className="flex flex-col rounded-card border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-card">
                            <button type="button" className="min-h-control text-left" aria-label={`${l('study')}: ${deck.title}`} onClick={() => openDeckForStudy(deck)}>
                                <h3 className="break-words font-semibold text-ink">{deck.title} <span className="font-mono text-sm text-ink-muted">{deck.cards.length}</span></h3>
                                <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><span className="inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" aria-hidden="true" /><span className="sr-only">{l('knownLabel')}</span>{progress.known}</span> · <span className="inline-flex items-center gap-1 text-warning"><RotateCcw className="h-3 w-3" aria-hidden="true" /><span className="sr-only">{l('reviewLabel')}</span>{progress.review}</span> · {progress.fresh}</p>
                            </button>
                            <div className="mt-2 flex flex-wrap items-center gap-2 self-end">
                                <Tooltip content={l('study')}><Button type="button" variant="secondary" className="min-h-control gap-1 px-4" aria-label={`${l('study')}: ${deck.title}`} disabled={!deck.cards.length} onClick={() => { openDeck(deck); startStudy(deck); }}>{l('study')}</Button></Tooltip>
                                <Tooltip content={l('editDeck')}><Button type="button" variant="ghost" className="h-control w-control p-0" aria-label={`${l('editDeck')}: ${deck.title}`} onClick={() => openDeck(deck)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                {removeButton(`deck:${deck.id}`, deck.title, () => { edit(current => removeDeck(current, deck.id)); setStudy(null); })}
                            </div>
                        </article>;
                    })}
                </div>
            )}
        </section>}

        {view === 'deck' && currentDeck && <section aria-label={currentDeck.title} className="space-y-4">
            {study ? <StudyView study={study} deck={studyDeck} card={studyCard} onFlip={() => setStudy(s => s ? { ...s, flipped: true } : s)} onAnswer={answer} onExit={() => setStudy(null)} onRestart={() => { const deck = work.decks.find(d => d.id === study.deckId); if (deck) startStudy(deck, true); }} /> : <>
                <div className="flex flex-wrap items-center gap-2">
                    <Tooltip content={l('backToDecks')}><Button type="button" variant="secondary" className={buttonClass} aria-label={l('backToDecks')} onClick={() => { setView('list'); setOpenDeckId(null); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                    {renamingDeck && <InlineRename value={currentDeck.title} maxLength={100} ariaLabel={l('renameDeck')} onRename={name => { edit(current => renameDeck(current, currentDeck.id, name)); setRenamingDeck(false); }} onCancel={() => setRenamingDeck(false)} />}
                        {!renamingDeck && <h2 className="min-w-0 break-words font-semibold text-ink">{currentDeck.title} <span className="font-mono text-sm text-ink-muted">{currentDeck.cards.length}</span></h2>}
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                        <Tooltip content={l('study')}><Button type="button" variant="secondary" className="min-h-control gap-2 px-4" aria-label={l('study')} disabled={!currentDeck.cards.length} onClick={() => startStudy(currentDeck)}>{l('study')}</Button></Tooltip>
                        {confirming === `reset:${currentDeck.id}`
                            ? <ConfirmInline question={`${l('resetProgress')}: "${currentDeck.title}"?`} onConfirm={() => { setConfirming(null); edit(current => resetDeckProgress(current, currentDeck.id)); }} onCancel={() => setConfirming(null)} />
                            : <Tooltip content={l('resetProgress')}><Button type="button" variant="secondary" className={buttonClass} aria-label={l('resetProgress')} disabled={!currentDeck.cards.length} onClick={() => setConfirming(`reset:${currentDeck.id}`)}><RotateCcw className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>}
                        <Tooltip content={l('renameDeck')}><Button type="button" variant="ghost" className={buttonClass} aria-label={l('renameDeck')} onClick={() => setRenamingDeck(previous => !previous)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                        {work.decks.length > 1 && removeButton(`deck:${currentDeck.id}`, currentDeck.title, () => { edit(current => removeDeck(current, currentDeck.id)); setView('list'); setOpenDeckId(null); })}
                    </div>
                </div>
                <details open={!currentDeck.cards.length || Boolean(draftFront)} className="rounded-card border border-line bg-surface-sunken p-4"><summary className="min-h-control cursor-pointer py-4 text-link">{l('addCard')}</summary>
                    <form className="space-y-2 rounded-card border border-line bg-surface-sunken p-4" onSubmit={event => {
                        event.preventDefault();
                        if (!draftFront.trim() || !draftBack.trim()) return;
                        edit(current => addCard(current, currentDeck.id, { front: draftFront.trim(), back: draftBack.trim(), image: draftImage || null }, crypto.randomUUID()));
                        setDraftFront(''); setDraftBack(''); setDraftImage('');
                    }}>
                        <label className="block text-sm">{l('frontLabel')}<textarea required maxLength={FRONT_MAX} rows={2} value={draftFront} onChange={e => setDraftFront(e.target.value)} className={`${inputClass} mt-1`} /></label>
                        <label className="block text-sm">{l('backLabel')}<textarea required maxLength={BACK_MAX} rows={3} value={draftBack} onChange={e => setDraftBack(e.target.value)} className={`${inputClass} mt-1`} /></label>
                        <div className="flex flex-wrap items-center gap-4">
                            {draftImage ? (
                                <div className="flex items-center gap-4">
                                    <button type="button" onClick={() => setPickingImageId('draft')} className="flex h-14 w-14 items-center justify-center rounded-lg border border-line bg-surface-sunken p-1 hover:border-brand" title={l('changeImage')} aria-label={l('changeImage')}>
                                        <img src={tavoloImageUrl(draftImage)} alt="" className="max-h-full max-w-full object-contain" />
                                    </button>
                                    <Button type="button" variant="ghost" className="h-control w-control p-0" aria-label={l('removeImage')} onClick={() => setDraftImage('')}><X className="h-4 w-4" aria-hidden="true" /></Button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => setPickingImageId('draft')} className="flex min-h-control items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-4 text-sm text-ink-muted hover:border-brand-line hover:text-link" aria-label={l('addImage')}><ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />{l('addImage')}</button>
                            )}
                            <Tooltip content={l('addCard')}><Button aria-label={l('addCard')} type="submit" className={buttonClass} disabled={!draftFront.trim() || !draftBack.trim() || currentDeck.cards.length >= 200}><Plus className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                        </div>
                        {currentDeck.cards.length >= 200 && <p role="status" className="text-sm text-ink-muted">{l('limit')}</p>}
                    </form>
                </details>
                {!currentDeck.cards.length ? <p className="py-6 text-center text-ink-muted">{l('emptyDeck')}</p> : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{currentDeck.cards.map(card => <article key={card.id} className="group/card flex flex-col rounded-card border border-line bg-surface p-4 shadow-card">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => edit(current => updateCard(current, currentDeck.id, card.id, { status: card.status === 'known' ? 'review' : card.status === 'review' ? null : 'known' }))} aria-label={l('statusNone')}
                                className={`inline-flex min-h-control items-center gap-1 rounded-full px-2 py-1 text-xs ${card.status === 'known' ? 'bg-success-soft text-success-ink' : card.status === 'review' ? 'bg-warning-soft text-warning-ink' : 'bg-surface-raised text-ink-muted'}`}>
                                {card.status === 'known' ? <><Check className="h-3 w-3" aria-hidden="true" />{l('knownLabel')}</> : card.status === 'review' ? <><RotateCcw className="h-3 w-3" aria-hidden="true" />{l('reviewLabel')}</> : l('statusNone')}
                            </button>
                            <div className="flex items-center gap-1">
                                <button type="button" onClick={() => setPickingImageId(card.id)} className="flex h-control w-control items-center justify-center rounded-lg border border-line bg-surface-sunken text-ink-muted hover:border-brand-line hover:text-link" aria-label={card.image ? l('changeImage') : l('addImage')} title={card.image ? l('changeImage') : l('addImage')}>
                                    {card.image ? <img src={tavoloImageUrl(card.image)} alt="" className="h-6 w-6 object-contain" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
                                </button>
                                {removeButton(`card:${card.id}`, card.front, () => edit(current => removeCard(current, currentDeck.id, card.id)), 'deleteCard')}
                            </div>
                        </div>
                        <label className="block text-sm">{l('frontLabel')}<textarea maxLength={FRONT_MAX} rows={2} value={card.front} onChange={e => edit(current => updateCard(current, currentDeck.id, card.id, { front: e.target.value }))} className={`${inputClass} mt-1`} /></label>
                        <label className="mt-2 block text-sm">{l('backLabel')}<textarea maxLength={BACK_MAX} rows={3} value={card.back} onChange={e => edit(current => updateCard(current, currentDeck.id, card.id, { back: e.target.value }))} className={`${inputClass} mt-1`} /></label>
                    </article>)}</div>
                )}
            </>}
        </section>}

        {dialogOpen && createPortal(
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setDialogOpen(false)}>
                <div role="dialog" aria-modal="true" aria-labelledby={`${id}-new-deck`} className="w-full max-w-md rounded-card bg-surface p-6 shadow-pop" onClick={e => e.stopPropagation()}>
                    <div className="mb-4 flex items-center justify-between">
                        <h2 id={`${id}-new-deck`} className="text-base font-semibold text-ink">{l('newDeck')}</h2>
                        <Button type="button" variant="ghost" className="h-control w-control p-0" aria-label={l('deckCancel')} onClick={() => setDialogOpen(false)}><X className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                    <label className="block text-sm text-ink-body" htmlFor={`${id}-deck-name`}>{l('deckName')}</label>
                    <input id={`${id}-deck-name`} type="text" maxLength={100} value={deckName} onChange={e => setDeckName(e.target.value)} onKeyDown={e => {
                        if (e.key === 'Enter' && deckName.trim()) { edit(current => addDeck(current, crypto.randomUUID(), deckName.trim())); setDeckName(''); setDialogOpen(false); }
                    }} className={`${inputClass} mt-1`} />
                    <div className="mt-6 flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>{l('deckCancel')}</Button>
                        <Button type="button" disabled={!deckName.trim()} onClick={() => { edit(current => addDeck(current, crypto.randomUUID(), deckName.trim())); setDeckName(''); setDialogOpen(false); }}>{l('deckCreate')}</Button>
                    </div>
                </div>
            </div>, document.body)}

        {pickingImageId && createPortal(
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setPickingImageId(null)}>
                <div role="dialog" aria-modal="true" aria-labelledby={`${id}-pick-image`} className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-modal" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-line px-6 py-4">
                        <h2 id={`${id}-pick-image`} className="text-base font-semibold text-ink">{l('selectImage')}</h2>
                        <Button type="button" variant="ghost" className="h-control w-control p-0" aria-label={l('deckCancel')} onClick={() => setPickingImageId(null)}><X className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                    <div className="grid gap-4 overflow-y-auto p-6 sm:grid-cols-3 lg:grid-cols-4">
                        {BUILTIN_CARD_IMAGES.map(entry => (
                            <button key={entry.id} type="button" className="rounded-card border border-line bg-surface p-2 text-left transition-colors hover:border-brand hover:bg-brand-soft/40" onClick={() => applyImage(entry.id)}>
                                <img src={tavoloImageUrl(entry.id)} alt="" className="mx-auto h-20 w-full object-contain" />
                                <span className="mt-1 block text-xs font-semibold text-ink">{entry.name}</span>
                                <span className="block text-[11px] leading-snug text-ink-muted">{entry.usage}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>, document.body)}
    </main>;
}


function StudyView({ study, deck, card, onFlip, onAnswer, onExit, onRestart }: {
    study: StudySession;
    deck: FlashcardDeck | null;
    card: Flashcard | null;
    onFlip: () => void;
    onAnswer: (status: FlashcardStatus) => void;
    onExit: () => void;
    onRestart: () => void;
}) {
    const { lang } = useI18n();
    const l = (key: string) => flashcardLabel(lang, key);
    const total = study.order.length;
    const done = !deck || !card || study.index >= total;
    const reviewLeft = deck?.cards.filter(c => c.status === 'review') ?? [];

    if (done) {
        return <section className="rounded-card border border-line bg-surface p-6 text-center shadow-card">
            <h3 className="text-lg font-semibold text-ink">{l('sessionDone')}</h3>
            <p className="mt-4 flex items-center justify-center gap-6 text-sm">
                <span className="inline-flex items-center gap-1 text-success"><Check className="h-4 w-4" aria-hidden="true" />{l('knownLabel')}: {study.known}</span>
                <span className="inline-flex items-center gap-1 text-warning"><RotateCcw className="h-4 w-4" aria-hidden="true" />{l('reviewLabel')}: {study.review}</span>
            </p>
            {reviewLeft.length > 0 && <p className="mt-2 break-words text-sm text-ink-muted">{l('reviewLabel')}: {reviewLeft.map(c => c.front).join(', ')}</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
                {reviewLeft.length > 0 && <Button type="button" variant="secondary" className="min-h-control gap-2 px-4" onClick={onRestart}><RotateCcw className="h-4 w-4" aria-hidden="true" />{l('reviewOnly')}</Button>}
                <Button type="button" variant="secondary" className="min-h-control px-4" onClick={onExit}>{l('backToDeck')}</Button>
            </div>
        </section>;
    }

    return <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
            <Tooltip content={l('studyExit')}><Button type="button" variant="secondary" className={buttonClass} aria-label={l('studyExit')} onClick={onExit}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
            <h2 className="min-w-0 break-words font-semibold text-ink">{deck?.title}</h2>
            <span className="ml-auto font-mono text-sm text-ink-muted">{study.index + 1} / {total}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={study.index} aria-valuemin={0} aria-valuemax={total}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round((study.index / total) * 100)}%` }} />
        </div>
        <button type="button" onClick={onFlip} aria-label={l('flipHint')} className="mx-auto flex min-h-[300px] w-full max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border-2 border-brand-line bg-surface p-6 text-center shadow-card transition-colors hover:border-brand">
            {card.image && <img src={tavoloImageUrl(card.image)} alt="" className="max-h-40 w-auto object-contain" />}
            <p className={`text-balance text-xl ${study.flipped ? 'text-ink-body' : 'font-semibold text-ink'}`}>{study.flipped ? card.back : card.front}</p>
            {!study.flipped && <span className="text-xs text-ink-muted">{l('flipHint')}</span>}
        </button>
        {study.flipped && <div className="flex justify-center gap-4">
            <Button type="button" variant="secondary" className="min-h-control gap-2 px-4" aria-label={l('reviewLabel')} onClick={() => onAnswer('review')}><RotateCcw className="h-4 w-4 text-warning" aria-hidden="true" />{l('reviewLabel')}</Button>
            <Button type="button" className="min-h-control gap-2 px-4" aria-label={l('knownLabel')} onClick={() => onAnswer('known')}><Check className="h-4 w-4" aria-hidden="true" />{l('knownLabel')}</Button>
        </div>}
    </section>;
}
