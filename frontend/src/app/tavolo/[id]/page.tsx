'use client';

// La pagina del tavolo. Possiede lo stato che sta sul server: la revisione su
// cui si lavora, le proposte in sospeso, il salvataggio.
//
// Ogni scrittura dichiara l'indice della revisione su cui e' stata pensata. Un
// 409 non e' un errore da mostrare come guasto: vuol dire che il tavolo e'
// andato avanti da un'altra parte, e la risposta giusta e' ricaricare.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { toPng } from 'html-to-image';
import { Check, Loader2, Save, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { TavoloCanvas } from '@/components/tavolo/TavoloCanvas';
import { TavoloCompose } from '@/components/tavolo/TavoloCompose';
import {
    INTENTS,
    composeBody,
    composeTavolo,
    fetchTavolo,
    liveGraph,
    pendingIds,
    saveTavolo,
    settleTavolo,
    suggestTavolo,
    uploadCapture,
    writeTavolo,
    type TavoloGraph,
    type TavoloIntent,
    type TavoloPresetId,
    type TavoloView,
} from '@/lib/tavolo';
import { tavoloLabel } from '@/lib/i18n-tavolo';

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

export default function TavoloPage() {
    const params = useParams<{ id: string }>();
    const search = useSearchParams();
    const { lang } = useI18n();
    const id = params.id;
    const counselorId = Number(search.get('counselor')) || undefined;

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
            setView(next);
            setGraph(next.graph);
            setStatus('ready');
        } catch {
            setStatus('missing');
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    // Le mosse della persona si scrivono a raffiche brevi: trascinare un pezzo
    // produce decine di cambi di posizione, e una revisione per fotogramma
    // riempirebbe lo storico di rumore invece che di pensiero.
    const pendingWrite = useRef<number | null>(null);
    const change = useCallback((next: TavoloGraph) => {
        setGraph(next);
        if (pendingWrite.current) window.clearTimeout(pendingWrite.current);
        pendingWrite.current = window.setTimeout(async () => {
            if (!view) return;
            try {
                const written = await writeTavolo(id, next, view.index);
                setView(written);
            } catch (error) {
                if ((error as { status?: number }).status === 409) {
                    setMessage(label('stale'));
                    void load();
                }
            }
        }, 600);
    }, [id, view, label, load]);

    useEffect(() => () => {
        if (pendingWrite.current) window.clearTimeout(pendingWrite.current);
    }, []);

    const ask = async (intent: TavoloIntent) => {
        if (!view) return;
        setBusy(true);
        setMessage(null);
        try {
            const next = await suggestTavolo(id, {
                intent, counselor_id: counselorId, lang, base_index: view.index,
            });
            setView(next);
            setGraph(next.graph);
        } catch {
            setMessage(label('askFailed'));
        } finally {
            setBusy(false);
        }
    };

    const compose = async (preset: TavoloPresetId | null, prompt: string) => {
        if (!view) return;
        const body = composeBody({ preset, prompt, lang, index: view.index, counselorId });
        if (!body) return;
        setBusy(true);
        setMessage(null);
        try {
            const next = await composeTavolo(id, body);
            setView(next);
            setGraph(next.graph);
        } catch {
            setMessage(label('composeFailed'));
        } finally {
            setBusy(false);
        }
    };

    const settle = async (ids: string[], action: 'accept' | 'reject') => {
        if (!view || ids.length === 0) return;
        setBusy(true);
        try {
            const next = await settleTavolo(id, ids, action, view.index);
            setView(next);
            setGraph(next.graph);
        } catch {
            setMessage(label('stale'));
            void load();
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (!view || !graph) return;
        const title = window.prompt(label('saveTitle'), view.title || graph.title || '');
        if (!title?.trim()) return;
        setBusy(true);
        try {
            const saved = await saveTavolo(id, title.trim(), lang);
            setView(saved);
            setMessage(label('saved'));
            // La cattura e' facoltativa: se fallisce, il tavolo resta salvato
            // con la sua resa a parole, che il server scrive comunque.
            const surface = canvas.current?.querySelector<HTMLElement>('.react-flow__viewport');
            if (surface) {
                const png = await toPng(surface, { backgroundColor: '#ffffff', pixelRatio: 2 })
                    .then((url) => fetch(url).then((response) => response.blob()))
                    .catch(() => null);
                if (png) await uploadCapture(id, png);
            }
        } catch {
            setMessage(label('saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    if (status === 'loading') {
        return <p className="flex min-h-dvh items-center justify-center gap-2 text-sm text-slate-600" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{label('loading')}
        </p>;
    }
    if (status === 'missing' || !view || !graph) {
        return <p className="flex min-h-dvh items-center justify-center p-6 text-sm text-slate-600">{label('notFound')}</p>;
    }

    const waiting = pendingIds(graph);
    const content = liveGraph(graph);

    if (!wide) {
        return (
            <main className="mx-auto max-w-2xl space-y-4 p-4">
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
        <main className="flex h-dvh flex-col">
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
                <h1 className="min-w-0 truncate text-sm font-semibold text-slate-800">
                    {view.title || label('untitled')}
                    {!view.saved && <span className="ml-2 rounded bg-ochre-50 px-1.5 py-0.5 text-xs font-normal text-ochre-700">{label('draft')}</span>}
                </h1>
                <Link href="/tavolo" className="mr-auto shrink-0 text-xs text-indigo-700 hover:underline">
                    {label('all')}
                </Link>
                {INTENTS.map((intent) => (
                    <button key={intent} type="button" disabled={busy} onClick={() => void ask(intent)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />{label(INTENT_LABEL[intent])}
                    </button>
                ))}
                <button type="button" disabled={busy} onClick={() => void save()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
                    <Save className="h-4 w-4" aria-hidden="true" />{label('save')}
                </button>
            </header>

            {waiting.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ochre-200 bg-ochre-50 px-4 py-2 text-sm text-slate-700">
                    <span className="mr-auto">{label('proposals')} · {waiting.length}</span>
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

            {message && <p role="status" className="shrink-0 px-4 py-2 text-sm text-slate-600">{message}</p>}

            <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2">
                <TavoloCompose busy={busy} onCompose={compose} />
            </div>

            <div ref={canvas} className="min-h-0 flex-1">
                <TavoloCanvas graph={graph} locale={lang} onChange={change} />
            </div>
        </main>
    );
}
