'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, RefreshCw, List } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const PROVIDERS = [
    'openai', 'anthropic', 'gemini', 'mistral', 'openrouter',
    'groq', 'cerebras', 'deepseek', 'together', 'fireworks', 'deepinfra',
    'ollama', 'llamacpp',
];

interface Preset {
    id: number;
    name: string;
    provider: string;
    model: string;
    temperature: number | null;
    max_tokens: number | null;
    disable_thinking: boolean;
    reasoning_budget: number | null;
    notes: string | null;
    is_active: boolean;
    provider_configured: boolean;
}

type FormState = {
    name: string;
    provider: string;
    model: string;
    temperature: string;
    max_tokens: string;
    disable_thinking: boolean;
    reasoning_budget: string;
    notes: string;
    is_active: boolean;
};

const EMPTY_FORM: FormState = {
    name: '', provider: 'deepseek', model: '', temperature: '', max_tokens: '',
    disable_thinking: false, reasoning_budget: '', notes: '', is_active: true,
};

export function PresetsPanel() {
    const { t } = useI18n();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [liveModels, setLiveModels] = useState<string[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [manualModel, setManualModel] = useState(false);

    const fetchPresets = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/presets');
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw new Error('presets fetch failed');
            setPresets(await res.json());
        } catch (e) {
            console.error('Failed to fetch presets', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchPresets(); }, [fetchPresets]);

    const fetchModels = useCallback(async (provider: string) => {
        setModelsLoading(true);
        try {
            const res = await fetch(`/api/admin/models?provider=${encodeURIComponent(provider)}`);
            if (res.ok) {
                const data = await res.json();
                setLiveModels(Array.isArray(data?.models) ? data.models : []);
            } else {
                setLiveModels([]);
            }
        } catch {
            setLiveModels([]);
        } finally {
            setModelsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (editingId === null) return;
        void fetchModels(form.provider);
    }, [editingId, form.provider, fetchModels]);

    const startNew = () => { setForm(EMPTY_FORM); setManualModel(false); setEditingId('new'); };
    const startEdit = (p: Preset) => {
        setForm({
            name: p.name, provider: p.provider, model: p.model,
            temperature: p.temperature != null ? String(p.temperature) : '',
            max_tokens: p.max_tokens != null ? String(p.max_tokens) : '',
            disable_thinking: p.disable_thinking,
            reasoning_budget: p.reasoning_budget != null ? String(p.reasoning_budget) : '',
            notes: p.notes || '', is_active: p.is_active,
        });
        setManualModel(false);
        setEditingId(p.id);
    };
    const cancel = () => { setEditingId(null); setForm(EMPTY_FORM); setManualModel(false); };

    const save = async () => {
        if (!form.name.trim() || !form.model.trim()) return;
        setSaving(true);
        try {
            const body = {
                name: form.name.trim(),
                provider: form.provider,
                model: form.model.trim(),
                temperature: form.temperature.trim() === '' ? null : Number(form.temperature),
                max_tokens: form.max_tokens.trim() === '' ? null : Number(form.max_tokens),
                disable_thinking: form.disable_thinking,
                reasoning_budget: form.reasoning_budget.trim() === '' ? null : Number(form.reasoning_budget),
                notes: form.notes.trim() || null,
                is_active: form.is_active,
            };
            const url = editingId === 'new' ? '/api/admin/presets' : `/api/admin/presets/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error('save failed');
            cancel();
            await fetchPresets();
        } catch (e) {
            console.error('Failed to save preset', e);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: number) => {
        if (!window.confirm(t('admin.presets.confirmDelete'))) return;
        try {
            const res = await fetch(`/api/admin/presets/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await fetchPresets();
        } catch (e) {
            console.error('Failed to delete preset', e);
        }
    };

    const inputCls = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400';

    const renderForm = () => (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.presets.name')}
                    <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.presets.provider')}
                    <select className={inputCls} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                        {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.presets.model')}
                    {(() => {
                        const options = form.model && !liveModels.includes(form.model)
                            ? [form.model, ...liveModels]
                            : liveModels;
                        const useSelect = !manualModel && options.length > 0;
                        return (
                            <div className="flex gap-1">
                                {useSelect ? (
                                    <select className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                                        {!form.model && <option value="">{modelsLoading ? '…' : '—'}</option>}
                                        {options.map((m) => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                ) : (
                                    <input className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek-v4-flash" />
                                )}
                                <button type="button" title={modelsLoading ? '…' : 'Reload'} onClick={() => void fetchModels(form.provider)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                                    <RefreshCw className={`h-4 w-4 ${modelsLoading ? 'animate-spin' : ''}`} />
                                </button>
                                <button type="button" title={manualModel ? 'Lista' : 'Manuale'} onClick={() => setManualModel((v) => !v)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                                    {manualModel ? <List className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                </button>
                            </div>
                        );
                    })()}
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.presets.temperature')}
                    <input className={inputCls} type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.presets.maxTokens')}
                    <input className={inputCls} type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.presets.reasoningBudget')}
                    <input className={inputCls} type="number" value={form.reasoning_budget} onChange={(e) => setForm({ ...form, reasoning_budget: e.target.value })} placeholder="auto" />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500 sm:col-span-2 lg:col-span-2">{t('admin.presets.notes')}
                    <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 mt-5">
                    <input type="checkbox" checked={form.disable_thinking} onChange={(e) => setForm({ ...form, disable_thinking: e.target.checked })} />
                    {t('admin.presets.disableThinking')}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 mt-5">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    {t('admin.presets.active')}
                </label>
            </div>
            <div className="mt-3 flex gap-2">
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    <Check className="h-4 w-4" />{t('admin.presets.save')}
                </button>
                <button type="button" onClick={cancel} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    <X className="h-4 w-4" />{t('admin.presets.cancel')}
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{t('admin.presets.title')}</h2>
                    <p className="text-sm text-slate-500">{t('admin.presets.subtitle')}</p>
                </div>
                {editingId === null && (
                    <button type="button" onClick={startNew} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
                        <Plus className="h-4 w-4" />{t('admin.presets.add')}
                    </button>
                )}
            </div>

            {editingId === 'new' && renderForm()}

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                            <th className="px-3 py-2 font-semibold">{t('admin.presets.name')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.presets.provider')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.presets.model')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.presets.active')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('admin.presets.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">…</td></tr>}
                        {!loading && presets.length === 0 && editingId !== 'new' && (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('admin.presets.empty')}</td></tr>
                        )}
                        {presets.map((p) => (
                            editingId === p.id ? (
                                <tr key={p.id}><td colSpan={5} className="px-3 py-3">{renderForm()}</td></tr>
                            ) : (
                                <tr key={p.id}>
                                    <td className="px-3 py-2 font-medium text-slate-800">{p.name}</td>
                                    <td className="px-3 py-2">
                                        <span className="text-slate-600">{p.provider}</span>
                                        {!p.provider_configured && (
                                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{t('admin.presets.notConfigured')}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{p.model}</td>
                                    <td className="px-3 py-2">{p.is_active ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-1">
                                            <button type="button" onClick={() => startEdit(p)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                                            <button type="button" onClick={() => void remove(p.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
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
