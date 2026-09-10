'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { DiagramBlock } from '@/components/ui/DiagramBlock';
import { OpenTavoloButton } from '@/components/tavolo/OpenTavoloButton';
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

export function IdeaMapPanel({ sessionId, version, locale, move, onPickNode }: IdeaMapPanelProps) {
    const { t } = useI18n();
    const isDark = useDarkMode();
    const [state, setState] = useState<IdeaMapState | null>(null);
    const [svg, setSvg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
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
                    {/* La mappa e' gia' un vocabolario: al tavolo arriva tradotta,
                        senza passare da un modello e senza perdere pezzi. */}
                    {state?.spec && (
                        <OpenTavoloButton
                            sessionId={sessionId}
                            instrument="IDEA"
                            locale={locale}
                            ideaMap={state.spec}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        />
                    )}
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
                </div>
            </header>

            {svg ? (
                <DiagramBlock
                    spec={{
                        type: 'relation',
                        title: state?.spec?.title || t('idea.map.title'),
                        nodes: state?.spec?.nodes ?? [],
                        edges: state?.spec?.edges ?? [],
                        note: state?.description || undefined,
                    }}
                    locale={locale}
                    renderedSvg={svg}
                    imageUrl={format => ideaMapImageUrl(sessionId, revisionId, theme, format, locale)}
                    onPickNode={onPickNode ? id => onPickNode(state?.owners?.[id] ?? id) : undefined}
                />
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

        </section>
    );
}
