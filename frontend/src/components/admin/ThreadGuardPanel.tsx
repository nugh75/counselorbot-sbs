'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Eye, Info, RefreshCw, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

interface ActiveProvider {
    id: string;
    name: string;
    is_local: boolean;
}

interface GuardSettings {
    enabled: boolean;
    provider: string | null;
    model: string | null;
    preset_id: number | null;
    is_provider_active: boolean;
    active_providers: ActiveProvider[];
}

export function ThreadGuardPanel() {
    const { t } = useI18n();
    const [enabled, setEnabled] = useState(false);
    const [provider, setProvider] = useState('');
    const [model, setModel] = useState('');
    const [isProviderActive, setIsProviderActive] = useState(false);
    const [activeProviders, setActiveProviders] = useState<ActiveProvider[]>([]);
    const [liveModels, setLiveModels] = useState<string[]>([]);
    const [customModel, setCustomModel] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingModels, setLoadingModels] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fetchModels = useCallback(async (targetProvider: string) => {
        if (!targetProvider) {
            setLiveModels([]);
            return;
        }
        setLoadingModels(true);
        try {
            const res = await fetch(`/api/admin/models?provider=${encodeURIComponent(targetProvider)}`);
            if (res.ok) {
                const data = await res.json();
                const list: string[] = Array.isArray(data?.models) ? data.models : [];
                setLiveModels(list);
            } else {
                setLiveModels([]);
            }
        } catch {
            setLiveModels([]);
        } finally {
            setLoadingModels(false);
        }
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setStatus('idle');
        setErrorMessage(null);
        try {
            const res = await fetch('/api/admin/thread-guard');
            if (res.status === 401 || res.status === 403) {
                window.location.href = '/';
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: GuardSettings = await res.json();
            setEnabled(data.enabled);
            const currentProvider = data.provider || '';
            const currentModel = data.model || '';
            setProvider(currentProvider);
            setModel(currentModel);
            setIsProviderActive(data.is_provider_active);
            setActiveProviders(data.active_providers || []);

            if (currentProvider) {
                void fetchModels(currentProvider);
            }
        } catch (error) {
            console.error('Failed to load thread guard config', error);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    }, [fetchModels]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleProviderChange = (newProvider: string) => {
        setProvider(newProvider);
        setStatus('idle');
        setErrorMessage(null);
        const isActive = activeProviders.some((p) => p.id === newProvider);
        setIsProviderActive(isActive);
        if (!newProvider) {
            setModel('');
            setLiveModels([]);
            setEnabled(false);
            return;
        }
        void fetchModels(newProvider);
        setModel('');
        setCustomModel(false);
    };

    const save = async () => {
        setSaving(true);
        setStatus('idle');
        setErrorMessage(null);
        try {
            const res = await fetch('/api/admin/thread-guard', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'CounselorBot',
                },
                body: JSON.stringify({
                    enabled,
                    provider: provider.trim() || null,
                    model: model.trim() || null,
                }),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.detail || `HTTP ${res.status}`);
            }
            const updated: GuardSettings = await res.json();
            setEnabled(updated.enabled);
            setProvider(updated.provider || '');
            setModel(updated.model || '');
            setIsProviderActive(updated.is_provider_active);
            setActiveProviders(updated.active_providers || []);
            setStatus('saved');
        } catch (error: any) {
            console.error('Failed to save thread guard config', error);
            setStatus('error');
            setErrorMessage(error?.message || t('admin.threadGuard.saveError'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="rounded-card border border-line bg-surface shadow-card p-6 text-sm text-ink-muted">{t('admin.threadGuard.loading')}</div>;
    }

    const currentProviderKnown = activeProviders.some((p) => p.id === provider);
    const canEnable = Boolean(provider && isProviderActive && model.trim());

    return (
        <div className="rounded-card border border-line bg-surface shadow-card space-y-4 p-6">
            <div className="flex items-start gap-4">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft">
                    <Eye className="h-5 w-5 text-brand" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-ink">{t('admin.threadGuard.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-ink-muted">{t('admin.threadGuard.subtitle')}</p>
                </div>
            </div>

            {/* Avviso provider inattivo */}
            {provider && !isProviderActive && (
                <div className="flex items-start gap-4 rounded-control border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink">
                    <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-warning" />
                    <div>
                        <div className="font-semibold">{t('admin.threadGuard.providerInactiveWarning')}</div>
                        <div className="mt-1 text-xs text-warning">
                            {t('admin.threadGuard.provider')}: <span className="font-mono font-semibold">{provider}</span> ({t('admin.threadGuard.inactiveTag')})
                        </div>
                    </div>
                </div>
            )}

            {/* Avviso nessun provider configurato */}
            {!provider && (
                <div className="flex items-start gap-4 rounded-control border border-line bg-surface-sunken p-4 text-sm text-ink-body">
                    <Info className="mt-1 h-5 w-5 shrink-0 text-ink-muted" />
                    <div>{t('admin.threadGuard.noProviderWarning')}</div>
                </div>
            )}

            {/* Checkbox attivazione */}
            <label
                className={`flex items-start gap-4 rounded-control border border-line bg-surface p-4 ${
                    !canEnable ? 'opacity-80' : ''
                }`}
            >
                <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!canEnable && !enabled}
                    onChange={(event) => {
                        if (!canEnable && event.target.checked) return;
                        setEnabled(event.target.checked);
                    }}
                    className="mt-1 h-4 w-4 rounded border-line-strong text-brand focus:ring-focus disabled:opacity-50"
                />
                <span>
                    <span className="block text-sm font-semibold text-ink">{t('admin.threadGuard.enabled')}</span>
                    <span className="mt-1 block text-sm text-ink-muted">{t('admin.threadGuard.enabledHint')}</span>
                </span>
            </label>

            {/* Selettore Provider */}
            <div className="rounded-control border border-line bg-surface p-4">
                <label htmlFor="thread-guard-provider" className="block text-sm font-semibold text-ink">
                    {t('admin.threadGuard.provider')}
                </label>
                <p className="mt-1 text-sm text-ink-muted">{t('admin.threadGuard.providerHint')}</p>

                <select
                    id="thread-guard-provider"
                    value={provider}
                    onChange={(event) => handleProviderChange(event.target.value)}
                    className="mt-4 w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-focus"
                >
                    <option value="">{t('admin.threadGuard.selectProvider')}</option>
                    {provider && !currentProviderKnown && (
                        <option value={provider} disabled>
                            {provider} ({t('admin.threadGuard.inactiveTag')})
                        </option>
                    )}
                    {activeProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                        </option>
                    ))}
                </select>

                {activeProviders.length === 0 && (
                    <p className="mt-2 text-xs text-warning">{t('admin.threadGuard.noActiveProviders')}</p>
                )}
            </div>

            {/* Selettore Modello */}
            {provider && (
                <div className="rounded-control border border-line bg-surface p-4">
                    <div className="flex items-center justify-between">
                        <label htmlFor="thread-guard-model" className="block text-sm font-semibold text-ink">
                            {t('admin.threadGuard.model')}
                        </label>
                        {liveModels.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setCustomModel((prev) => !prev)}
                                className="text-xs text-brand hover:text-link underline"
                            >
                                {customModel ? t('admin.threadGuard.selectModel') : t('admin.threadGuard.customModel')}
                            </button>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{t('admin.threadGuard.modelHint')}</p>

                    {loadingModels ? (
                        <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            {t('admin.threadGuard.loading')}
                        </div>
                    ) : liveModels.length > 0 && !customModel ? (
                        <select
                            id="thread-guard-model"
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                            className="mt-4 w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-focus"
                        >
                            <option value="">{t('admin.threadGuard.selectModel')}</option>
                            {model && !liveModels.includes(model) && (
                                <option value={model}>{model}</option>
                            )}
                            {liveModels.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            id="thread-guard-model"
                            type="text"
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                            placeholder="es. qwen3.8:latest, mistral-large-latest, gpt-4o"
                            className="mt-4 w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-focus"
                        />
                    )}
                </div>
            )}

            {/* Azioni di salvataggio */}
            <div className="flex items-center gap-4">
                <Button
                    type="button"
                    onClick={save}
                    disabled={saving}>
                    <Save className="h-4 w-4" />
                    {t('admin.threadGuard.save')}
                </Button>
                {status === 'saved' && (
                    <span className="flex items-center gap-2 text-sm text-success font-semibold">
                        <Check className="h-4 w-4" />
                        {t('admin.threadGuard.saved')}
                    </span>
                )}
                {status === 'error' && (
                    <span className="text-sm text-danger">
                        {errorMessage || t('admin.threadGuard.saveError')}
                    </span>
                )}
            </div>

            <p className="text-xs text-ink-muted">{t('admin.threadGuard.logHint')}</p>
        </div>
    );
}
