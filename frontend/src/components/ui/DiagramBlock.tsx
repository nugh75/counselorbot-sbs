'use client';

import { useEffect, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { completeDiagramEdges, diagramEdgeKinds, type DiagramEdgeKind, type DiagramSpec } from '@/lib/diagram-content';
import { edgeKindLabel } from '@/lib/i18n-diagram';
import { useDarkMode } from '@/lib/use-dark-mode';

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

export function DiagramBlock({ spec, locale }: DiagramBlockProps) {
    const isDark = useDarkMode();
    const normalizedSpecJson = JSON.stringify(completeDiagramEdges(spec));
    const renderKey = `${isDark ? 'dark' : 'light'}:${locale}:${normalizedSpecJson}`;
    const [renderState, setRenderState] = useState<RenderState>({ key: '', imageUrl: null, failed: false });

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

    const description = `${spec.title}: ${spec.nodes.map((node) => node.label).join('; ')}`;
    // La legenda compare solo se i tratti sono piu' d'uno: un tratto solo non ha nulla da spiegare.
    const legendKinds = diagramEdgeKinds(completeDiagramEdges(spec));
    const isCurrentRender = renderState.key === renderKey;
    const imageUrl = isCurrentRender ? renderState.imageUrl : null;
    const failed = isCurrentRender && renderState.failed;

    // Il fondo della card e' lo stesso colore della pastiglia sotto le etichette del disegno.
    return (
        <figure className="my-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <figcaption className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                <GitBranch className="h-4 w-4 shrink-0 text-[#17747a]" aria-hidden="true" />
                <span>{spec.title}</span>
            </figcaption>
            {imageUrl ? (
                // Il renderer restituisce un SVG gia' accessibile e dimensionato dal backend.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={description} className="mx-auto block h-auto max-h-[26rem] w-full p-3" />
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
            {imageUrl && legendKinds.length > 0 ? (
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                    {legendKinds.map((kind) => (
                        <li key={kind} className="flex items-center gap-1.5">
                            <KindSample kind={kind} />
                            <span>{edgeKindLabel(kind, locale)}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </figure>
    );
}
