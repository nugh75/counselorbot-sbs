'use client';

import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { IdeaBranchTree } from '@/components/qsa/IdeaBranchTree';
import { IdeaConclusion } from '@/components/qsa/IdeaConclusion';
import { IdeaMapPanel } from '@/components/qsa/IdeaMapPanel';
import { IDEA_PACE_STOPS, moveIdeaFocus, type IdeaNextStep, type IdeaVariant } from '@/lib/idea-map';

interface IdeaPanelProps {
    sessionId: string;
    version: number;
    locale: string;
    variant: IdeaVariant;
    move: IdeaNextStep | null;
    // Quanti scambi si vuole che duri. 0 = finche' serve.
    budget: number;
    onBudgetChange: (budget: number) => void;
    onFocusMoved: () => void;
    // Su schermo largo mappa e rami stanno insieme nel pannello; su telefono
    // sono due schede, e ognuna chiede solo il suo pezzo.
    show?: 'all' | 'map' | 'branches';
}

// Mappa e rami accanto alla conversazione. Sotto la chat si raggiungevano solo
// scorrendo, e la mappa e' la cosa che deve restare sotto gli occhi mentre si
// scrive.
export function IdeaPanel({
    sessionId, version, locale, variant, move, budget, onBudgetChange, onFocusMoved, show = 'all',
}: IdeaPanelProps) {
    const { t } = useI18n();
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
        <div className="space-y-3">
            {show !== 'branches' && (
                <>
                    {/* La durata si cambia anche a meta' strada: ci si accorge di
                        avere meno tempo mentre si parla, non prima. */}
                    <div className="flex flex-wrap items-center gap-2">
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
                            className="h-1.5 w-28 cursor-pointer accent-teal-700"
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
                        <button
                            type="button"
                            onClick={() => setConcluding(true)}
                            className={cn(
                                'ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                finished
                                    ? 'bg-teal-700 text-white hover:bg-teal-800'
                                    : 'border border-slate-200 text-slate-600 hover:border-slate-300',
                            )}
                        >
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('idea.conclude.action')}
                        </button>
                    </div>

                    <IdeaMapPanel
                        sessionId={sessionId}
                        version={version}
                        locale={locale}
                        variant={variant}
                        move={move}
                        onPickNode={(nodeId) => void pickNode(nodeId)}
                    />
                </>
            )}

            {show !== 'map' && (
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <h4 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {t('idea.branches.title')}
                    </h4>
                    <IdeaBranchTree
                        sessionId={sessionId}
                        version={version}
                        locale={locale}
                        onFocusMoved={onFocusMoved}
                    />
                </section>
            )}

            {concluding && (
                <IdeaConclusion
                    sessionId={sessionId}
                    locale={locale}
                    variant={variant}
                    onClose={() => setConcluding(false)}
                />
            )}
        </div>
    );
}
