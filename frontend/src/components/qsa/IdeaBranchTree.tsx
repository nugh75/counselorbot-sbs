'use client';

import { CheckCircle2, CornerLeftUp, Loader2, RotateCcw, Target } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import {
    fetchIdeaBranches,
    moveIdeaFocus,
    reopenIdeaBranch,
    type IdeaBranch,
    type IdeaRole,
} from '@/lib/idea-map';

interface IdeaBranchTreeProps {
    sessionId: string;
    version: number;
    locale: string;
    onFocusMoved: () => void;
}

const ROLE_KEY: Record<IdeaRole, string> = {
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

export function IdeaBranchTree({ sessionId, version, locale, onFocusMoved }: IdeaBranchTreeProps) {
    const { t } = useI18n();
    const [rows, setRows] = useState<IdeaBranch[]>([]);
    const [moving, setMoving] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setRows(await fetchIdeaBranches(sessionId, locale));
    }, [sessionId, locale]);

    useEffect(() => { void reload(); }, [reload, version]);

    const reopenBranch = async (nodeId: string) => {
        setMoving(nodeId);
        try {
            if (await reopenIdeaBranch(sessionId, nodeId)) {
                await reload();
                onFocusMoved();
            }
        } finally {
            setMoving(null);
        }
    };

    const goTo = async (nodeId: string) => {
        setMoving(nodeId);
        try {
            if (await moveIdeaFocus(sessionId, nodeId)) {
                await reload();
                onFocusMoved();
            }
        } finally {
            setMoving(null);
        }
    };

    if (rows.length === 0) {
        return <p className="px-3 py-4 text-xs text-slate-500">{t('idea.branches.empty')}</p>;
    }

    const focused = rows.find((row) => row.is_focus);

    return (
        <div className="space-y-1 p-2">
            {rows.map((row) => {
                const isRoot = row.depth === 0;
                return (
                    <button
                        key={row.id}
                        type="button"
                        onClick={() => void goTo(row.id)}
                        disabled={row.is_focus || moving !== null}
                        style={{ paddingLeft: `${0.5 + row.depth * 1.1}rem` }}
                        className={cn(
                            'flex w-full items-start gap-2 rounded-lg py-2 pr-2 text-left text-xs transition-colors',
                            row.is_focus
                                ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-300'
                                : 'text-slate-600 hover:bg-slate-50 disabled:opacity-60',
                        )}
                    >
                        <span className="mt-0.5 shrink-0">
                            {moving === row.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                : row.closed
                                    ? <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                                    : row.is_focus
                                        ? <Target className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                                        : <span className="ml-1 block h-1.5 w-1.5 rounded-full bg-slate-300" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className={cn('font-medium', isRoot && 'text-slate-900')}>{row.label}</span>
                                {row.task_label && (
                                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                        {row.task_label}
                                    </span>
                                )}
                            </span>
                            {row.closed && row.conclusion && (
                                <span className="mt-0.5 block text-[11px] text-teal-700">{row.conclusion}</span>
                            )}
                            {row.closed && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(event) => { event.stopPropagation(); void reopenBranch(row.id); }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void reopenBranch(row.id);
                                        }
                                    }}
                                    className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-300"
                                >
                                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                    {t('idea.branches.reopen')}
                                </span>
                            )}
                            {!row.closed && row.missing_roles.length > 0 && (
                                <span className="mt-0.5 block text-[11px] text-slate-400">
                                    {t('idea.map.missing')} {row.missing_roles.map((r) => t(ROLE_KEY[r])).join(' · ')}
                                </span>
                            )}
                            {row.flaws > 0 && (
                                <span className="mt-0.5 block text-[11px] text-amber-700">
                                    {t('idea.branches.flaws')} {row.flaws}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}

            {focused?.parent && (
                <button
                    type="button"
                    onClick={() => void goTo(focused.parent as string)}
                    disabled={moving !== null}
                    className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                >
                    <CornerLeftUp className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('idea.branches.goUp')}
                </button>
            )}
        </div>
    );
}
