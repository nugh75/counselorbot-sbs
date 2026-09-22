'use client';

// La pagina del tavolo. Possiede lo stato che sta sul server: la revisione su
// cui si lavora, le proposte in sospeso, il salvataggio.
//
// Ogni scrittura dichiara l'indice della revisione su cui e' stata pensata. Un
// 409 non e' un errore da mostrare come guasto: vuol dire che il tavolo e'
// andato avanti da un'altra parte, e la risposta giusta e' ricaricare.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toPng } from 'html-to-image';
import { Check, Eye, Loader2, MessageCircle, Pencil, Save, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { TavoloCanvas } from '@/components/tavolo/TavoloCanvas';
import { TavoloCompose } from '@/components/tavolo/TavoloCompose';
import { TavoloCounselor } from '@/components/tavolo/TavoloCounselor';
import { TavoloHelp } from '@/components/tavolo/TavoloHelp';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { BackButton } from '@/components/ui/BackButton';
import {
    INTENTS,
    edgeKey,
    renameTavolo,
    composeBody,
    composeTavolo,
    fetchTavolo,
    liveGraph,
    pendingIds,
    saveTavolo,
    settleTavolo,
    suggestTavolo,
    TAVOLO_FULL_DETAIL,
    uploadCapture,
    writeTavolo,
    type TavoloGraph,
    type TavoloIntent,
    type TavoloPresetId,
    type TavoloView,
} from '@/lib/tavolo';
import { relLabel, tavoloLabel } from '@/lib/i18n-tavolo';

const INTENT_LABEL: Record<TavoloIntent, Parameters<typeof tavoloLabel>[0]> = {
    'what-is-missing': 'intentWhatIsMissing',
    organize: 'intentOrganize',
    connect: 'intentConnect',
    continue: 'intentContinue',
};

// Sotto questa larghezza il tavolo si legge e non si lavora: trascinare pezzi
// e tirare fili con le dita su uno schermo stretto non e' una versione ridotta
// dello strumento, e' un'altra cosa che non funziona.
const DESKTOP_WIDTH = 1024;

export function TavoloWorkspace({ id, initialCounselorId, onReturn }: {
    id: string; initialCounselorId?: number; onReturn?: () => void;
}) {
    const { lang, t } = useI18n();
    const router = useRouter();
    const [counselorId, setCounselorId] = useState<number | undefined>(initialCounselorId);
    const [aiAvailable, setAiAvailable] = useState(false);
    const counselorChanged = useCallback((next: number | undefined, available: boolean) => {
        setCounselorId(next);
        setAiAvailable(available);
    }, []);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [focusIds, setFocusIds] = useState<string[]>([]);
    const [writeStatus, setWriteStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'failed'>('idle');
    const viewRef = useRef<TavoloView | null>(null);
    const dirtyGraph = useRef<TavoloGraph | null>(null);
    const writing = useRef<Promise<void> | null>(null);

    const [view, setView] = useState<TavoloView | null>(null);
    const [graph, setGraph] = useState<TavoloGraph | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [wide, setWide] = useState(true);
    const canvas = useRef<HTMLDivElement>(null);
    const label = useCallback((key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, lang), [lang]);

    useEffect(() => {
        const measure = () => setWide(window.innerWidth >= DESKTOP_WIDTH);
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const load = useCallback(async () => {
        try {
            const next = await fetchTavolo(id);
            viewRef.current = next;
            dirtyGraph.current = null;
            setView(next);
            setGraph(next.graph);
            setStatus('ready');
        } catch {
            setStatus('missing');
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    // Serialize writes and drain the latest edit before save, AI or settlement.
    // A slow response must not overwrite what the person typed while it was in flight.
    const pendingWrite = useRef<number | null>(null);
    const flush = useCallback(async (): Promise<TavoloView | null> => {
        if (pendingWrite.current) window.clearTimeout(pendingWrite.current);
        if (writing.current) await writing.current;
        if (!dirtyGraph.current) return viewRef.current;
        const work = async () => {
            while (dirtyGraph.current && viewRef.current) {
                const next = dirtyGraph.current;
                dirtyGraph.current = null;
                setWriteStatus('saving');
                try {
                    const written = await writeTavolo(id, next, viewRef.current.index);
                    viewRef.current = written;
                    setView(written);
                } catch (error) {
                    dirtyGraph.current ??= next;
                    if ((error as { status?: number }).status === 409) {
                        setMessage(label('stale'));
                        await load();
                    }
                    setWriteStatus('failed');
                    throw error;
                }
            }
            setWriteStatus('saved');
        };
        writing.current = work();
        try { await writing.current; }
        finally { writing.current = null; }
        return viewRef.current;
    }, [id, label, load]);

    const change = useCallback((next: TavoloGraph) => {
        setGraph(next);
        dirtyGraph.current = next;
        setWriteStatus('pending');
        if (pendingWrite.current) window.clearTimeout(pendingWrite.current);
        pendingWrite.current = window.setTimeout(() => { void flush().catch(() => undefined); }, 600);
    }, [flush]);

    const flushRef = useRef(flush);
    useEffect(() => { flushRef.current = flush; }, [flush]);
    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (dirtyGraph.current || writing.current) event.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => {
            if (pendingWrite.current) window.clearTimeout(pendingWrite.current);
            window.removeEventListener('beforeunload', beforeUnload);
            void flushRef.current().catch(() => undefined);
        };
    }, []);

    const applyView = (next: TavoloView) => {
        viewRef.current = next;
        setView(next);
        setGraph(next.graph);
    };

    const ask = async (intent: TavoloIntent) => {
        if (!view || busy || !aiAvailable) return;
        setBusy(true);
        setMessage(null);
        try {
            const current = await flush();
            if (!current) return;
            const next = await suggestTavolo(id, {
                intent, counselor_id: counselorId, lang, base_index: current.index,
            });
            applyView(next);
            if (next.note) setMessage(next.note);
        } catch (error) {
            if ((error as { status?: number }).status === 409) {
                setMessage(label('stale'));
                void load();
            } else {
                setMessage(label('askFailed'));
            }
        } finally {
            setBusy(false);
        }
    };

    const compose = async (preset: TavoloPresetId | null, prompt: string) => {
        if (!view || busy || !aiAvailable) return;
        const body = composeBody({ preset, prompt, lang, index: view.index, counselorId });
        if (!body) return;
        setBusy(true);
        setMessage(null);
        try {
            const current = await flush();
            if (!current) return;
            const next = await composeTavolo(id, { ...body, base_index: current.index });
            applyView(next);
            // "Decidi tu" lascia il genere scelto solo nella nota: il grafo
            // non lo scrive quando il chip e' auto, quindi e' l'unico posto
            // dove quella scelta si vede.
            if (next.note) setMessage(next.note);
        } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 409) {
                setMessage(label('stale'));
                void load();
            } else if (status === 422 && (error as Error).message === TAVOLO_FULL_DETAIL) {
                setMessage(label('composeFull'));
            } else {
                setMessage(label('composeFailed'));
            }
        } finally {
            setBusy(false);
        }
    };

    const settle = async (ids: string[], action: 'accept' | 'reject') => {
        if (!view || busy || ids.length === 0) return;
        setBusy(true);
        try {
            const current = await flush();
            if (!current) return;
            const next = await settleTavolo(id, ids, action, current.index);
            applyView(next);
        } catch (error) {
            if ((error as { status?: number }).status === 409) {
                setMessage(label('stale'));
                void load();
            } else setMessage(label('saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (!view || !graph || busy) return;
        const title = view.saved && view.title ? view.title : window.prompt(label('saveTitle'), view.title || graph.title || '');
        if (!title?.trim()) return;
        setBusy(true);
        try {
            await flush();
            const saved = await saveTavolo(id, title.trim().slice(0, 80), lang);
            viewRef.current = saved;
            setView(saved);
            setMessage(label('saved'));
            // La cattura e' facoltativa: se fallisce, il tavolo resta salvato
            // con la sua resa a parole, che il server scrive comunque.
            const surface = canvas.current?.querySelector<HTMLElement>('.react-flow__viewport');
            if (surface) {
                const png = await toPng(surface, { backgroundColor: '#ffffff', pixelRatio: 2 })
                    .then((url) => fetch(url).then((response) => response.blob()))
                    .catch(() => null);
                if (png) await uploadCapture(id, png).catch(() => false);
            }
        } catch {
            setMessage(label('saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    const rename = async () => {
        if (!view || busy) return;
        const title = window.prompt(label('renameTable'), view.title || graph?.title || '');
        if (!title?.trim()) return;
        setBusy(true);
        try {
            await flush();
            applyView(await renameTavolo(id, title.trim().slice(0, 80)));
        } catch { setMessage(label('manageFailed')); }
        finally { setBusy(false); }
    };

    const back = onReturn
        ? <BackButton className="tavolo-back" label={t('nav.back')} onClick={() => void flush().then(onReturn).catch(() => undefined)} />
        : <PreviousPageButton fallbackHref="/profilo/tavolo" beforeBack={flush} />;

    if (status === 'loading') {
        return <p className="flex min-h-dvh items-center justify-center gap-2 text-sm text-slate-600" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{label('loading')}
        </p>;
    }
    if (status === 'missing' || !view || !graph) {
        return <div className="space-y-4 p-4">{back}<p className="text-sm text-slate-600">{label('notFound')}</p></div>;
    }

    const waiting = pendingIds(graph);
    const content = liveGraph(graph);

    if (!wide) {
        return (
            <main className="mx-auto max-w-2xl space-y-4 p-4">
                {back}
                <h1 className="text-lg font-semibold text-slate-800">{view.title || label('untitled')}</h1>
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{label('desktopOnly')}</p>
                {view.has_capture && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/tavolo/${encodeURIComponent(id)}/capture.png`} alt={view.title || label('title')}
                        className="w-full rounded-lg border border-slate-200" />
                )}
                <p className="text-sm leading-relaxed text-slate-700">
                    {view.rendition || content.nodes.map((node) => node.label).join(' · ')}
                </p>
            </main>
        );
    }

    return (
        <main className={`flex min-h-[32rem] w-full flex-col ${onReturn ? 'h-full' : 'h-[calc(100dvh-6rem)]'}`}>
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
                {back}
                <h1 className="min-w-0 truncate text-sm font-semibold text-slate-800">
                    {view.title || label('untitled')}
                    {!view.saved && <span className="ml-2 rounded bg-ochre-50 px-1.5 py-0.5 text-xs font-normal text-ochre-700">{label('draft')}</span>}
                </h1>
                <button type="button" disabled={busy} onClick={() => void rename()} aria-label={label('renameTable')} title={label('renameTable')}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <Link href="/tavolo" onClick={(event) => { event.preventDefault(); void flush().then(() => onReturn ? onReturn() : router.push('/tavolo')).catch(() => undefined); }} className="mr-auto shrink-0 text-xs text-indigo-700 hover:underline">
                    {label('all')}
                </Link>
                {INTENTS.map((intent) => (
                    <button key={intent} type="button" disabled={busy || !aiAvailable} onClick={() => void ask(intent)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />{label(INTENT_LABEL[intent])}
                    </button>
                ))}
                <button type="button" disabled={busy || !aiAvailable} onClick={() => setHelpOpen((open) => !open)} aria-expanded={helpOpen}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 disabled:opacity-40">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />{label('help')}
                </button>
                <button type="button" disabled={busy} onClick={() => void save()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
                    <Save className="h-4 w-4" aria-hidden="true" />{label('save')}
                </button>
            </header>

            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2">
                <TavoloCounselor initialId={initialCounselorId} busy={busy} onChange={counselorChanged} />
                {writeStatus !== 'idle' && <p role="status" className="mt-1 text-xs text-slate-600">
                    {label(writeStatus === 'pending' ? 'pendingChanges' : writeStatus === 'saving' ? 'savingChanges' : writeStatus === 'saved' ? 'changesSaved' : 'changesFailed')}
                    {writeStatus === 'failed' && <button type="button" onClick={() => void flush().catch(() => undefined)} className="ml-2 min-h-11 text-indigo-700 underline">{label('retry')}</button>}
                </p>}
            </div>

            {waiting.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ochre-200 bg-ochre-50 px-4 py-2 text-sm text-slate-700">
                    <span className="mr-auto">{label('proposals')} · {waiting.length}</span>
                    <button type="button" onClick={() => { setReviewOpen((open) => !open); setFocusIds(graph.nodes.filter((node) => node.state === 'pending').map((node) => node.id)); }}
                        aria-expanded={reviewOpen} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3">
                        <Eye className="h-4 w-4" aria-hidden="true" />{label(reviewOpen ? 'hideProposals' : 'viewProposals')}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void settle(waiting, 'accept')}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
                        <Check className="h-4 w-4" aria-hidden="true" />{label('acceptAll')}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void settle(waiting, 'reject')}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-white disabled:opacity-40">
                        <X className="h-4 w-4" aria-hidden="true" />{label('rejectAll')}
                    </button>
                </div>
            )}

            {reviewOpen && waiting.length > 0 && <section aria-label={label('viewProposals')} className="max-h-48 shrink-0 overflow-y-auto border-b border-slate-200 bg-white px-4 py-2 text-sm">
                <p className="mb-2 text-xs text-slate-600">{label('proposalCountHint')}</p>
                <ul className="space-y-1">
                    {[
                        ...graph.nodes.filter((node) => node.state === 'pending').map((node) => ({
                            id: node.id, text: node.label, focus: [node.id], accept: [node.id],
                            reject: [node.id, ...graph.edges.filter((edge) => edge.state === 'pending' && (edge.from === node.id || edge.to === node.id)).map(edgeKey)],
                        })),
                        ...graph.edges.filter((edge) => edge.state === 'pending').map((edge) => ({
                            id: edgeKey(edge),
                            text: `${graph.nodes.find((node) => node.id === edge.from)?.label} → ${edge.label || relLabel(edge.rel, lang)} → ${graph.nodes.find((node) => node.id === edge.to)?.label}`,
                            focus: [edge.from, edge.to], reject: [edgeKey(edge)],
                            accept: [edgeKey(edge), ...graph.nodes.filter((node) => node.state === 'pending' && (node.id === edge.from || node.id === edge.to)).map((node) => node.id)],
                        })),
                    ].map((item) => <li key={item.id} className="flex items-center gap-2 border-b border-slate-100">
                        <button type="button" onClick={() => setFocusIds(item.focus)} className="min-h-11 min-w-0 flex-1 text-left text-indigo-700 underline">{item.text}</button>
                        <button type="button" disabled={busy} onClick={() => void settle(item.accept, 'accept')} className="min-h-11 px-2 text-indigo-700">{label('accept')}</button>
                        <button type="button" disabled={busy} onClick={() => void settle(item.reject, 'reject')} className="min-h-11 px-2 text-slate-600">{label('reject')}</button>
                    </li>)}
                </ul>
            </section>}

            <div hidden={!helpOpen} className="shrink-0"><TavoloHelp id={id} counselorId={counselorId} available={aiAvailable} beforeAsk={flush} onBusy={setBusy} onClose={() => setHelpOpen(false)} /></div>

            {message && <p role="status" className="shrink-0 px-4 py-2 text-sm text-slate-600">{message}</p>}

            <details className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2">
                <summary className="cursor-pointer py-2 text-sm font-medium text-slate-700">{label('compose')}</summary>
                <div className="max-h-64 overflow-y-auto"><TavoloCompose busy={busy} aiAvailable={aiAvailable} onCompose={compose} /></div>
            </details>

            <div ref={canvas} className="min-h-0 flex-1">
                <TavoloCanvas graph={graph} locale={lang} onChange={change} onSave={flush} busy={busy} focusIds={focusIds} />
            </div>
        </main>
    );
}
