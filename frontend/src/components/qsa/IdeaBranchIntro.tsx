'use client';

import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { fetchIdeaBranches, type IdeaBranch } from '@/lib/idea-map';

interface IdeaBranchIntroProps {
    sessionId: string;
    // Cambia a ogni turno concluso e a ogni spostamento: e' il segnale per rileggere.
    version: number;
    locale: string;
    focus: string;
    // Il ramo non ha ancora scambi suoi: la chat davanti agli occhi e' vuota.
    empty: boolean;
}

// Entrare in un ramo nuovo lascia la chat vuota: nessun messaggio di prima
// viene ereditato. Senza una riga che dica dove si e' finiti quel vuoto e' solo
// disorientamento, quindi il ramo si presenta da se': come e' nato, da cosa
// pende, cosa ci si fa dentro.
export function IdeaBranchIntro({ sessionId, version, locale, focus, empty }: IdeaBranchIntroProps) {
    const { t } = useI18n();
    const [rows, setRows] = useState<IdeaBranch[]>([]);

    useEffect(() => {
        let alive = true;
        void fetchIdeaBranches(sessionId, locale).then((rows) => { if (alive) setRows(rows); });
        return () => { alive = false; };
    }, [sessionId, locale, version]);

    const branch = rows.find((row) => row.id === focus);
    if (!branch) return null;

    const parent = branch.parent ? rows.find((row) => row.id === branch.parent) : undefined;

    return (
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                <GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{branch.label}</span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-teal-900/80">
                {t(branch.origin === 'manual' ? 'idea.branches.intro.bornManual' : 'idea.branches.intro.bornTalk')}
                {' '}
                {parent
                    ? `${t('idea.branches.intro.linked')} «${parent.label}».`
                    : t('idea.branches.intro.linkedRoot')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-teal-900/80">
                {t('idea.branches.intro.doing')} {branch.task_label ?? branch.label}.
            </p>
            {empty && (
                <p className="mt-1 text-xs leading-relaxed text-teal-800/70">
                    {t('idea.branches.intro.empty')}
                </p>
            )}
        </div>
    );
}
