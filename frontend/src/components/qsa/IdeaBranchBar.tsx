'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, GitBranch, Plus, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import {
    createIdeaBranch,
    fetchIdeaBranches,
    moveIdeaFocus,
    type IdeaBranch,
} from '@/lib/idea-map';
import { Spinner } from '@/components/ui/Button';

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

    useEffect(() => {
        let active = true;
        void fetchIdeaBranches(sessionId, locale).then((next) => { if (active) setRows(next); });
        return () => { active = false; };
    }, [sessionId, locale, version]);

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
            if (await createIdeaBranch(sessionId, name, locale) === null) {
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
            // Niente <form> qui: la barra sta dentro il form del composer, e il
            // browser ignorerebbe il form interno mandando il submit a quello
            // esterno (reload della pagina, sessione persa). Invio e tasto
            // chiamano addBranch direttamente.
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-brand-soft px-3 py-2">
                <label htmlFor="idea-bar-branch" className="text-xs font-medium text-link">
                    {t('idea.branches.name')}
                </label>
                <input
                    id="idea-bar-branch"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    // Invio qui manderebbe il messaggio della chat, non il ramo:
                    // va fermato sul posto e usato per creare.
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void addBranch();
                    }}
                    maxLength={80}
                    autoFocus
                    className="min-w-0 flex-1 rounded-control border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <button
                    type="button"
                    onClick={() => void addBranch()}
                    disabled={!label.trim() || busy}
                    className="rounded-control bg-brand p-1.5 text-ink-on-brand hover:bg-brand-hover disabled:opacity-50"
                    aria-label={t('idea.branches.create')}
                >
                    {busy
                        ? <Spinner className="h-4 w-4" aria-hidden="true" />
                        : <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button
                    type="button"
                    onClick={() => { setAdding(false); setLabel(''); setFailed(false); }}
                    className="rounded-control border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                    aria-label={t('idea.branches.cancel')}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
                {failed && <p className="w-full text-xs text-danger-ink">{t('idea.branches.error')}</p>}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t('idea.branches.current')}
            </span>
            <select
                value={focused?.id ?? ''}
                onChange={(event) => void goTo(event.target.value)}
                disabled={busy}
                aria-label={t('idea.branches.switch')}
                className="min-w-0 max-w-[18rem] flex-1 truncate rounded-control border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
            >
                {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                        {'— '.repeat(row.depth)}{row.label}{row.closed ? ` · ${t('idea.branches.closedMark')}` : ''}
                    </option>
                ))}
            </select>
            {busy && <Spinner className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />}
            <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-control border border-dashed border-brand-line px-2 py-1 text-xs font-medium text-link hover:bg-brand-soft disabled:opacity-50"
            >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('idea.branches.create')}
            </button>
        </div>
    );
}
