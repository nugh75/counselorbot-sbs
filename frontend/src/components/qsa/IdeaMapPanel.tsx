'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, History, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { DiagramBlock } from '@/components/ui/DiagramBlock';
import { Button, Spinner } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { useDarkMode } from '@/lib/use-dark-mode';
import { EDITABLE_ROLES } from '@/lib/idea-roles';
import {
    addIdeaNode,
    deleteIdeaBranch,
    editIdeaNode,
    fetchIdeaMap,
    fetchIdeaMapHistory,
    fetchIdeaMapSvg,
    ideaMapImageUrl,
    type IdeaMapStage,
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
    // Un nodo corretto, aggiunto o tolto cambia la mappa per tutti i pannelli.
    onEdited?: () => void;
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

export function IdeaMapPanel({ sessionId, version, locale, move, onPickNode, onEdited }: IdeaMapPanelProps) {
    const { t } = useI18n();
    const isDark = useDarkMode();
    const [state, setState] = useState<IdeaMapState | null>(null);
    const [svg, setSvg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // Correggere e navigare si pesterebbero i piedi sullo stesso clic: le
    // correzioni stanno dietro un interruttore.
    const [editing, setEditing] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [draftLabel, setDraftLabel] = useState('');
    const [draftRole, setDraftRole] = useState<IdeaRole>('assumption');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    // Le tappe della mappa e quella che si sta guardando. Null = adesso.
    const [stages, setStages] = useState<IdeaMapStage[]>([]);
    const [stage, setStage] = useState<number | null>(null);
    const theme = isDark ? 'dark' : 'light';

    const fetchAll = useCallback(async () => {
        const [next, tappe] = await Promise.all([
            fetchIdeaMap(sessionId, locale),
            fetchIdeaMapHistory(sessionId),
        ]);
        // Inline e non <img>: dentro un'immagine i nodi non si possono cliccare.
        const nextSvg = next?.revision_id == null
            ? null
            : await fetchIdeaMapSvg(sessionId, next.revision_id, theme, locale, stage);
        return { next, tappe, nextSvg };
    }, [sessionId, theme, locale, stage]);

    const reload = useCallback(async () => {
        setIsLoading(true);
        try {
            const { next, tappe, nextSvg } = await fetchAll();
            setState(next);
            setStages(tappe);
            setSvg(nextSvg);
        } finally {
            setIsLoading(false);
        }
    }, [fetchAll]);

    useEffect(() => {
        let active = true;
        void fetchAll().then(({ next, tappe, nextSvg }) => {
            if (!active) return;
            setState(next);
            setStages(tappe);
            setSvg(nextSvg);
        });
        return () => { active = false; };
    }, [fetchAll, version]);

    const select = (nodeId: string) => {
        const node = (state?.spec?.nodes ?? []).find((item) => item.id === nodeId);
        if (!node) return;
        setAdding(false);
        setFailed(false);
        setSelected(nodeId);
        setDraftLabel(node.label);
        setDraftRole((node.role ?? 'assumption') as IdeaRole);
    };

    const closeEditor = () => {
        setSelected(null);
        setAdding(false);
        setDraftLabel('');
        setFailed(false);
    };

    const done = async (ok: boolean) => {
        if (!ok) {
            setFailed(true);
            return;
        }
        closeEditor();
        await reload();
        onEdited?.();
    };

    const saveNode = async () => {
        const label = draftLabel.trim();
        if (!label) return;
        setBusy(true);
        setFailed(false);
        try {
            await done(selected
                ? await editIdeaNode(sessionId, selected, draftLabel, draftRole)
                : (await addIdeaNode(sessionId, draftLabel, draftRole)) !== null);
        } finally {
            setBusy(false);
        }
    };

    const removeNode = async () => {
        if (!selected) return;
        setBusy(true);
        setFailed(false);
        try {
            await done(await deleteIdeaBranch(sessionId, selected, false));
        } finally {
            setBusy(false);
        }
    };

    // Guardare indietro non e' modificare: la tappa scelta e' un'altra mappa,
    // e correggerla vorrebbe dire correggere qualcosa che non c'e' piu'.
    const past = stage !== null;

    // I difetti non stanno dentro il disegno: il tratteggio si vede, il nome no.
    const flawed = (state?.spec?.nodes ?? []).filter((node) => node.flaw);

    const revisionId = state?.revision_id ?? null;

    return (
        <section className="mb-3 w-full min-w-0 overflow-hidden rounded-card border border-slate-200 bg-white">
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
                        onClick={() => { setEditing((value) => !value); closeEditor(); }}
                        aria-pressed={editing}
                        disabled={past}
                        aria-label={t('idea.map.edit')}
                        className={cn(
                            'rounded-control p-1.5',
                            editing
                                ? 'bg-brand text-ink-on-brand hover:bg-brand-hover'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                        )}
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => void reload()}
                        className="rounded-control p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t('idea.map.refresh')}
                    >
                        {isLoading
                            ? <Spinner className="h-4 w-4" aria-hidden="true" />
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
                    onPickNode={editing ? (id: string) => select(id) : onPickNode ? (id: string) => onPickNode(state?.owners?.[id] ?? id) : undefined}
                />
            ) : (
                <p className="px-3 py-4 text-sm text-slate-500">{t('idea.map.empty')}</p>
            )}

            {stages.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <History className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                    <label htmlFor="idea-stage" className="font-medium">{t('idea.map.history')}</label>
                    <input
                        id="idea-stage"
                        type="range"
                        min={0}
                        max={stages.length - 1}
                        step={1}
                        value={stage === null
                            ? stages.length - 1
                            : stages.findIndex((row) => row.revision_id === stage)}
                        onChange={(event) => {
                            const index = Number(event.target.value);
                            setEditing(false);
                            closeEditor();
                            setStage(index === stages.length - 1 ? null : stages[index].revision_id);
                        }}
                        className="h-1.5 w-32 cursor-pointer accent-brand"
                    />
                    <span>
                        {(stage === null
                            ? stages.length
                            : stages.findIndex((row) => row.revision_id === stage) + 1)} / {stages.length}
                    </span>
                    {past && (
                        <button
                            type="button"
                            onClick={() => setStage(null)}
                            className="ml-auto rounded-full border border-slate-200 px-2 py-0.5 font-medium text-slate-600 hover:border-slate-300"
                        >
                            {t('idea.map.backToNow')}
                        </button>
                    )}
                </div>
            )}

            {editing && (
                <div className="border-t border-slate-200 px-3 py-2">
                    {selected || adding ? (
                        <div className="space-y-2">
                            <label htmlFor="idea-node-label" className="block text-xs font-medium text-slate-600">
                                {t('idea.map.nodeLabel')}
                            </label>
                            <input
                                id="idea-node-label"
                                value={draftLabel}
                                onChange={(event) => setDraftLabel(event.target.value)}
                                maxLength={80}
                                autoFocus
                                className="w-full rounded-control border border-slate-300 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <label htmlFor="idea-node-role" className="text-xs font-medium text-slate-600">
                                    {t('idea.map.nodeRole')}
                                </label>
                                <select
                                    id="idea-node-role"
                                    value={draftRole}
                                    onChange={(event) => setDraftRole(event.target.value as IdeaRole)}
                                    className="rounded-control border border-slate-300 px-2 py-1 text-xs text-slate-800"
                                >
                                    {EDITABLE_ROLES.map((role) => (
                                        <option key={role} value={role}>{t(MISSING_KEY[role])}</option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => void saveNode()}
                                    disabled={!draftLabel.trim() || busy}
                                    className="gap-1 px-2"
                                >
                                    {busy
                                        ? <Spinner className="h-3.5 w-3.5" aria-hidden="true" />
                                        : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                                    {t('idea.map.save')}
                                </Button>
                                {selected && (
                                    <button
                                        type="button"
                                        onClick={() => void removeNode()}
                                        disabled={busy}
                                        className="inline-flex items-center gap-1 rounded-control border border-danger-line px-2 py-1 text-xs text-danger-ink hover:bg-danger-soft disabled:opacity-50"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        {t('idea.map.deleteNode')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={closeEditor}
                                    className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                    {t('idea.branches.cancel')}
                                </button>
                            </div>
                            {failed && <p className="text-xs text-danger-ink">{t('idea.map.editError')}</p>}
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs text-slate-500">{t('idea.map.editHint')}</p>
                            <button
                                type="button"
                                onClick={() => { setAdding(true); setDraftLabel(''); setDraftRole('assumption'); }}
                                className="ml-auto inline-flex items-center gap-1 rounded-control border border-dashed border-brand-line px-2 py-1 text-xs font-medium text-link hover:bg-brand-soft"
                            >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('idea.map.addNode')}
                            </button>
                        </div>
                    )}
                </div>
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
                <p className="border-t border-slate-200 px-3 py-2 text-xs text-link">
                    {t('idea.map.readyToClose')}
                </p>
            )}

        </section>
    );
}
