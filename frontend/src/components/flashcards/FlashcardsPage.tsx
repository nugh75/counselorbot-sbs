'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, FolderPlus, GraduationCap, Image as ImageIcon, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { flashcardLabel } from '@/lib/i18n-flashcards';
import { BUILTIN_CARD_IMAGES, tavoloImageUrl } from '@/lib/tavolo-images';
import { addCard, addDeck, deckProgress, emptyFlashcards, removeCard, removeDeck, renameDeck, resetDeckProgress, setCardStatus, shuffleCards, updateCard, type Flashcard, type FlashcardDeck, type FlashcardStatus, type FlashcardWorkspace, type SavedFlashcards } from '@/lib/flashcards';

const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const buttonClass = 'h-[44px] w-[44px] shrink-0 p-0';
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
    const [busy, setBusy] = useState(false);
    const [issue, setIssue] = useState('');
    const [view, setView] = useState<'list' | 'deck'>('list');
    const [openDeckId, setOpenDeckId] = useState<string | null>(null);
    const [study, setStudy] = useState<StudySession | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deckName, setDeckName] = useState('');
    const [draftFront, setDraftFront] = useState('');
    const [draftBack, setDraftBack] = useState('');
    const [draftImage, setDraftImage] = useState('');
    const [pickingImageId, setPickingImageId] = useState<string | null>(null);
    const workRef = useRef(work);
    workRef.current = work;
    const savedRef = useRef(saved);
    savedRef.current = saved;
    const saveChain = useRef<Promise<void>>(Promise.resolve());
    const dirty = JSON.stringify(work) !== JSON.stringify(saved.workspace);

    useEffect(() => { document.title = `${flashcardLabel(lang, 'title')} - CounselorBot`; }, [lang]);

    const load = useCallback(async () => {
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch('/api/user/flashcards', { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error();
            const state: SavedFlashcards = await response.json();
            setSaved(state); setWork(state.workspace); setLoaded(true);
        } catch { setIssue('loadError'); }
        finally { setBusy(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const doSave = useCallback(async () => {
        const payload = workRef.current;
        if (JSON.stringify(payload) === JSON.stringify(savedRef.current.workspace)) return;
        setBusy(true); setIssue('');
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
        finally { setBusy(false); }
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

    const edit = useCallback((next: FlashcardWorkspace) => setWork(next), []);
    const openDeck = (deck: FlashcardDeck) => { setOpenDeckId(deck.id); setView('deck'); setStudy(null); };
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
        edit(setCardStatus(workRef.current, study.deckId, studyCard.id, status));
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
        else if (pickingImageId) edit(updateCard(workRef.current, openDeckId!, pickingImageId, { image: imageId }));
        setPickingImageId(null);
    };
    const removeButton = (name: string, action: () => void, labelKey = 'deleteDeck') => (
        <Tooltip content={`${l(labelKey)}: "${name}"`}><Button type="button" variant="ghost" className={buttonClass} aria-label={`${l(labelKey)}: "${name}"`} onClick={() => { if (window.confirm(`${l(labelKey)}: "${name}"?`)) action(); }}><Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" /></Button></Tooltip>
    );

    return <main className="page-narrow space-y-4 p-4">
        <PageHeader title={l('title')} subtitle={l('subtitle')} backHref="/profilo" />
        {issue && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p>{l(issue)}</p>
            {issue === 'conflict' && <Button type="button" variant="secondary" className="mt-2 min-h-11 px-4" onClick={() => void load()}><RotateCcw className="mr-1 inline h-4 w-4" aria-hidden="true" />{l('reload')}</Button>}
        </div>}
        <p role="status" className="text-sm text-slate-600">{busy ? l('saving') : dirty ? l('unsaved') : loaded ? l('saved') : ''}</p>

        {view === 'list' && <section aria-label={l('myDecks')} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-1.5 font-semibold text-slate-800"><GraduationCap className="h-4 w-4 text-indigo-600" aria-hidden="true" />{l('myDecks')}</h2>
                <Tooltip content={l('newDeck')}><Button type="button" variant="secondary" className="min-h-11 gap-2 px-3" aria-label={l('newDeck')} disabled={work.decks.length >= 20} onClick={() => { setDeckName(''); setDialogOpen(true); }}><FolderPlus className="h-4 w-4" aria-hidden="true" />{l('newDeck')}</Button></Tooltip>
            </div>
            {work.decks.length === 0 ? <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-slate-600">{l('emptyDecks')}</p> : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {work.decks.map(deck => {
                        const progress = deckProgress(deck);
                        return <article key={deck.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                            <button type="button" className="min-h-11 text-left" aria-label={`${l('editDeck')}: ${deck.title}`} onClick={() => openDeck(deck)}>
                                <h3 className="break-words font-semibold text-slate-900">{deck.title} <span className="font-mono text-sm text-slate-500">{deck.cards.length}</span></h3>
                                <p className="mt-1 text-xs text-slate-500"><span className="text-emerald-600">✔ {progress.known}</span> · <span className="text-amber-600">↻ {progress.review}</span> · {progress.fresh}</p>
                            </button>
                            <div className="mt-2 flex flex-wrap items-center gap-2 self-end">
                                <Tooltip content={l('study')}><Button type="button" variant="secondary" className="min-h-11 gap-1 px-3" aria-label={`${l('study')}: ${deck.title}`} disabled={!deck.cards.length} onClick={() => { openDeck(deck); startStudy(deck); }}>{l('study')}</Button></Tooltip>
                                <Tooltip content={l('editDeck')}><Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label={`${l('editDeck')}: ${deck.title}`} onClick={() => openDeck(deck)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                {removeButton(deck.title, () => { edit(removeDeck(workRef.current, deck.id)); setStudy(null); })}
                            </div>
                        </article>;
                    })}
                </div>
            )}
        </section>}

        {view === 'deck' && currentDeck && <section aria-label={currentDeck.title} className="space-y-3">
            {study ? <StudyView study={study} deck={studyDeck} card={studyCard} onFlip={() => setStudy(s => s ? { ...s, flipped: true } : s)} onAnswer={answer} onExit={() => setStudy(null)} onRestart={() => { const deck = workRef.current.decks.find(d => d.id === study.deckId); if (deck) startStudy(deck, true); }} /> : <>
                <div className="flex flex-wrap items-center gap-2">
                    <Tooltip content={l('backToDecks')}><Button type="button" variant="secondary" className={buttonClass} aria-label={l('backToDecks')} onClick={() => { setView('list'); setOpenDeckId(null); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                    <h2 className="min-w-0 break-words font-semibold text-slate-900">{currentDeck.title} <span className="font-mono text-sm text-slate-500">{currentDeck.cards.length}</span></h2>
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                        <Tooltip content={l('study')}><Button type="button" variant="secondary" className="min-h-11 gap-2 px-3" aria-label={l('study')} disabled={!currentDeck.cards.length} onClick={() => startStudy(currentDeck)}>{l('study')}</Button></Tooltip>
                        <Tooltip content={l('resetProgress')}><Button type="button" variant="secondary" className={buttonClass} aria-label={l('resetProgress')} disabled={!currentDeck.cards.length} onClick={() => { if (window.confirm(`${l('resetProgress')}: "${currentDeck.title}"?`)) edit(resetDeckProgress(workRef.current, currentDeck.id)); }}><RotateCcw className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                        <Tooltip content={l('renameDeck')}><Button type="button" variant="ghost" className={buttonClass} aria-label={l('renameDeck')} onClick={() => { const name = window.prompt(l('renameDeck'), currentDeck.title); if (name?.trim()) edit(renameDeck(workRef.current, currentDeck.id, name)); }}><Pencil className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                        {work.decks.length > 1 && removeButton(currentDeck.title, () => { edit(removeDeck(workRef.current, currentDeck.id)); setView('list'); setOpenDeckId(null); })}
                    </div>
                </div>
                <details open={!currentDeck.cards.length || Boolean(draftFront)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addCard')}</summary>
                    <form className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={event => {
                        event.preventDefault();
                        if (!draftFront.trim() || !draftBack.trim()) return;
                        edit(addCard(workRef.current, currentDeck.id, { front: draftFront.trim(), back: draftBack.trim(), image: draftImage || null }, crypto.randomUUID()));
                        setDraftFront(''); setDraftBack(''); setDraftImage('');
                    }}>
                        <label className="block text-sm font-medium">{l('frontLabel')}<textarea required maxLength={FRONT_MAX} rows={2} value={draftFront} onChange={e => setDraftFront(e.target.value)} className={`${inputClass} mt-1`} /></label>
                        <label className="block text-sm font-medium">{l('backLabel')}<textarea required maxLength={BACK_MAX} rows={3} value={draftBack} onChange={e => setDraftBack(e.target.value)} className={`${inputClass} mt-1`} /></label>
                        <div className="flex flex-wrap items-center gap-3">
                            {draftImage ? (
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => setPickingImageId('draft')} className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1 hover:border-indigo-400" title={l('changeImage')} aria-label={l('changeImage')}>
                                        <img src={tavoloImageUrl(draftImage)} alt="" className="max-h-full max-w-full object-contain" />
                                    </button>
                                    <Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label={l('removeImage')} onClick={() => setDraftImage('')}><X className="h-4 w-4" aria-hidden="true" /></Button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => setPickingImageId('draft')} className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-700" aria-label={l('addImage')}><ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />+ {l('addImage')}</button>
                            )}
                            <Tooltip content={l('addCard')}><Button aria-label={l('addCard')} type="submit" className={buttonClass} disabled={!draftFront.trim() || !draftBack.trim() || currentDeck.cards.length >= 200}><Plus className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                        </div>
                        {currentDeck.cards.length >= 200 && <p role="status" className="text-sm text-slate-600">{l('limit')}</p>}
                    </form>
                </details>
                {!currentDeck.cards.length ? <p className="py-5 text-center text-slate-600">{l('emptyDeck')}</p> : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{currentDeck.cards.map(card => <article key={card.id} className="group/card flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => edit(updateCard(workRef.current, currentDeck.id, card.id, { status: card.status === 'known' ? 'review' : card.status === 'review' ? null : 'known' }))} aria-label={l('statusNone')}
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${card.status === 'known' ? 'bg-emerald-100 text-emerald-700' : card.status === 'review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {card.status === 'known' ? `✔ ${l('knownLabel')}` : card.status === 'review' ? `↻ ${l('reviewLabel')}` : l('statusNone')}
                            </button>
                            <div className="flex items-center gap-1">
                                <button type="button" onClick={() => setPickingImageId(card.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:text-indigo-700" aria-label={card.image ? l('changeImage') : l('addImage')} title={card.image ? l('changeImage') : l('addImage')}>
                                    {card.image ? <img src={tavoloImageUrl(card.image)} alt="" className="h-6 w-6 object-contain" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
                                </button>
                                {removeButton(card.front, () => edit(removeCard(workRef.current, currentDeck.id, card.id)), 'deleteCard')}
                            </div>
                        </div>
                        <label className="block text-sm font-medium">{l('frontLabel')}<textarea maxLength={FRONT_MAX} rows={2} value={card.front} onChange={e => edit(updateCard(workRef.current, currentDeck.id, card.id, { front: e.target.value }))} className={`${inputClass} mt-1`} /></label>
                        <label className="mt-2 block text-sm font-medium">{l('backLabel')}<textarea maxLength={BACK_MAX} rows={3} value={card.back} onChange={e => edit(updateCard(workRef.current, currentDeck.id, card.id, { back: e.target.value }))} className={`${inputClass} mt-1`} /></label>
                    </article>)}</div>
                )}
            </>}
        </section>}

        {dialogOpen && createPortal(
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setDialogOpen(false)}>
                <div role="dialog" aria-modal="true" aria-labelledby={`${id}-new-deck`} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="mb-4 flex items-center justify-between">
                        <h2 id={`${id}-new-deck`} className="text-base font-semibold text-slate-900">{l('newDeck')}</h2>
                        <Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label={l('deckCancel')} onClick={() => setDialogOpen(false)}><X className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor={`${id}-deck-name`}>{l('deckName')}</label>
                    <input id={`${id}-deck-name`} type="text" maxLength={100} value={deckName} onChange={e => setDeckName(e.target.value)} onKeyDown={e => {
                        if (e.key === 'Enter' && deckName.trim()) { edit(addDeck(workRef.current, crypto.randomUUID(), deckName.trim())); setDeckName(''); setDialogOpen(false); }
                    }} className={`${inputClass} mt-1`} />
                    <div className="mt-5 flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>{l('deckCancel')}</Button>
                        <Button type="button" disabled={!deckName.trim()} onClick={() => { edit(addDeck(workRef.current, crypto.randomUUID(), deckName.trim())); setDeckName(''); setDialogOpen(false); }}>{l('deckCreate')}</Button>
                    </div>
                </div>
            </div>, document.body)}

        {pickingImageId && createPortal(
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setPickingImageId(null)}>
                <div role="dialog" aria-modal="true" aria-labelledby={`${id}-pick-image`} className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                        <h2 id={`${id}-pick-image`} className="text-base font-semibold text-slate-900">{l('selectImage')}</h2>
                        <Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label={l('deckCancel')} onClick={() => setPickingImageId(null)}><X className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                    <div className="grid gap-3 overflow-y-auto p-5 sm:grid-cols-3 lg:grid-cols-4">
                        {BUILTIN_CARD_IMAGES.map(entry => (
                            <button key={entry.id} type="button" className="rounded-xl border border-slate-200 bg-white p-2 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50/40" onClick={() => applyImage(entry.id)}>
                                <img src={tavoloImageUrl(entry.id)} alt="" className="mx-auto h-20 w-full object-contain" />
                                <span className="mt-1 block text-xs font-semibold text-slate-800">{entry.name}</span>
                                <span className="block text-[11px] leading-snug text-slate-500">{entry.usage}</span>
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
        return <section className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">{l('sessionDone')}</h3>
            <p className="mt-3 flex items-center justify-center gap-6 text-sm">
                <span className="text-emerald-600">✔ {l('knownLabel')}: {study.known}</span>
                <span className="text-amber-600">↻ {l('reviewLabel')}: {study.review}</span>
            </p>
            {reviewLeft.length > 0 && <p className="mt-2 break-words text-sm text-slate-600">{l('reviewLabel')}: {reviewLeft.map(c => c.front).join(', ')}</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
                {reviewLeft.length > 0 && <Button type="button" variant="secondary" className="min-h-11 gap-2 px-4" onClick={onRestart}><RotateCcw className="h-4 w-4" aria-hidden="true" />{l('reviewOnly')}</Button>}
                <Button type="button" variant="secondary" className="min-h-11 px-4" onClick={onExit}>{l('backToDeck')}</Button>
            </div>
        </section>;
    }

    return <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
            <Tooltip content={l('studyExit')}><Button type="button" variant="secondary" className={buttonClass} aria-label={l('studyExit')} onClick={onExit}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
            <h2 className="min-w-0 break-words font-semibold text-slate-900">{deck?.title}</h2>
            <span className="ml-auto font-mono text-sm text-slate-500">{study.index + 1} / {total}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={study.index} aria-valuemin={0} aria-valuemax={total}>
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.round((study.index / total) * 100)}%` }} />
        </div>
        <button type="button" onClick={onFlip} aria-label={l('flipHint')} className="mx-auto flex min-h-[300px] w-full max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border-2 border-indigo-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-indigo-400">
            {card.image && <img src={tavoloImageUrl(card.image)} alt="" className="max-h-40 w-auto object-contain" />}
            <p className={`text-balance text-xl ${study.flipped ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>{study.flipped ? card.back : card.front}</p>
            {!study.flipped && <span className="text-xs text-slate-400">{l('flipHint')}</span>}
        </button>
        {study.flipped && <div className="flex justify-center gap-3">
            <Button type="button" variant="secondary" className="min-h-11 gap-2 px-4" aria-label={l('reviewLabel')} onClick={() => onAnswer('review')}><RotateCcw className="h-4 w-4 text-amber-600" aria-hidden="true" />{l('reviewLabel')}</Button>
            <Button type="button" className="min-h-11 gap-2 px-4" aria-label={l('knownLabel')} onClick={() => onAnswer('known')}><Check className="h-4 w-4" aria-hidden="true" />{l('knownLabel')}</Button>
        </div>}
    </section>;
}
