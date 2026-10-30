'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, RefreshCw, List } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { ModelSearchSelect } from '@/components/admin/ModelSearchSelect';
import { Callout } from '@/components/ui/Callout';
import { validModelId } from '@/lib/model-search';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';

const PROVIDERS = [
    'openai', 'anthropic', 'gemini', 'mistral', 'openrouter', 'omniroute',
    'groq', 'cerebras', 'deepseek', 'together', 'fireworks', 'deepinfra',
    'ollama', 'llamacpp',
];

const EFFORT_OPTIONS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

interface ModelCapability {
    mandatory: boolean;
    supported_efforts: string[];
    default_effort: string | null;
    supports_reasoning: boolean;
}

interface Preset {
    id: number;
    name: string;
    provider: string;
    model: string;
    temperature: number | null;
    max_tokens: number | null;
    disable_thinking: boolean;
    reasoning_budget: number | null;
    reasoning_effort: string | null;
    notes: string | null;
    is_active: boolean;
    provider_configured: boolean;
    reasoning_mandatory: boolean;
}

type FormState = {
    name: string;
    provider: string;
    model: string;
    temperature: string;
    max_tokens: string;
    disable_thinking: boolean;
    reasoning_budget: string;
    reasoning_effort: string;
    notes: string;
    is_active: boolean;
};

const EMPTY_FORM: FormState = {
    name: '', provider: 'deepseek', model: '', temperature: '', max_tokens: '',
    disable_thinking: false, reasoning_budget: '', reasoning_effort: '', notes: '', is_active: true,
};

export function PresetsPanel() {
    const { t } = useI18n();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const editingPreset = typeof editingId === 'number' ? presets.find((p) => p.id === editingId) : undefined;
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [liveModels, setLiveModels] = useState<string[]>([]);
    const [capabilities, setCapabilities] = useState<Record<string, ModelCapability>>({});
    const [modelsLoading, setModelsLoading] = useState(false);
    const [manualModel, setManualModel] = useState(false);
    const modelRequest = useRef<AbortController | null>(null);
    const [saveError, setSaveError] = useState(false);

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

    const fetchModels = useCallback(async (provider: string, refresh = false) => {
        modelRequest.current?.abort();
        const controller = new AbortController();
        modelRequest.current = controller;
        setModelsLoading(true);
        try {
            const query = `provider=${encodeURIComponent(provider)}${refresh ? '&refresh=1' : ''}`;
            const res = await fetch(`/api/admin/models?${query}`, { signal: controller.signal });
            if (controller.signal.aborted) return;
            if (res.ok) {
                const data = await res.json();
                if (!controller.signal.aborted) {
                    setLiveModels(Array.isArray(data?.models) ? data.models : []);
                    setCapabilities(data?.capabilities && typeof data.capabilities === 'object' ? data.capabilities : {});
                }
            } else {
                setLiveModels([]);
                setCapabilities({});
            }
        } catch {
            if (!controller.signal.aborted) {
                setLiveModels([]);
                setCapabilities({});
            }
        } finally {
            if (!controller.signal.aborted) setModelsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (editingId === null) return;
        void fetchModels(form.provider);
        return () => modelRequest.current?.abort();
    }, [editingId, form.provider, fetchModels]);

    const startNew = () => { setForm(EMPTY_FORM); setLiveModels([]); setCapabilities({}); setSaveError(false); setManualModel(false); setEditingId('new'); };
    const startEdit = (p: Preset) => {
        setForm({
            name: p.name, provider: p.provider, model: p.model,
            temperature: p.temperature != null ? String(p.temperature) : '',
            max_tokens: p.max_tokens != null ? String(p.max_tokens) : '',
            disable_thinking: p.reasoning_mandatory ? false : p.disable_thinking,
            reasoning_budget: p.reasoning_budget != null ? String(p.reasoning_budget) : '',
            reasoning_effort: p.reasoning_effort || '',
            notes: p.notes || '', is_active: p.is_active,
        });
        setManualModel(false);
        setLiveModels([]);
        setCapabilities({});
        setSaveError(false);
        setEditingId(p.id);
    };
    const cancel = () => { setEditingId(null); setForm(EMPTY_FORM); setManualModel(false); };

    const save = async () => {
        if (!form.name.trim() || !validModelId(form.model) || invalidTokens) return;
        setSaveError(false);
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
                reasoning_effort: effortOptions.includes(form.reasoning_effort) && form.reasoning_effort !== '' ? form.reasoning_effort : null,
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
            setSaveError(true);
        } finally {
            setSaving(false);
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
    const remove = async (id: number) => {
        try {
            const res = await fetch(`/api/admin/presets/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await fetchPresets();
        } catch (e) {
            console.error('Failed to delete preset', e);
        }
    };

    const updateModel = (model: string) => {
        const allowed = capabilities[model]?.supported_efforts?.filter(value => value !== 'none') || [];
        setForm(current => ({
            ...current,
            model,
            reasoning_effort: allowed.length && current.reasoning_effort && !allowed.includes(current.reasoning_effort)
                ? ''
                : current.reasoning_effort,
        }));
    };

    const inputCls = 'h-9 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink-body outline-none focus:border-focus';
    const invalidTokens = [form.max_tokens, form.reasoning_budget].some(value => value.trim() !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0));
    const capability = capabilities[form.model];
    const catalogEfforts = capability?.supported_efforts?.filter(value => value !== 'none') || [];
    const effortOptions: readonly string[] = catalogEfforts.length ? catalogEfforts : EFFORT_OPTIONS;
    const reasoningMandatory = capability?.mandatory ?? editingPreset?.reasoning_mandatory ?? false;
    const reasoningEnabled = capability?.supports_reasoning ?? true;

    const renderForm = () => (
        <div className="rounded-lg border border-brand-line bg-brand-soft/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.presets.name')}
                    <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <div className="flex flex-col text-xs font-semibold text-ink-muted">
                    <label htmlFor="preset_provider">{t('admin.presets.provider')}</label>
                    <select id="preset_provider" className={inputCls} value={form.provider} onChange={(e) => { setForm({ ...form, provider: e.target.value, model: '', reasoning_effort: '' }); setLiveModels([]); setCapabilities({}); setManualModel(false); }}>
                        {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className="min-w-0 text-xs font-semibold text-ink-muted sm:col-span-2 lg:col-span-2">
                    <label htmlFor="preset_model">{t('admin.presets.model')}</label>
                    <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1">
                            {manualModel ? (
                                <input id="preset_model" className={inputCls} value={form.model} onChange={(e) => updateModel(e.target.value)} placeholder={t('admin.config.customModelPlaceholder')} aria-invalid={!!form.model && !validModelId(form.model)} />
                            ) : (
                                <ModelSearchSelect key={`${editingId}:${form.provider}`} id="preset_model" models={liveModels} value={form.model} loading={modelsLoading} onChange={updateModel} />
                            )}
                        </div>
                        <Button variant="secondary" type="button" aria-label={t('admin.presets.reloadModels')} title={t('admin.presets.reloadModels')} onClick={() => void fetchModels(form.provider, true)} className="w-control px-0 shrink-0">
                            <RefreshCw className={`h-4 w-4 ${modelsLoading ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button variant="secondary" type="button" aria-label={manualModel ? t('admin.presets.useList') : t('admin.presets.useManual')} title={manualModel ? t('admin.presets.useList') : t('admin.presets.useManual')} onClick={() => setManualModel((v) => !v)} className="w-control px-0 shrink-0">
                            {manualModel ? <List className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                    </div>
                    {!modelsLoading && liveModels.length === 0 && <p className="mt-1 text-xs font-normal">{t('admin.config.providerUnreachable')}</p>}
                    {!!form.model && !validModelId(form.model) && <p role="alert" className="mt-1 text-xs text-danger-ink">{t('admin.config.customModelInvalid')}</p>}
                </div>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.presets.temperature')}
                    <input className={inputCls} type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.presets.maxTokens')}
                    <input className={inputCls} type="number" min="1" step="1" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} aria-describedby="preset_token_help" />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.presets.reasoningBudget')}
                    <input className={inputCls} type="number" min="1" step="1" value={form.reasoning_budget} onChange={(e) => setForm({ ...form, reasoning_budget: e.target.value })} placeholder="auto" disabled={form.disable_thinking} aria-describedby="preset_token_help" />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.presets.reasoningEffort')}
                    <select id="preset_effort" className={inputCls} value={effortOptions.includes(form.reasoning_effort) ? form.reasoning_effort : ''} onChange={(e) => setForm({ ...form, reasoning_effort: e.target.value })} disabled={form.disable_thinking || !reasoningEnabled} aria-describedby="preset_effort_help">
                        <option value="">{t('admin.presets.reasoningEffortAuto')}</option>
                        {effortOptions.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                    </select>
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted sm:col-span-2 lg:col-span-2">{t('admin.presets.notes')}
                    <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-muted mt-4">
                    <input type="checkbox" checked={form.disable_thinking} onChange={(e) => setForm({ ...form, disable_thinking: e.target.checked })} disabled={reasoningMandatory} />
                    {t('admin.presets.disableThinking')}
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-muted mt-4">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    {t('admin.presets.active')}
                </label>
            </div>
            <div id="preset_token_help" className="mt-4 space-y-2">
                <Callout variant="info">
                    <p>{t('admin.presets.tokenHelp')}</p>
                    <p className="mt-2">{t('admin.presets.reasoningHelp')}</p>
                    <p id="preset_effort_help" className="mt-2">{t('admin.presets.reasoningEffortHelp')}</p>
                    <p className="mt-2">{t('admin.config.lengthProfilesHint')}</p>
                </Callout>
                {reasoningMandatory && <Callout variant="warning">{t('admin.presets.mandatoryReasoning')}</Callout>}
                {Number(form.max_tokens) > 0 && Number(form.max_tokens) < 2000 && <Callout variant="warning">{t('admin.presets.lowTokenWarning')}</Callout>}
                {invalidTokens && <p role="alert" className="text-sm text-danger-ink">{t('admin.presets.invalidTokens')}</p>}
                {saveError && <p role="alert" className="text-sm text-danger-ink">{t('admin.config.saveError')}</p>}
            </div>
            <div className="mt-4 flex gap-2">
                <Button type="button" disabled={saving || !form.name.trim() || !validModelId(form.model) || invalidTokens} onClick={() => void save()}>
                    <Check className="h-4 w-4" />{t('admin.presets.save')}
                </Button>
                <Button variant="secondary" type="button" onClick={cancel}>
                    <X className="h-4 w-4" />{t('admin.presets.cancel')}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-surface p-4">
                <div>
                    <h2 className="text-lg font-semibold text-ink">{t('admin.presets.title')}</h2>
                    <p className="text-sm text-ink-muted">{t('admin.presets.subtitle')}</p>
                </div>
                {editingId === null && (
                    <Button type="button" onClick={startNew}>
                        <Plus className="h-4 w-4" />{t('admin.presets.add')}
                    </Button>
                )}
            </div>

            {editingId === 'new' && renderForm()}

            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-line text-xs text-ink-muted">
                        <tr>
                            <th className="px-4 py-2 font-semibold">{t('admin.presets.name')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.presets.provider')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.presets.model')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.presets.active')}</th>
                            <th className="px-4 py-2 text-right font-semibold">{t('admin.presets.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">…</td></tr>}
                        {!loading && presets.length === 0 && editingId !== 'new' && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">{t('admin.presets.empty')}</td></tr>
                        )}
                        {presets.map((p) => (
                            editingId === p.id ? (
                                <tr key={p.id}><td colSpan={5} className="px-4 py-4">{renderForm()}</td></tr>
                            ) : (
                                <tr key={p.id}>
                                    <td className="px-4 py-2 font-semibold text-ink">{p.name}</td>
                                    <td className="px-4 py-2">
                                        <span className="text-ink-muted">{p.provider}</span>
                                        {!p.provider_configured && (
                                            <span className="ml-2 rounded bg-warning-soft px-2 py-1 text-2xs font-semibold text-warning">{t('admin.presets.notConfigured')}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-xs text-ink-body">
                                        <span>{p.model}</span>
                                        {p.reasoning_mandatory && <span className="ml-2 rounded bg-warning-soft px-2 py-1 text-2xs font-semibold text-warning-ink" title={t('admin.presets.mandatoryReasoning')}>{t('admin.presets.mandatoryShort')}</span>}
                                        {p.reasoning_effort && <span className="ml-2 rounded bg-info-soft px-2 py-1 text-2xs font-semibold text-info-ink">{t('admin.presets.reasoningEffort')}: {p.reasoning_effort}</span>}
                                    </td>
                                    <td className="px-4 py-2">{p.is_active ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-ink-muted" />}</td>
                                    <td className="px-4 py-2">
                                        <div className="flex justify-end gap-1">
                                            <button type="button" aria-label={`${t('admin.presets.edit')} ${p.name}`} onClick={() => startEdit(p)} className="inline-flex min-h-control min-w-control items-center justify-center rounded p-2 text-ink-muted hover:bg-surface-raised hover:text-ink"><Pencil className="h-4 w-4" /></button>
                                            {confirmDelete === p.id
                                                ? <ConfirmInline question={t('admin.presets.confirmDelete')} onConfirm={() => { setConfirmDelete(null); void remove(p.id); }} onCancel={() => setConfirmDelete(null)} />
                                                : <button type="button" aria-label={`${t('admin.presets.delete')} ${p.name}`} onClick={() => setConfirmDelete(p.id)} className="inline-flex min-h-control min-w-control items-center justify-center rounded p-2 text-danger hover:bg-danger-soft"><Trash2 className="h-4 w-4" /></button>}
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
