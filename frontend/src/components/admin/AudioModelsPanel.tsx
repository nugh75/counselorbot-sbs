'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mic, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

interface ServiceModel {
    id: string;
    loaded: boolean;
    bytes: number | null;
}

interface ModelStatus {
    active: string;
    default: string;
    key: string;
    available: ServiceModel[];
    reachable: boolean;
}

export function AudioModelsPanel() {
    const { t } = useI18n();
    const [status, setStatus] = useState<ModelStatus | null>(null);
    const [selected, setSelected] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState<'idle' | 'saved' | 'error'>('idle');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/audio/models');
            if (response.status === 401 || response.status === 403) { window.location.href = '/'; return; }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body: ModelStatus = await response.json();
            setStatus(body);
            setSelected(body.active);
        } catch (error) {
            console.error('Failed to load transcription models', error);
            setSaved('error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        if (!status) return;
        setSaving(true);
        setSaved('idle');
        try {
            const response = await fetch('/api/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: status.key, value: selected }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setSaved('saved');
            await load();
        } catch (error) {
            console.error('Failed to save transcription model', error);
            setSaved('error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="glass-panel p-6 text-sm text-slate-500">{t('admin.audio.loading')}</div>;

    // Without the service the saved name is still the only choice we can offer.
    const models: ServiceModel[] = status?.available.length
        ? status.available
        : [{ id: status?.active || '', loaded: false, bytes: null }];

    return (
        <div className="glass-panel space-y-5 p-6">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-50">
                    <Mic className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('admin.audio.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500">{t('admin.audio.subtitle')}</p>
                </div>
            </div>

            {status && !status.reachable && (
                <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t('admin.audio.unreachable')}</p>
            )}

            <fieldset className="rounded-md border border-slate-200 bg-white p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">{t('admin.audio.model')}</legend>
                <p className="text-sm text-slate-500">{t('admin.audio.modelHint')}</p>
                <div className="mt-3 space-y-2">
                    {models.map((model) => (
                        <label key={model.id} className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm">
                            <input
                                type="radio"
                                name="transcription-model"
                                value={model.id}
                                checked={selected === model.id}
                                onChange={() => setSelected(model.id)}
                                className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>
                                <span className="block font-semibold text-slate-900">{model.id}</span>
                                <span className="mt-1 block text-slate-500">{t(`admin.audio.model.${model.id}`)}</span>
                                <span className="mt-1 block text-xs text-slate-400">
                                    {model.bytes ? `${(model.bytes / 1e9).toFixed(1)} GB · ` : ''}
                                    {model.loaded ? t('admin.audio.loaded') : t('admin.audio.notLoaded')}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={save}
                    disabled={saving || !selected || selected === status?.active}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                    <Save className="h-4 w-4" />{t('admin.audio.save')}
                </button>
                {saved === 'saved' && <span className="text-sm text-emerald-700">{t('admin.audio.saved')}</span>}
                {saved === 'error' && <span role="alert" className="text-sm text-red-700">{t('admin.audio.saveError')}</span>}
            </div>
        </div>
    );
}
