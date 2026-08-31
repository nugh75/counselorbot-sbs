'use client';

import { useState } from 'react';
import { ChevronDown, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { IdeaBranchTree } from '@/components/qsa/IdeaBranchTree';
import { IdeaMapPanel } from '@/components/qsa/IdeaMapPanel';
import type { IdeaNextStep, IdeaVariant } from '@/lib/idea-map';

interface IdeaWorkspaceProps {
    sessionId: string;
    version: number;
    locale: string;
    variant: IdeaVariant;
    move: IdeaNextStep | null;
    onFocusMoved: () => void;
}

// Mappa e rami stanno SOTTO la chat, non dentro il flusso dei messaggi: li' si
// allontanavano a ogni turno, e la mappa e' la cosa che deve restare sempre a
// portata. Collassabile perche' su uno schermo piccolo la conversazione viene
// prima.
export function IdeaWorkspace({ sessionId, version, locale, variant, move, onFocusMoved }: IdeaWorkspaceProps) {
    const { t } = useI18n();
    // Aperto di default: la mappa e' la cosa che deve stare sotto gli occhi.
    const [open, setOpen] = useState(true);

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
                <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', !open && '-rotate-90')}
                    aria-hidden="true"
                />
            </button>

            <div id="idea-workspace" className={cn('border-t border-slate-200', !open && 'hidden')}>
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
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
