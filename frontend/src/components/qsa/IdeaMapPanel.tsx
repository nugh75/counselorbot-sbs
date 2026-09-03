'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Maximize2, RefreshCw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/lib/i18n-context';
import { useDarkMode } from '@/lib/use-dark-mode';
import {
    fetchIdeaMap,
    fetchIdeaMapSvg,
    ideaMapImageUrl,
    type IdeaMapState,
    type IdeaNextStep,
    type IdeaRole,
    type IdeaVariant,
} from '@/lib/idea-map';

interface IdeaMapPanelProps {
    sessionId: string;
    // Cambia a ogni turno concluso: e' il segnale per rileggere la mappa.
    version: number;
    locale: string;
    variant: IdeaVariant;
    // Cosa il server dice che questo turno deve riparare. Null finche' non e'
    // arrivata la prima risposta.
    move: IdeaNextStep | null;
    // Click su un pezzo della mappa: porta al ramo che lo contiene.
    onPickNode?: (nodeId: string) => void;
}

// Le quattro gambe del ragionamento, nell'ordine in cui il percorso le chiede.
const MISSING_KEY: Record<IdeaRole, string> = {
    idea: 'idea.role.idea',
    assumption: 'idea.role.assumption',
    evidence: 'idea.role.evidence',
    alternative: 'idea.role.alternative',
    implication: 'idea.role.implication',
    'open-question': 'idea.role.openQuestion',
    constraint: 'idea.role.constraint',
    step: 'idea.role.step',
    decision: 'idea.role.decision',
    task: 'idea.role.task',
};

export function IdeaMapPanel({ sessionId, version, locale, variant, move, onPickNode }: IdeaMapPanelProps) {
    const { t } = useI18n();
    const isDark = useDarkMode();
    const [state, setState] = useState<IdeaMapState | null>(null);
    const [svg, setSvg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const theme = isDark ? 'dark' : 'light';

    const reload = useCallback(async () => {
        setIsLoading(true);
        try {
            const next = await fetchIdeaMap(sessionId);
            setState(next);
            // Inline e non <img>: dentro un'immagine i nodi non si possono cliccare.
            setSvg(next?.revision_id == null
                ? null
                : await fetchIdeaMapSvg(sessionId, next.revision_id, theme, locale));
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, theme, locale]);

    useEffect(() => {
        void reload();
    }, [reload, version]);

    useEffect(() => {
        if (!isFullscreen) return;
        const close = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsFullscreen(false);
        };
        document.addEventListener('keydown', close);
        return () => document.removeEventListener('keydown', close);
    }, [isFullscreen]);

    // I difetti non stanno dentro il disegno: il tratteggio si vede, il nome no.
    const flawed = (state?.spec?.nodes ?? []).filter((node) => node.flaw);

    const revisionId = state?.revision_id ?? null;

    return (
        <section className="mb-3 w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <h3 className="min-w-0 truncate text-sm font-semibold text-slate-800">
                    {t('idea.map.title')}
                    {move?.task_label && (
                        <span className="ml-2 font-normal text-slate-500">· {move.task_label}</span>
                    )}
                </h3>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => void reload()}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t('idea.map.refresh')}
                    >
                        {isLoading
                            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                    </button>
                    {svg && (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsFullscreen(true)}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                aria-label={t('idea.map.fullscreen')}
                            >
                                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <a
                                href={ideaMapImageUrl(sessionId, revisionId, theme, 'png', locale)}
                                download="mappa-idea.png"
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                aria-label={t('idea.map.download')}
                            >
                                <Download className="h-4 w-4" aria-hidden="true" />
                            </a>
                        </>
                    )}
                </div>
            </header>

            {svg ? (
                // La mappa cresce in verticale: oltre questa altezza scorre
                // dentro il pannello invece di allungare tutta la pagina.
                <div className="w-full max-h-[26rem] overflow-auto p-3">
                    <IdeaMapCanvas
                        svg={svg}
                        state={state}
                        onPickNode={onPickNode}
                        label={state?.description || t('idea.map.title')}
                    />
                </div>
            ) : (
                <p className="px-3 py-4 text-sm text-slate-500">{t('idea.map.empty')}</p>
            )}

            {flawed.length > 0 && (
                <ul className="border-t border-slate-200 px-3 py-2 text-xs text-amber-800">
                    {flawed.map((node) => (
                        <li key={node.id} className="flex gap-1.5 py-0.5">
                            <span className="font-medium">{node.label}:</span>
                            <span>{move?.flaws?.[node.id] ?? node.flaw}</span>
                        </li>
                    ))}
                </ul>
            )}

            {state && state.missing_roles.length > 0 && (
                <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <span className="font-medium">{t('idea.map.missing')}</span>{' '}
                    {state.missing_roles.map((role) => t(MISSING_KEY[role])).join(' · ')}
                </div>
            )}
            {state?.complete && (
                <p className="border-t border-slate-200 px-3 py-2 text-xs text-teal-700">
                    {t('idea.map.readyToClose')}
                </p>
            )}

            {isFullscreen && svg && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setIsFullscreen(false)}
                >
                    <button
                        type="button"
                        onClick={() => setIsFullscreen(false)}
                        className="absolute right-4 top-4 rounded-md bg-white/90 p-2 text-slate-700"
                        aria-label={t('idea.map.close')}
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                    {/* Misure definite: senza, il flex shrink-to-fit lascia la
                        larghezza indefinita e l'SVG (solo viewBox) collassa a 0x0. */}
                    <div
                        className="h-full w-full max-h-full max-w-full overflow-auto rounded-lg bg-white p-4"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <IdeaMapCanvas
                            svg={svg}
                            state={state}
                            onPickNode={onPickNode}
                            label={state?.description || t('idea.map.title')}
                        />
                    </div>
                </div>,
                document.body,
            )}
        </section>
    );
}

// L'SVG di graphviz porta l'id del nodo dentro <title>, che pero' il browser
// mostra come tooltip: l'id tecnico non dice niente a chi guarda. Qui l'id
// passa su un data attribute e il tooltip diventa l'etichetta vera.
function IdeaMapCanvas({ svg, state, onPickNode, label }: {
    svg: string;
    state: IdeaMapState | null;
    onPickNode?: (nodeId: string) => void;
    label: string;
}) {
    const hostRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const labels = new Map((state?.spec?.nodes ?? []).map((node) => [node.id, node.label]));
        host.querySelectorAll('g.node').forEach((group) => {
            const title = group.querySelector('title');
            const id = title?.textContent?.trim();
            if (!id) return;
            (group as SVGGElement).dataset.nodeId = id;
            const readable = labels.get(id);
            if (title && readable) title.textContent = readable;
        });
    }, [svg, state]);

    const pick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!onPickNode) return;
        const group = (event.target as Element).closest('g.node') as SVGGElement | null;
        const nodeId = group?.dataset.nodeId;
        if (!nodeId) return;
        // Il fuoco sta solo sui rami: un nodo qualsiasi porta al ramo che lo contiene.
        onPickNode(state?.owners?.[nodeId] ?? nodeId);
    };

    return (
        <div
            ref={hostRef}
            role="img"
            aria-label={label}
            onClick={pick}
            className={onPickNode ? '[&_g.node]:cursor-pointer [&_svg]:h-auto [&_svg]:max-w-full' : '[&_svg]:h-auto [&_svg]:max-w-full'}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
