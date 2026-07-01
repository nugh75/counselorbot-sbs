'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';

type Lang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'sv';

const LANGS: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const EMPTY_TEXTS: Record<Lang, string> = { it: '', en: '', es: '', fr: '', de: '', sv: '' };

interface ApprovedStrategy {
    id: string;
    status: 'approved' | 'draft' | string;
    questionnaires: string[];
    keywords: string | null;
    texts: Record<string, string>;
}

interface ApprovedStrategiesResponse {
    source: 'db' | 'file' | string;
    strategies: ApprovedStrategy[];
}

type FormState = {
    id: string;
    status: 'approved' | 'draft';
    questionnaires: string;
    keywords: string;
    texts: Record<string, string>;
};

const EMPTY: FormState = {
    id: '',
    status: 'draft',
    questionnaires: 'QSA',
    keywords: '',
    texts: { ...EMPTY_TEXTS },
};

export function ApprovedStrategiesPanel() {
    const [strategies, setStrategies] = useState<ApprovedStrategy[]>([]);
    const [source, setSource] = useState<string>('file');
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [lang, setLang] = useState<Lang>('it');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/approved-strategies');
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw new Error('load failed');
            const data: ApprovedStrategiesResponse = await res.json();
            setStrategies(data.strategies || []);
            setSource(data.source || 'file');
        } catch (e) {
            console.error('Failed to load approved strategies', e);
            setError('Impossibile caricare le strategie RAG.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const startNew = () => {
        setForm({ ...EMPTY, texts: { ...EMPTY_TEXTS } });
        setLang('it');
        setEditingId('new');
        setError(null);
    };

    const startEdit = (strategy: ApprovedStrategy) => {
        setForm({
            id: strategy.id,
            status: strategy.status === 'approved' ? 'approved' : 'draft',
            questionnaires: (strategy.questionnaires || []).join(', '),
            keywords: strategy.keywords || '',
            texts: { ...EMPTY_TEXTS, ...(strategy.texts || {}) },
        });
        setLang('it');
        setEditingId(strategy.id);
        setError(null);
    };

    const cancel = () => {
        setEditingId(null);
        setForm({ ...EMPTY, texts: { ...EMPTY_TEXTS } });
        setError(null);
    };

    const buildBody = () => {
        const texts = Object.fromEntries(
            Object.entries(form.texts)
                .map(([key, value]) => [key, value.trim()])
                .filter(([, value]) => value),
        );
        return {
            id: form.id.trim(),
            status: form.status,
            questionnaires: form.questionnaires.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
            keywords: form.keywords.trim() || null,
            texts,
        };
    };

    const save = async () => {
        if (!form.id.trim()) {
            setError('Inserisci un id.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const url = editingId === 'new'
                ? '/api/admin/approved-strategies'
                : `/api/admin/approved-strategies/${encodeURIComponent(String(editingId))}`;
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildBody()),
            });
            if (!res.ok) throw new Error(await res.text());
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save approved strategy', e);
            setError('Salvataggio non riuscito. Controlla id duplicati o campi non validi.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (!window.confirm(`Eliminare la strategia ${id}?`)) return;
        setError(null);
        try {
            const res = await fetch(`/api/admin/approved-strategies/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            await refresh();
        } catch (e) {
            console.error('Failed to delete approved strategy', e);
            setError('Eliminazione non riuscita.');
        }
    };

    const inputCls = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400';
    const areaCls = 'min-h-[90px] w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-sky-400';

    const renderForm = () => (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col text-xs font-medium text-slate-500">
                    Id strategia
                    <input className={inputCls} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="qsa-planning-next-step" />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">
                    Stato
                    <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FormState['status'] })}>
                        <option value="approved">Approvata</option>
                        <option value="draft">Bozza</option>
                    </select>
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">
                    Questionari
                    <input className={inputCls} value={form.questionnaires} onChange={(e) => setForm({ ...form, questionnaires: e.target.value })} placeholder="QSA, QSAr" />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">
                    Keyword retrieval
                    <input className={inputCls} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="C2 pianificazione obiettivo" />
                </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-1">
                {LANGS.map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => setLang(item)}
                        className={`rounded-md border px-2 py-1 text-xs font-medium uppercase ${lang === item ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}
                    >
                        {item}
                    </button>
                ))}
            </div>
            <label className="mt-2 flex flex-col text-xs font-medium text-slate-500">
                Testo strategia ({lang})
                <textarea
                    className={areaCls}
                    value={form.texts[lang] || ''}
                    onChange={(e) => setForm((current) => ({ ...current, texts: { ...current.texts, [lang]: e.target.value } }))}
                    placeholder="Testo inserito nel blocco KNOWLEDGE quando la strategia viene recuperata."
                />
            </label>

            <div className="mt-4 flex items-center gap-2">
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    <Check className="h-4 w-4" /> Salva
                </button>
                <button type="button" onClick={cancel} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    <X className="h-4 w-4" /> Annulla
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Strategie RAG approvate</h2>
                    <p className="text-sm text-slate-500">
                        Modifica le strategie generiche che possono comparire in <span className="font-mono">strategy_ids</span>. Origine attuale: {source === 'db' ? 'override DB' : 'file versionato'}.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={() => void refresh()} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <RefreshCw className="h-4 w-4" /> Aggiorna
                    </button>
                    {editingId === null && (
                        <button type="button" onClick={startNew} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
                            <Plus className="h-4 w-4" /> Nuova strategia
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {editingId === 'new' && renderForm()}

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                            <th className="px-3 py-2 font-semibold">Strategia</th>
                            <th className="px-3 py-2 font-semibold">Questionari</th>
                            <th className="px-3 py-2 font-semibold">Stato</th>
                            <th className="px-3 py-2 font-semibold">Keyword</th>
                            <th className="px-3 py-2 text-right font-semibold">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Caricamento...</td></tr>}
                        {!loading && strategies.length === 0 && editingId !== 'new' && (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Nessuna strategia RAG configurata.</td></tr>
                        )}
                        {strategies.map((strategy) => (
                            editingId === strategy.id ? (
                                <tr key={strategy.id}><td colSpan={5} className="px-3 py-3">{renderForm()}</td></tr>
                            ) : (
                                <tr key={strategy.id}>
                                    <td className="px-3 py-2">
                                        <div className="font-mono text-xs font-semibold text-slate-800">{strategy.id}</div>
                                        <div className="mt-1 max-w-xl truncate text-xs text-slate-500">{strategy.texts.it || strategy.texts.en || '-'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500">{(strategy.questionnaires || []).join(', ') || '-'}</td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${strategy.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {strategy.status === 'approved' ? 'Approvata' : 'Bozza'}
                                        </span>
                                    </td>
                                    <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-500">{strategy.keywords || '-'}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-1">
                                            <button type="button" onClick={() => startEdit(strategy)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Modifica ${strategy.id}`}><Pencil className="h-4 w-4" /></button>
                                            <button type="button" onClick={() => void remove(strategy.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50" aria-label={`Elimina ${strategy.id}`}><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
