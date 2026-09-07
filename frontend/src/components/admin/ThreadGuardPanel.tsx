'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const ENABLED_KEY = 'thread_guard_enabled';
const PRESET_KEY = 'thread_guard_preset_id';

interface Preset {
    id: number;
    name: string;
    provider: string;
    model: string;
    provider_configured: boolean;
}

interface ConfigItem {
    key: string;
    value: string;
    description?: string | null;
}

const TRUTHY = ['1', 'true', 'yes', 'on'];

export function ThreadGuardPanel() {
    const { t } = useI18n();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [enabled, setEnabled] = useState(false);
    const [presetId, setPresetId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [configRes, presetsRes] = await Promise.all([
                fetch('/api/admin/config'),
                fetch('/api/admin/presets'),
            ]);
            if (configRes.status === 401 || configRes.status === 403) { window.location.href = '/'; return; }
            const configs: ConfigItem[] = configRes.ok ? await configRes.json() : [];
            const rows: Preset[] = presetsRes.ok ? await presetsRes.json() : [];
            const flag = configs.find((item) => item.key === ENABLED_KEY)?.value || '';
            setEnabled(TRUTHY.includes(flag.trim().toLowerCase()));
            setPresetId((configs.find((item) => item.key === PRESET_KEY)?.value || '').trim());
            setPresets(rows);
        } catch (error) {
            console.error('Failed to load thread guard config', error);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setSaving(true);
        setStatus('idle');
        try {
            for (const item of [
                { key: ENABLED_KEY, value: enabled ? 'true' : 'false' },
                { key: PRESET_KEY, value: presetId },
            ]) {
                const res = await fetch('/api/admin/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            }
            setStatus('saved');
        } catch (error) {
            console.error('Failed to save thread guard config', error);
            setStatus('error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="glass-panel p-6 text-sm text-slate-500">{t('admin.threadGuard.loading')}</div>;
    }

    return (
        <div className="glass-panel space-y-5 p-6">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-50">
                    <Eye className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('admin.threadGuard.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500">{t('admin.threadGuard.subtitle')}</p>
                </div>
            </div>

            <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                    <span className="block text-sm font-semibold text-slate-900">{t('admin.threadGuard.enabled')}</span>
                    <span className="mt-1 block text-sm text-slate-500">{t('admin.threadGuard.enabledHint')}</span>
                </span>
            </label>

            <div className="rounded-md border border-slate-200 bg-white p-4">
                <label htmlFor="thread-guard-preset" className="block text-sm font-semibold text-slate-900">
                    {t('admin.threadGuard.model')}
                </label>
                <p className="mt-1 text-sm text-slate-500">{t('admin.threadGuard.modelHint')}</p>
                <select
                    id="thread-guard-preset"
                    value={presetId}
                    onChange={(event) => setPresetId(event.target.value)}
                    className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="">{t('admin.threadGuard.noPreset')}</option>
                    {presets.map((preset) => (
                        <option key={preset.id} value={String(preset.id)}>
                            {preset.name} — {preset.provider}/{preset.model}
                            {preset.provider_configured ? '' : ` (${t('admin.threadGuard.noKey')})`}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    <Save className="h-4 w-4" />
                    {t('admin.threadGuard.save')}
                </button>
                {status === 'saved' && <span className="text-sm text-emerald-600">{t('admin.threadGuard.saved')}</span>}
                {status === 'error' && <span className="text-sm text-red-600">{t('admin.threadGuard.saveError')}</span>}
            </div>

            <p className="text-xs text-slate-500">{t('admin.threadGuard.logHint')}</p>
        </div>
    );
}
