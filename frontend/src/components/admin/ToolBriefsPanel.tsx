'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useI18n } from '@/lib/i18n-context';

// Spiegazioni lunghe con cui la Bussola racconta uno strumento. Sono istruzioni
// per il modello, non testo mostrato allo studente: si scrivono in inglese, una
// stesura sola invece di sei traduzioni da tenere allineate. Il seed crea le voci
// mancanti all'avvio e non sovrascrive mai un testo rivisto qui dentro.
interface ToolBrief {
    tool_id: string;
    brief: string;
    is_active: boolean;
    updated_at: string | null;
}

export function ToolBriefsPanel() {
    const { t } = useI18n();
    const [rows, setRows] = useState<ToolBrief[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingId, setSavingId] = useState('');
    const [savedId, setSavedId] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/orientation/tool-briefs');
            if (!res.ok) throw new Error(String(res.status));
            const data: ToolBrief[] = await res.json();
            setRows(data);
            setDrafts(Object.fromEntries(data.map((row) => [row.tool_id, row.brief])));
        } catch {
            setError(t('admin.toolBriefs.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { void load(); }, [load]);

    const save = async (row: ToolBrief) => {
        setSavingId(row.tool_id);
        setSavedId('');
        setError('');
        try {
            const res = await fetch(`/api/admin/orientation/tool-briefs/${encodeURIComponent(row.tool_id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brief: drafts[row.tool_id] ?? '', is_active: row.is_active }),
            });
            if (!res.ok) throw new Error(String(res.status));
            const updated: ToolBrief = await res.json();
            setRows((prev) => prev.map((item) => (item.tool_id === updated.tool_id ? updated : item)));
            setSavedId(updated.tool_id);
        } catch {
            setError(t('admin.toolBriefs.saveError'));
        } finally {
            setSavingId('');
        }
    };

    if (loading) return <p className="text-sm text-slate-500" role="status">{t('common.loading')}</p>;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                    <h2 className="text-lg font-bold text-slate-900">{t('admin.toolBriefs.title')}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">{t('admin.toolBriefs.subtitle')}</p>
                </div>
                <Button variant="secondary" onClick={() => void load()}>
                    <RefreshCw className="h-4 w-4" /> {t('admin.toolBriefs.reload')}
                </Button>
            </div>

            {error && <Callout variant="danger">{error}</Callout>}

            <div className="space-y-4">
                {rows.map((row) => {
                    const dirty = (drafts[row.tool_id] ?? '') !== row.brief;
                    return (
                        <div key={row.tool_id} className="glass-panel p-4 space-y-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-mono text-sm font-bold text-indigo-700">{row.tool_id}</span>
                                {!row.is_active && (
                                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-bold text-amber-800">
                                        {t('admin.toolBriefs.inactive')}
                                    </span>
                                )}
                                {row.updated_at && (
                                    <span className="font-mono text-xs text-slate-500">
                                        {new Date(row.updated_at).toLocaleDateString()}
                                    </span>
                                )}
                                <div className="ml-auto flex items-center gap-2">
                                    {savedId === row.tool_id && !dirty && (
                                        <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                                            <Check className="h-4 w-4" /> {t('admin.toolBriefs.saved')}
                                        </span>
                                    )}
                                    <Button
                                        size="sm"
                                        onClick={() => void save(row)}
                                        disabled={!dirty || savingId === row.tool_id}
                                    >
                                        {t('admin.toolBriefs.save')}
                                    </Button>
                                </div>
                            </div>
                            <textarea
                                value={drafts[row.tool_id] ?? ''}
                                onChange={(event) => setDrafts((prev) => ({ ...prev, [row.tool_id]: event.target.value }))}
                                rows={12}
                                aria-label={`${t('admin.toolBriefs.title')} — ${row.tool_id}`}
                                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
