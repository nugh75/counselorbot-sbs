'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, GitBranch, Loader2, Maximize2, Pause, Play, X, ZoomIn, ZoomOut } from 'lucide-react';
import { completeDiagramEdges, diagramEdgeKinds, type DiagramEdgeKind, type DiagramSpec } from '@/lib/diagram-content';
import { diagramFullscreenLabel, diagramRequestLabel, diagramStepLabel, diagramZoomLabel, diagramUiLabel, edgeKindLabel } from '@/lib/i18n-diagram';
import { sanitizeSvgMarkup } from '@/lib/diagram-svg';
import { DiagramViewport, type DiagramPosition } from '@/components/ui/DiagramViewport';
import { apiFetch } from '@/lib/auth';
import { useDarkMode } from '@/lib/use-dark-mode';
import { Tooltip } from '@/components/ui/Tooltip';

interface DiagramBlockProps {
    spec: DiagramSpec;
    locale: string;
}

interface RenderState {
    key: string;
    markup: string | null;
    failed: boolean;
}

// Campione del tratto: lo stesso segno che il renderer disegna nell'arco.
// Il legame che sostiene e' l'unico colorato, come nel disegno.
const KIND_COLOR: Record<DiagramEdgeKind, string> = {
    drives: 'text-slate-500',
    strengthens: 'text-[#41707a] dark:text-[#7fb3b6]',
    weakens: 'text-slate-500',
    feedback: 'text-slate-500',
    link: 'text-slate-500',
};

function KindSample({ kind }: { kind: DiagramEdgeKind }) {
    return (
        <svg viewBox="0 0 44 12" className={`h-3 w-11 shrink-0 ${KIND_COLOR[kind]}`} aria-hidden="true">
            {kind === 'feedback' ? (
                <path d="M2 10 C14 1 28 1 38 6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="5 4" />
            ) : (
                <line
                    x1="2"
                    y1="6"
                    x2={kind === 'weakens' ? 36 : 38}
                    y2="6"
                    stroke="currentColor"
                    strokeWidth={kind === 'strengthens' ? 2.6 : kind === 'link' ? 1.3 : 1.5}
                    strokeDasharray={kind === 'weakens' ? '6 4' : kind === 'link' ? '1.5 4' : undefined}
                    strokeLinecap={kind === 'link' ? 'round' : undefined}
                />
            )}
            {kind === 'weakens' ? (
                <line x1="38" y1="1.5" x2="38" y2="10.5" stroke="currentColor" strokeWidth="2" />
            ) : kind === 'link' ? null : (
                <path d={kind === 'feedback' ? 'M42 7 L34 3 L36 9 Z' : 'M42 6 L35 2.6 L35 9.4 Z'} fill="currentColor" />
            )}
        </svg>
    );
}

const controlClass = 'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40';

function subscribeMotion(callback: () => void) {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new MutationObserver(callback);
    media.addEventListener('change', callback);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => { media.removeEventListener('change', callback); observer.disconnect(); };
}
function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
        || document.documentElement.dataset.motion === 'reduced';
}

function DiagramLegend({ kinds, locale }: { kinds: DiagramEdgeKind[]; locale: string }) {
    if (kinds.length === 0) return null;
    return (
        <ul className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
            {kinds.map((kind) => (
                <li key={kind} className="flex items-center gap-1.5">
                    <KindSample kind={kind} />
                    <span>{edgeKindLabel(kind, locale)}</span>
                </li>
            ))}
        </ul>
    );
}

// La frase che dice cosa mostra il disegno. Sta sotto, dove si guarda dopo aver
// guardato: il disegno viaggia anche fuori dalla chat (schermo intero, PNG di
// Telegram, PDF) e li' la prosa che lo accompagnava non c'e' piu'.
function DiagramNote({ note }: { note?: string }) {
    const text = note?.trim();
    if (!text) return null;
    return (
        <p className="w-full min-w-0 max-w-full border-t border-slate-200 px-3 py-2 text-sm leading-snug text-slate-600">
            {text}
        </p>
    );
}

export function DiagramBlock({ spec, locale }: DiagramBlockProps) {
    const normalized = JSON.stringify(completeDiagramEdges(spec));
    const drawnSpec = useMemo(() => JSON.parse(normalized) as DiagramSpec, [normalized]);
    // A regenerated graph gets a fresh reading path and selection.
    return <DiagramView key={normalized} spec={drawnSpec} locale={locale} />;
}

function DiagramView({ spec, locale }: DiagramBlockProps) {
    const isDark = useDarkMode();
    const reduced = useSyncExternalStore(subscribeMotion, reducedMotion, () => true);
    const [animate, setAnimate] = useState(false);
    const motion = animate && !reduced;
    const normalizedSpecJson = JSON.stringify(spec);
    const renderKey = `${isDark ? 'dark' : 'light'}:${locale}:${normalizedSpecJson}`;
    const [renderState, setRenderState] = useState<RenderState>({ key: '', markup: null, failed: false });
    const [retry, setRetry] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [cardBodyHeight, setCardBodyHeight] = useState(0);
    const [reading, setReading] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [reset, setReset] = useState(0);
    const [step, setStep] = useState<number | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [showText, setShowText] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportFailed, setExportFailed] = useState(false);
    const position = useRef<DiagramPosition>({ x: 0.5, y: 0.5 });
    const expandButton = useRef<HTMLButtonElement>(null);
    const cardBody = useRef<HTMLDivElement>(null);
    const dialog = useRef<HTMLElement>(null);
    const exportRequest = useRef<AbortController | null>(null);
    const labels = (key: Parameters<typeof diagramUiLabel>[0], values?: Record<string, number>) => diagramUiLabel(key, locale, values);
    const markup = renderState.key === renderKey ? renderState.markup : null;
    const failed = renderState.key === renderKey && renderState.failed;
    const activeNode = spec.nodes.find(node => node.id === selected) ?? (step === null ? null : spec.nodes[step]);
    const relatedEdges = (spec.edges ?? []).filter(edge => {
        if (selected) return edge.from === selected || edge.to === selected;
        if (step === null) return false;
        return Math.max(spec.nodes.findIndex(node => node.id === edge.from), spec.nodes.findIndex(node => node.id === edge.to)) === step;
    });
    const describeEdge = (edge: NonNullable<DiagramSpec['edges']>[number]) =>
        `${spec.nodes.find(node => node.id === edge.from)?.label ?? edge.from} — ${edge.label || edgeKindLabel(edge.kind || 'drives', locale)} → ${spec.nodes.find(node => node.id === edge.to)?.label ?? edge.to}`;

    useEffect(() => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            setRenderState({ key: renderKey, markup: null, failed: true });
            controller.abort();
        }, 30000);
        void apiFetch('/api/diagram/render', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spec: JSON.parse(normalizedSpecJson), theme: isDark ? 'dark' : 'light',
                format: 'svg', embed_title: false, lang: locale }), signal: controller.signal,
        }).then(response => {
            if (!response.ok) throw new Error('render failed');
            return response.text();
        }).then(source => {
            if (controller.signal.aborted) return;
            const clean = sanitizeSvgMarkup(source);
            if (!clean) throw new Error('invalid svg');
            setRenderState({ key: renderKey, markup: clean, failed: false });
        }).catch(() => {
            if (!controller.signal.aborted) setRenderState({ key: renderKey, markup: null, failed: true });
        }).finally(() => window.clearTimeout(timeout));
        return () => { window.clearTimeout(timeout); controller.abort(); };
    }, [isDark, locale, normalizedSpecJson, renderKey, retry]);

    useEffect(() => () => exportRequest.current?.abort(), []);
    useEffect(() => {
        if (!closing) return;
        const timer = window.setTimeout(() => { setIsFullscreen(false); setClosing(false); }, 120);
        return () => window.clearTimeout(timer);
    }, [closing]);
    const closeFullscreen = useCallback(() => {
        if (motion) setClosing(true);
        else setIsFullscreen(false);
    }, [motion]);

    useEffect(() => {
        if (!isFullscreen) return;
        const origin = expandButton.current;
        const previousOverflow = document.body.style.overflow;
        const close = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { closeFullscreen(); return; }
            if (event.key !== 'Tab') return;
            const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), summary, [tabindex="0"], a[href]',
            ) ?? [])].filter(element => element.getClientRects().length && element.getAttribute('aria-hidden') !== 'true');
            if (!focusable.length) return;
            const first = focusable[0], last = focusable[focusable.length - 1];
            const outside = !dialog.current?.contains(document.activeElement);
            if (event.shiftKey ? outside || document.activeElement === first : outside || document.activeElement === last) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', close);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', close);
            origin?.focus();
        };
    }, [isFullscreen, closeFullscreen]);

    useEffect(() => {
        const pause = () => { if (document.hidden) setPlaying(false); };
        document.addEventListener('visibilitychange', pause);
        return () => document.removeEventListener('visibilitychange', pause);
    }, []);
    useEffect(() => {
        if (!playing || reduced || step === null || !markup) return;
        const words = [activeNode?.label, ...relatedEdges.map(describeEdge)].join(' ').split(/\s+/).length;
        const timer = window.setTimeout(() => {
            if (step >= spec.nodes.length - 1) setPlaying(false);
            else { setSelected(null); setStep(step + 1); }
        }, Math.max(3000, Math.min(10000, words * 300 + 1000)));
        return () => window.clearTimeout(timer);
    // The caption is derived only from these graph/selection inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, reduced, step, selected, spec, locale, markup]);
    useEffect(() => {
        // Synchronize playback with the external accessibility preference.
        if (reduced) setPlaying(false);
    }, [reduced]);

    const select = useCallback((id: string | null) => { setPlaying(false); setSelected(id); }, []);
    const go = (next: number | null) => { setPlaying(false); setSelected(null); setStep(next); };
    const fit = () => {
        position.current = { x: 0.5, y: 0.5 };
        setZoom(1); setReading(false); setReset(value => value + 1);
    };
    const download = async (format: 'svg' | 'png') => {
        if (exporting) return;
        const controller = new AbortController();
        exportRequest.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 30000);
        setExporting(true); setExportFailed(false);
        try {
            // Export the complete graph, independent of selection, zoom or hidden steps.
            const response = await apiFetch('/api/diagram/render', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spec, theme: isDark ? 'dark' : 'light', format, embed_title: true, lang: locale }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error('export failed');
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url; link.download = `counselorbot-diagram.${format}`;
            document.body.appendChild(link); link.click(); link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch { setExportFailed(true); }
        finally { window.clearTimeout(timeout); setExporting(false); }
    };

    const controls = (full: boolean) => <div className="space-y-2 border-b border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={spec.title}>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                <button type="button" className={`${controlClass} ${!reading ? 'bg-indigo-50 text-indigo-800' : ''}`} aria-pressed={!reading} onClick={fit}>{labels('overview')}</button>
                <button type="button" className={`${controlClass} ${reading ? 'bg-indigo-50 text-indigo-800' : ''}`} aria-pressed={reading} onClick={() => { if (!reading && !selected) position.current = { x: 0.5, y: 0 }; setReading(true); setZoom(1); }}>{labels('reading')}</button>
            </div>
            <button type="button" disabled={!markup} className={`${controlClass} ${step !== null ? 'bg-indigo-50 text-indigo-800' : ''}`} aria-pressed={step !== null}
                onClick={() => go(step === null ? 0 : null)}>{labels('walk')}</button>
            {full ? <Tooltip content={diagramFullscreenLabel('close', locale)}><button type="button" autoFocus className={controlClass} onClick={closeFullscreen} aria-label={diagramFullscreenLabel('close', locale)}><X className="h-5 w-5" /></button></Tooltip>
                : <button type="button" ref={expandButton} disabled={!markup} className={controlClass} onClick={() => { setCardBodyHeight(cardBody.current?.getBoundingClientRect().height ?? 0); setIsFullscreen(true); }} aria-label={diagramFullscreenLabel('open', locale)}>
                    <Maximize2 className="h-4 w-4" /><span>{labels('expand')}</span>
                </button>}
        </div>
        <details>
            <summary className={`${controlClass} w-fit cursor-pointer text-slate-600`}>{labels('tools')}</summary>
            <div className="flex flex-wrap items-center gap-1 py-1">
                <Tooltip content={diagramZoomLabel('out', locale)}><button type="button" className={controlClass} disabled={zoom <= 0.25} aria-label={diagramZoomLabel('out', locale)} onClick={() => setZoom(value => Math.max(0.25, value / 1.25))}><ZoomOut className="h-5 w-5" /></button></Tooltip>
                <span data-diagram-zoom className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
                <Tooltip content={diagramZoomLabel('in', locale)}><button type="button" className={controlClass} disabled={zoom >= 4} aria-label={diagramZoomLabel('in', locale)} onClick={() => setZoom(value => Math.min(4, value * 1.25))}><ZoomIn className="h-5 w-5" /></button></Tooltip>
                <button type="button" className={controlClass} onClick={fit}>{labels('fit')}</button>
                {(['svg', 'png'] as const).map(format => <button key={format} type="button" className={controlClass} disabled={exporting} onClick={() => void download(format)}>
                    <Download className="h-4 w-4" />{labels('download')} {format.toUpperCase()}
                </button>)}
            </div>
            <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" checked={motion} disabled={reduced} onChange={event => setAnimate(event.target.checked)} />{labels('motion')}
            </label>
            {reduced && <p className="text-xs text-slate-600">{labels('reduced')}</p>}
        </details>
        {exportFailed && <p role="alert" className="text-sm text-red-800">{labels('exportFailed')}</p>}
    </div>;

    const body = (full: boolean) => <>
        {markup ? <DiagramViewport markup={markup} spec={spec} zoom={zoom} setZoom={setZoom} reading={reading}
            step={step} selected={selected} onSelect={select} fullscreen={full} positionRef={position} reset={reset}
            motion={motion} label={spec.title} />
            : failed ? <div className="space-y-2 p-4"><p role="status">{diagramRequestLabel('renderFailed', locale)}</p>
                <button type="button" className={controlClass} onClick={() => setRetry(value => value + 1)}>{diagramRequestLabel('retry', locale)}</button></div>
                : <div className="flex min-h-40 items-center justify-center gap-2 p-4 text-sm text-indigo-700" role="status">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />{labels('loading')}</div>}
        <div className={`space-y-3 border-t border-slate-200 p-3 ${full ? 'max-h-[35dvh] shrink-0 overflow-auto' : ''}`}>
            {step !== null && <div className="flex flex-wrap items-center gap-1">
                <Tooltip content={diagramStepLabel('back', locale)}><button type="button" className={controlClass} disabled={step === 0} aria-label={diagramStepLabel('back', locale)} onClick={() => go(Math.max(0, step - 1))}><ChevronLeft className="h-5 w-5" /></button></Tooltip>
                <span className="text-sm font-semibold tabular-nums">{labels('step', { current: step + 1, total: spec.nodes.length })}</span>
                <Tooltip content={diagramStepLabel('forward', locale)}><button type="button" className={controlClass} disabled={step === spec.nodes.length - 1} aria-label={diagramStepLabel('forward', locale)} onClick={() => go(Math.min(spec.nodes.length - 1, step + 1))}><ChevronRight className="h-5 w-5" /></button></Tooltip>
                <button type="button" className={controlClass} onClick={() => go(null)}>{labels('whole')}</button>
                <button type="button" className={controlClass} disabled={reduced || !markup} onClick={() => {
                    if (playing) setPlaying(false);
                    else { setSelected(null); if (step === spec.nodes.length - 1) setStep(0); setPlaying(true); }
                }}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{labels(playing ? 'pause' : 'play')}</button>
            </div>}
            {activeNode ? <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-slate-800" role="status" aria-live="polite">
                <span className="text-xs font-medium text-indigo-700">{labels(activeNode.form || 'concept')}</span>
                <p className="mt-1 font-semibold">{activeNode.label}</p>
                {relatedEdges.length ? <ul className="mt-2 space-y-2">{relatedEdges.map((edge, index) => <li key={index}>{describeEdge(edge)}</li>)}</ul>
                    : <p className="mt-2">{labels(selected ? 'isolated' : step === 0 ? 'starting' : 'noNewConnections')}</p>}
                {selected && <button type="button" className={`${controlClass} mt-2`} onClick={() => select(null)}>{labels('clear')}</button>}
            </div> : <p className="text-sm text-slate-600">{labels('exploreHint')}</p>}
            {full && <p className="text-xs text-slate-600">{labels('gesture')}</p>}
            {failed ? <p className="text-sm font-semibold">{labels('text')}</p> : <button type="button" className={controlClass} aria-expanded={showText} onClick={() => setShowText(value => !value)}>{labels(showText ? 'hideText' : 'text')}</button>}
            {(showText || failed) && <div className="space-y-3 text-sm leading-relaxed text-slate-800">
                <ol className="list-decimal space-y-2 pl-5">{spec.nodes.map(node => <li key={node.id}><span className="font-medium">{node.label}</span> · {labels(node.form || 'concept')}</li>)}</ol>
                <ul className="space-y-2">{(spec.edges || []).map((edge, index) => <li key={index}>{describeEdge(edge)}</li>)}</ul>
            </div>}
        </div>
        <DiagramNote note={spec.note} />
        <DiagramLegend kinds={diagramEdgeKinds(spec)} locale={locale} />
    </>;

    return <>
        <figure inert={isFullscreen} className="my-2 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
            <figcaption className="flex items-start gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" /><span className="min-w-0 break-words">{spec.title}</span>
            </figcaption>
            {controls(false)}
            {isFullscreen ? <div style={{ height: cardBodyHeight }} /> : <div ref={cardBody}>{body(false)}</div>}
        </figure>
        {isFullscreen && createPortal(<div className={`fixed inset-0 z-[80] flex bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4 ${motion ? 'dg-dialog-motion' : ''} ${closing ? 'dg-dialog-closing' : ''}`}
            onMouseDown={event => { if (event.currentTarget === event.target) closeFullscreen(); }}>
            <section ref={dialog} role="dialog" aria-modal="true" aria-label={spec.title}
                className="mx-auto flex h-full w-full max-w-[96rem] flex-col overflow-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
                <header className="px-4 pt-4 text-base font-semibold text-slate-800">{spec.title}</header>
                {controls(true)}
                {body(true)}
            </section>
        </div>, document.body)}
    </>;
}
