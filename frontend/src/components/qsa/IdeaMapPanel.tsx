'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Maximize2, RefreshCw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/lib/i18n-context';
import { useDarkMode } from '@/lib/use-dark-mode';
import { fetchIdeaMap, ideaMapImageUrl, type IdeaMapState, type IdeaRole } from '@/lib/idea-map';

interface IdeaMapPanelProps {
    sessionId: string;
    // Cambia a ogni turno concluso: e' il segnale per rileggere la mappa.
    version: number;
    locale: string;
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
};

export function IdeaMapPanel({ sessionId, version, locale }: IdeaMapPanelProps) {
    const { t } = useI18n();
    const isDark = useDarkMode();
    const [state, setState] = useState<IdeaMapState | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const reload = useCallback(async () => {
        setIsLoading(true);
        try {
            setState(await fetchIdeaMap(sessionId));
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

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

    const revisionId = state?.revision_id ?? null;
    const theme = isDark ? 'dark' : 'light';
    const imageUrl = revisionId === null
        ? null
        : ideaMapImageUrl(sessionId, revisionId, theme, 'svg', locale);

    return (
        <section className="mb-3 w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <h3 className="min-w-0 truncate text-sm font-semibold text-slate-800">
                    {t('idea.map.title')}
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
                    {imageUrl && (
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

            {imageUrl ? (
                <div className="w-full overflow-x-auto p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl}
                        alt={state?.description || t('idea.map.title')}
                        className="mx-auto max-w-full"
                    />
                </div>
            ) : (
                <p className="px-3 py-4 text-sm text-slate-500">{t('idea.map.empty')}</p>
            )}

            {state && state.missing_roles.length > 0 && (
                <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <span className="font-medium">{t('idea.map.missing')}</span>{' '}
                    {state.missing_roles.map((role) => t(MISSING_KEY[role])).join(' · ')}
                </div>
            )}
            {state?.complete && (
                <p className="border-t border-slate-200 px-3 py-2 text-xs text-teal-700">
                    {t('idea.map.complete')}
                </p>
            )}

            {isFullscreen && imageUrl && typeof document !== 'undefined' && createPortal(
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl}
                        alt={state?.description || t('idea.map.title')}
                        className="max-h-full max-w-full"
                        onClick={(event) => event.stopPropagation()}
                    />
                </div>,
                document.body,
            )}
        </section>
    );
}
