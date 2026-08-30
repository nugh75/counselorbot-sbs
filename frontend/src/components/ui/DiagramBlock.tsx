'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Loader2, Maximize2, X } from 'lucide-react';
import { completeDiagramEdges, diagramEdgeKinds, type DiagramEdgeKind, type DiagramSpec } from '@/lib/diagram-content';
import { diagramFullscreenLabel, edgeKindLabel } from '@/lib/i18n-diagram';
import { useDarkMode } from '@/lib/use-dark-mode';
import { Tooltip } from '@/components/ui/Tooltip';

interface DiagramBlockProps {
    spec: DiagramSpec;
    locale: string;
}

interface RenderState {
    key: string;
    imageUrl: string | null;
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

export function DiagramBlock({ spec, locale }: DiagramBlockProps) {
    const isDark = useDarkMode();
    const normalizedSpecJson = JSON.stringify(completeDiagramEdges(spec));
    const renderKey = `${isDark ? 'dark' : 'light'}:${locale}:${normalizedSpecJson}`;
    const [renderState, setRenderState] = useState<RenderState>({ key: '', imageUrl: null, failed: false });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const expandButtonRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        let objectUrl: string | null = null;

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
                return response.blob();
            })
            .then((blob) => {
                if (controller.signal.aborted) return;
                objectUrl = URL.createObjectURL(blob);
                setRenderState({ key: renderKey, imageUrl: objectUrl, failed: false });
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') return;
                setRenderState({ key: renderKey, imageUrl: null, failed: true });
            });

        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
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
    const imageUrl = isCurrentRender ? renderState.imageUrl : null;
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
                {imageUrl ? (
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
                ) : null}
            </figcaption>
            {imageUrl ? (
                <div className="flex w-full min-w-0 max-w-full justify-center overflow-hidden p-3">
                    {/* Il diagramma si riduce entro la card; la misura naturale resta disponibile in fullscreen. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt={description} className="block h-auto max-h-[26rem] w-auto max-w-full object-contain" />
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
            {imageUrl ? <DiagramLegend kinds={legendKinds} locale={locale} /> : null}
            {isFullscreen && imageUrl ? createPortal(
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
                        </header>
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imageUrl} alt={description} className="block h-full max-h-full w-full max-w-full object-contain" />
                        </div>
                        <DiagramLegend kinds={legendKinds} locale={locale} />
                    </section>
                </div>,
                document.body,
            ) : null}
        </figure>
    );
}
