'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Loader2, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { completeDiagramEdges, diagramEdgeKinds, type DiagramEdgeKind, type DiagramSpec } from '@/lib/diagram-content';
import { diagramFullscreenLabel, diagramZoomLabel, edgeKindLabel } from '@/lib/i18n-diagram';
import { focusDiagramNode, sanitizeSvgMarkup, tagDiagramSvg } from '@/lib/diagram-svg';
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

// Trascinamento: ingrandito, il disegno si sposta prendendolo, come una mappa.
// Le barre di scorrimento restano, e su touch lo scorrimento nativo basta gia'.
function usePanning(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
    const [dragging, setDragging] = useState(false);

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const node = ref.current;
        if (!enabled || !node || event.pointerType === 'touch' || event.button !== 0) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = node.scrollLeft;
        const startTop = node.scrollTop;
        setDragging(true);
        node.setPointerCapture(event.pointerId);

        const onMove = (moveEvent: PointerEvent) => {
            node.scrollLeft = startLeft - (moveEvent.clientX - startX);
            node.scrollTop = startTop - (moveEvent.clientY - startY);
        };
        const onUp = () => {
            setDragging(false);
            node.releasePointerCapture(event.pointerId);
            node.removeEventListener('pointermove', onMove);
            node.removeEventListener('pointerup', onUp);
            node.removeEventListener('pointercancel', onUp);
        };
        node.addEventListener('pointermove', onMove);
        node.addEventListener('pointerup', onUp);
        node.addEventListener('pointercancel', onUp);
    };

    const cursor = enabled ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : '';
    return { onPointerDown, cursor };
}

// Passi di zoom: fitti intorno alla dimensione naturale, dove serve regolare, e
// piu' larghi agli estremi, dove serve arrivarci in pochi clic. Sotto 1 il
// disegno rientra in schermi stretti, sopra 1 il contenitore scorre invece di
// rimpicciolire il testo.
const ZOOM_STEPS = [0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

function ZoomControls({
    zoom,
    setZoom,
    locale,
    size,
}: {
    zoom: number;
    setZoom: (value: number) => void;
    locale: string;
    size: 'sm' | 'lg';
}) {
    const index = ZOOM_STEPS.indexOf(zoom);
    const box = size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
    const icon = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
    const button = `inline-flex ${box} shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-[#17747a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17747a] focus-visible:ring-offset-2 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500`;
    return (
        <>
            <Tooltip content={diagramZoomLabel('out', locale)}>
                <button
                    type="button"
                    onClick={() => setZoom(ZOOM_STEPS[Math.max(0, index - 1)])}
                    disabled={index <= 0}
                    className={button}
                    aria-label={diagramZoomLabel('out', locale)}
                >
                    <ZoomOut className={icon} aria-hidden="true" />
                </button>
            </Tooltip>
            <Tooltip content={diagramZoomLabel('reset', locale)}>
                <button
                    type="button"
                    onClick={() => setZoom(1)}
                    disabled={zoom === 1}
                    className={`${button} text-2xs font-semibold tabular-nums`}
                    aria-label={diagramZoomLabel('reset', locale)}
                >
                    {Math.round(zoom * 100)}%
                </button>
            </Tooltip>
            <Tooltip content={diagramZoomLabel('in', locale)}>
                <button
                    type="button"
                    onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, index + 1)])}
                    disabled={index >= ZOOM_STEPS.length - 1}
                    className={button}
                    aria-label={diagramZoomLabel('in', locale)}
                >
                    <ZoomIn className={icon} aria-hidden="true" />
                </button>
            </Tooltip>
        </>
    );
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

function DiagramSurface({
    markup,
    spec,
    zoom,
    description,
    maxHeight,
}: {
    markup: string;
    spec: DiagramSpec;
    zoom: number;
    description: string;
    maxHeight: string;
}) {
    const hostRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const svg = hostRef.current?.querySelector('svg');
        if (!svg) return;
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', description);
        tagDiagramSvg(svg, spec);

        const host = svg;
        const over = (event: Event) => {
            const node = (event.target as Element | null)?.closest?.('.dg-node');
            focusDiagramNode(host, node?.getAttribute('data-node') ?? null);
        };
        const out = () => focusDiagramNode(host, null);
        host.addEventListener('pointerover', over);
        host.addEventListener('pointerleave', out);
        return () => {
            host.removeEventListener('pointerover', over);
            host.removeEventListener('pointerleave', out);
        };
    }, [markup, spec, description]);

    return (
        <div
            ref={hostRef}
            className="dg-svg block shrink-0"
            style={{ width: `${zoom * 100}%`, maxHeight: zoom === 1 ? maxHeight : undefined }}
            dangerouslySetInnerHTML={{ __html: markup }}
        />
    );
}


export function DiagramBlock({ spec, locale }: DiagramBlockProps) {
    const isDark = useDarkMode();
    const normalizedSpecJson = JSON.stringify(completeDiagramEdges(spec));
    const renderKey = `${isDark ? 'dark' : 'light'}:${locale}:${normalizedSpecJson}`;
    const [renderState, setRenderState] = useState<RenderState>({ key: '', markup: null, failed: false });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const cardScrollRef = useRef<HTMLDivElement>(null);
    const fullScrollRef = useRef<HTMLDivElement>(null);
    const cardPan = usePanning(cardScrollRef, zoom > 1);
    const fullPan = usePanning(fullScrollRef, zoom > 1);
    const expandButtonRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();

        // Il disegno entra nel DOM invece che in un <img>: solo cosi' nodi e
        // archi si possono animare e mettere a fuoco. Passa da un ripulitore,
        // perche' le etichette le scrive un modello.
        void fetch('/api/diagram/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spec: JSON.parse(normalizedSpecJson),
                theme: isDark ? 'dark' : 'light',
                format: 'svg',
                embed_title: false,
                lang: locale,
            }),
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok) throw new Error(`diagram render failed: ${response.status}`);
                return response.text();
            })
            .then((source) => {
                if (controller.signal.aborted) return;
                const markup = sanitizeSvgMarkup(source);
                if (!markup) throw new Error('diagram markup rejected');
                setRenderState({ key: renderKey, markup, failed: false });
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') return;
                setRenderState({ key: renderKey, markup: null, failed: true });
            });

        return () => controller.abort();
    }, [isDark, locale, normalizedSpecJson, renderKey]);

    useEffect(() => {
        if (!isFullscreen) return;
        const originButton = expandButtonRef.current;
        const previousOverflow = document.body.style.overflow;
        const close = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsFullscreen(false);
            if (event.key === 'Tab') {
                event.preventDefault();
                closeButtonRef.current?.focus();
            }
        };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', close);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', close);
            originButton?.focus();
        };
    }, [isFullscreen]);

    const description = `${spec.title}: ${spec.nodes.map((node) => node.label).join('; ')}`;
    // La legenda compare solo se i tratti sono piu' d'uno: un tratto solo non ha nulla da spiegare.
    const legendKinds = diagramEdgeKinds(completeDiagramEdges(spec));
    const isCurrentRender = renderState.key === renderKey;
    const markup = isCurrentRender ? renderState.markup : null;
    const failed = isCurrentRender && renderState.failed;
    const openFullscreenLabel = diagramFullscreenLabel('open', locale);
    const closeFullscreenLabel = diagramFullscreenLabel('close', locale);

    // Il fondo della card e' lo stesso colore della pastiglia sotto le etichette del disegno.
    return (
        <figure className="my-2 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
            <figcaption className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                <span className="flex min-w-0 items-center gap-2">
                    <GitBranch className="h-4 w-4 shrink-0 text-[#17747a]" aria-hidden="true" />
                    <span className="truncate">{spec.title}</span>
                </span>
                {markup ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                        <ZoomControls zoom={zoom} setZoom={setZoom} locale={locale} size="sm" />
                        <Tooltip content={openFullscreenLabel}>
                            <button
                                ref={expandButtonRef}
                                type="button"
                                onClick={() => setIsFullscreen(true)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-[#17747a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17747a] focus-visible:ring-offset-2"
                                aria-label={openFullscreenLabel}
                            >
                                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </Tooltip>
                    </span>
                ) : null}
            </figcaption>
            {markup ? (
                <div
                    ref={cardScrollRef}
                    onPointerDown={cardPan.onPointerDown}
                    className={`flex w-full min-w-0 max-w-full justify-center overflow-auto p-3 ${cardPan.cursor}`}
                >
                    {/* A misura naturale il diagramma sta dentro la card; ingrandito la card scorre. */}
                    <DiagramSurface markup={markup} spec={spec} zoom={zoom} description={description} maxHeight="26rem" />
                </div>
            ) : failed ? (
                <ol className="grid gap-2 p-3 sm:grid-cols-2" aria-label={spec.title}>
                    {spec.nodes.map((node, index) => (
                        <li
                            key={node.id}
                            className="flex items-start gap-2 rounded-lg border border-[#69abad]/60 bg-white px-3 py-2 text-sm leading-snug text-slate-800"
                        >
                            <span className="font-mono text-xs font-semibold text-[#17747a]">{index + 1}</span>
                            <span>{node.label}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <div className="flex min-h-28 items-center justify-center text-[#17747a]" role="status">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span className="sr-only">{spec.title}</span>
                </div>
            )}
            {markup ? <DiagramLegend kinds={legendKinds} locale={locale} /> : null}
            {isFullscreen && markup ? createPortal(
                <div
                    className="fixed inset-0 z-[80] flex bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4"
                    onMouseDown={(event) => {
                        if (event.currentTarget === event.target) setIsFullscreen(false);
                    }}
                >
                    <section
                        className="mx-auto flex h-full w-full max-w-[96rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                        aria-label={spec.title}
                    >
                        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                            <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-800">
                                <GitBranch className="h-5 w-5 shrink-0 text-[#17747a]" aria-hidden="true" />
                                <span className="truncate">{spec.title}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-0.5">
                            <ZoomControls zoom={zoom} setZoom={setZoom} locale={locale} size="lg" />
                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={() => setIsFullscreen(false)}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17747a] focus-visible:ring-offset-2"
                                aria-label={closeFullscreenLabel}
                                autoFocus
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                            </span>
                        </header>
                        <div
                            ref={fullScrollRef}
                            onPointerDown={fullPan.onPointerDown}
                            className={`flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6 ${fullPan.cursor}`}
                        >
                            <DiagramSurface markup={markup} spec={spec} zoom={zoom} description={description} maxHeight="100%" />
                        </div>
                        <DiagramLegend kinds={legendKinds} locale={locale} />
                    </section>
                </div>,
                document.body,
            ) : null}
        </figure>
    );
}
