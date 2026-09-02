'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, GitBranch, Loader2, Plus, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import {
    createIdeaBranch,
    fetchIdeaBranches,
    moveIdeaFocus,
    type IdeaBranch,
} from '@/lib/idea-map';

interface IdeaBranchBarProps {
    sessionId: string;
    // Cambia a ogni turno concluso e a ogni spostamento: e' il segnale per rileggere.
    version: number;
    locale: string;
    onFocusMoved: () => void;
}

// I comandi dei rami vivevano solo nel pannello sotto la chat, lontano da dove
// si scrive. Qui restano accanto al composer: il ramo su cui si sta e i modi
// per cambiarlo o aprirne un altro, senza scorrere.
export function IdeaBranchBar({ sessionId, version, locale, onFocusMoved }: IdeaBranchBarProps) {
    const { t } = useI18n();
    const [rows, setRows] = useState<IdeaBranch[]>([]);
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState('');
    const [failed, setFailed] = useState(false);

    const reload = useCallback(async () => {
        setRows(await fetchIdeaBranches(sessionId, locale));
    }, [sessionId, locale]);

    useEffect(() => { void reload(); }, [reload, version]);

    const goTo = async (nodeId: string) => {
        setBusy(true);
        try {
            if (await moveIdeaFocus(sessionId, nodeId)) {
                await reload();
                onFocusMoved();
            }
        } finally {
            setBusy(false);
        }
    };

    const addBranch = async () => {
        const name = label.trim();
        if (!name) return;
        setBusy(true);
        setFailed(false);
        try {
            if (await createIdeaBranch(sessionId, name) === null) {
                setFailed(true);
                return;
            }
            setLabel('');
            setAdding(false);
            await reload();
            onFocusMoved();
        } finally {
            setBusy(false);
        }
    };

    // Finche' non c'e' un ramo la barra non ha niente da dire.
    if (rows.length === 0) return null;

    const focused = rows.find((row) => row.is_focus) ?? rows[0];

    if (adding) {
        return (
            <form
                className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-teal-50/60 px-3 py-2"
                onSubmit={(event) => { event.preventDefault(); void addBranch(); }}
            >
                <label htmlFor="idea-bar-branch" className="text-xs font-medium text-teal-900">
                    {t('idea.branches.name')}
                </label>
                <input
                    id="idea-bar-branch"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={80}
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
                <button
                    type="submit"
                    disabled={!label.trim() || busy}
                    className="rounded-md bg-teal-700 p-1.5 text-white hover:bg-teal-800 disabled:opacity-50"
                    aria-label={t('idea.branches.create')}
                >
                    {busy
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button
                    type="button"
                    onClick={() => { setAdding(false); setLabel(''); setFailed(false); }}
                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                    aria-label={t('idea.branches.cancel')}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
                {failed && <p className="w-full text-[11px] text-rose-700">{t('idea.branches.error')}</p>}
            </form>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {t('idea.branches.current')}
            </span>
            <select
                value={focused?.id ?? ''}
                onChange={(event) => void goTo(event.target.value)}
                disabled={busy}
                aria-label={t('idea.branches.switch')}
                className="min-w-0 max-w-[18rem] flex-1 truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
            >
                {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                        {'— '.repeat(row.depth)}{row.label}{row.closed ? ` · ${t('idea.branches.closedMark')}` : ''}
                    </option>
                ))}
            </select>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden="true" />}
            <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-teal-300 px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
            >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('idea.branches.create')}
            </button>
        </div>
    );
}
