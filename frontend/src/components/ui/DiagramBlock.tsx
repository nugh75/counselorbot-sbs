'use client';

import { useEffect, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { completeDiagramEdges, type DiagramSpec } from '@/lib/diagram-content';
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
    const isCurrentRender = renderState.key === renderKey;
    const imageUrl = isCurrentRender ? renderState.imageUrl : null;
    const failed = isCurrentRender && renderState.failed;

    return (
        <figure className="my-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
            <figcaption className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
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
        </figure>
    );
}
