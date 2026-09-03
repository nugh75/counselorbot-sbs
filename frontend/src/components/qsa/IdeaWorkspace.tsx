'use client';

import { useState } from 'react';
import { CheckCheck, ChevronDown, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { IdeaBranchTree } from '@/components/qsa/IdeaBranchTree';
import { IdeaConclusion } from '@/components/qsa/IdeaConclusion';
import { IdeaMapPanel } from '@/components/qsa/IdeaMapPanel';
import { IdeaSourcesPanel } from '@/components/qsa/IdeaSourcesPanel';
import { IDEA_PACE_STOPS, moveIdeaFocus, type IdeaNextStep, type IdeaVariant } from '@/lib/idea-map';

interface IdeaWorkspaceProps {
    sessionId: string;
    version: number;
    locale: string;
    variant: IdeaVariant;
    move: IdeaNextStep | null;
    // Quanti scambi si vuole che duri. 0 = finche' serve.
    budget: number;
    onBudgetChange: (budget: number) => void;
    onFocusMoved: () => void;
}

// Mappa e rami stanno SOTTO la chat, non dentro il flusso dei messaggi: li' si
// allontanavano a ogni turno, e la mappa e' la cosa che deve restare sempre a
// portata. Collassabile perche' su uno schermo piccolo la conversazione viene
// prima.
export function IdeaWorkspace({ sessionId, version, locale, variant, move, budget, onBudgetChange, onFocusMoved }: IdeaWorkspaceProps) {
    const { t } = useI18n();
    // Aperto di default: la mappa e' la cosa che deve stare sotto gli occhi.
    const [open, setOpen] = useState(true);
    const [concluding, setConcluding] = useState(false);
    // Quando ogni ramo e' chiuso la chiusura non e' piu' una via d'uscita:
    // e' il passo che tocca, e si vede.
    const finished = move?.reason === 'all-closed';

    // Cliccare un pezzo della mappa porta al ramo che lo contiene: la mappa
    // diventa il modo di muoversi, non solo il posto dove si guarda.
    const pickNode = async (nodeId: string) => {
        if (await moveIdeaFocus(sessionId, nodeId)) onFocusMoved();
    };

    return (
        <section className="glass-panel overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-controls="idea-workspace"
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
                <GitBranch className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <h3 className="min-w-0 flex-1 text-sm font-semibold uppercase tracking-wider text-slate-700">
                    {t('idea.workspace.title')}
                </h3>
                {move?.task_label && (
                    <span className="truncate text-xs text-slate-500">{move.task_label}</span>
                )}
                <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => { event.stopPropagation(); setConcluding(true); }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            setConcluding(true);
                        }
                    }}
                    className={cn(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        finished
                            ? 'bg-teal-700 text-white hover:bg-teal-800'
                            : 'border border-slate-200 text-slate-600 hover:border-slate-300',
                    )}
                >
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('idea.conclude.action')}
                </span>
                <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', !open && '-rotate-90')}
                    aria-hidden="true"
                />
            </button>

            <div id="idea-workspace" className={cn('border-t border-slate-200', !open && 'hidden')}>
                {/* La durata si cambia anche a meta' strada: ci si accorge di
                    avere meno tempo mentre si parla, non prima. */}
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
                    <label htmlFor="idea-pace" className="text-xs font-medium text-slate-600">
                        {t('idea.pace.label')}
                    </label>
                    <input
                        id="idea-pace"
                        type="range"
                        min={0}
                        max={IDEA_PACE_STOPS.length - 1}
                        step={1}
                        value={Math.max(0, IDEA_PACE_STOPS.indexOf(budget as never))}
                        onChange={(event) => onBudgetChange(IDEA_PACE_STOPS[Number(event.target.value)])}
                        className="h-1.5 w-40 cursor-pointer accent-teal-700"
                        aria-valuetext={budget === 0 ? t('idea.pace.unlimited') : `${budget}`}
                    />
                    <span className="text-xs text-slate-500">
                        {budget === 0
                            ? t('idea.pace.unlimited')
                            : `${move?.turns_used ?? 0} / ${budget} ${t('idea.pace.turns')}`}
                    </span>
                    {budget > 0 && (move?.turns_used ?? 0) >= budget * 0.75 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                            {t('idea.pace.nearingEnd')}
                        </span>
                    )}
                </div>

                <div className="grid gap-0 lg:grid-cols-3">
                    <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
                        <h4 className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {t('idea.branches.title')}
                        </h4>
                        <IdeaBranchTree
                            sessionId={sessionId}
                            version={version}
                            locale={locale}
                            onFocusMoved={onFocusMoved}
                        />
                    </div>
                    <div className="p-3 lg:col-span-2">
                        <IdeaMapPanel
                            sessionId={sessionId}
                            version={version}
                            locale={locale}
                            variant={variant}
                            move={move}
                            onPickNode={(nodeId) => void pickNode(nodeId)}
                        />
                    </div>
                </div>

                {/* Le fonti stanno sotto mappa e rami e larghe quanto il
                    pannello: una ricerca produce righe di testo lungo, in una
                    colonna sarebbero illeggibili. */}
                <IdeaSourcesPanel
                    sessionId={sessionId}
                    version={version}
                    locale={locale}
                    focus={move?.focus ?? null}
                />
            </div>

            {concluding && (
                <IdeaConclusion
                    sessionId={sessionId}
                    locale={locale}
                    variant={variant}
                    onClose={() => setConcluding(false)}
                />
            )}
        </section>
    );
}
