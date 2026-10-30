'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mic, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { isOnlineTranscription, modelForEngine, transcriptionAvailable, validTranscriptionModel, type TranscriptionModel, type TranscriptionProviders } from '@/lib/transcription-models';
import { Button } from '@/components/ui/Button';

interface ModelStatus {
    active: string;
    default: string;
    key: string;
    engine: string;
    default_engine: string;
    engine_key: string;
    default_models: Record<string, string>;
    available: TranscriptionModel[];
    reachable: boolean;
    providers?: TranscriptionProviders;
}

// Indicative weight on a CPU-only host: RAM while transcribing and relative CPU load.
const WEIGHT: Record<string, Record<string, [string, string]>> = {
    'faster-whisper': { small: ['~1 GB', 'medium'], 'large-v3-turbo': ['~2 GB', 'high'], 'large-v3': ['~3.5 GB', 'veryHigh'] },
    'whisper.cpp': { base: ['~0.3 GB', 'low'], small: ['~0.6 GB', 'medium'], 'large-v3-turbo': ['~1.2 GB', 'high'] },
};

const engineOf = (model: TranscriptionModel) => model.engine || 'faster-whisper';
const hintKey = (engine: string, id: string) => engine === 'whisper.cpp' ? `admin.audio.cpp.${id}` : `admin.audio.model.${id}`;
const formatBytes = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;

export function AudioModelsPanel() {
    const { t } = useI18n();
    const [status, setStatus] = useState<ModelStatus | null>(null);
    const [selected, setSelected] = useState('');
    const [engine, setEngine] = useState('');
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
            setEngine(body.engine);
        } catch (error) {
            console.error('Failed to load transcription models', error);
            setSaved('error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        if (!status || !validTranscriptionModel(selected) || !transcriptionAvailable(engine, status.providers)) return;
        setSaving(true);
        setSaved('idle');
        try {
            for (const [key, value] of [[status.engine_key, engine], [status.key, selected.trim()]]) {
                const response = await fetch('/api/admin/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, value }),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
            }
            setSaved('saved');
            await load();
        } catch (error) {
            console.error('Failed to save transcription model', error);
            setSaved('error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="rounded-card border border-line bg-surface shadow-card p-6 text-sm text-ink-muted">{t('admin.audio.loading')}</div>;

    // Without the service the saved name is still the only choice we can offer.
    const all: TranscriptionModel[] = status?.available.length
        ? status.available
        : [{ id: status?.active || '', engine: status?.engine, loaded: false, bytes: null }];
    const engines = Object.keys(status?.default_models || { 'faster-whisper': '' });
    const online = isOnlineTranscription(engine);
    const models = all.filter((model) => engineOf(model) === engine);
    const chooseEngine = (next: string) => {
        setEngine(next);
        setSelected(modelForEngine(next, selected, all, status?.default_models || {}));
    };

    return (
        <div className="rounded-card border border-line bg-surface shadow-card space-y-4 p-6">
            <div className="flex items-start gap-4">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft">
                    <Mic className="h-5 w-5 text-brand" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-ink">{t('admin.audio.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-ink-muted">{t('admin.audio.subtitle')}</p>
                </div>
            </div>

            {status && !status.reachable && !online && (
                <p role="alert" className="rounded-control border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink">{t('admin.audio.unreachable')}</p>
            )}

            <fieldset className="rounded-control border border-line bg-surface p-4">
                <legend className="px-1 text-sm font-semibold text-ink">{t('admin.audio.engine')}</legend>
                <p className="text-sm text-ink-muted">{t('admin.audio.engineHint')}</p>
                <div className="mt-4 space-y-2">
                    {engines.map((name) => (
                        <label key={name} className="flex items-start gap-4 rounded-control border border-line p-4 text-sm">
                            <input
                                type="radio"
                                name="transcription-engine"
                                value={name}
                                checked={engine === name}
                                disabled={!transcriptionAvailable(name, status?.providers)}
                                aria-describedby={!transcriptionAvailable(name, status?.providers) ? `audio-key-${name}` : undefined}
                                onChange={() => chooseEngine(name)}
                                className="mt-1 h-4 w-4 border-line-strong text-brand focus:ring-focus"
                            />
                            <span>
                                <span className="block font-semibold text-ink">{name}</span>
                                <span className="mt-1 block text-ink-muted">{t(`admin.audio.engine.${name}`)}</span>
                                {!transcriptionAvailable(name, status?.providers) && (
                                    <span id={`audio-key-${name}`} className="mt-1 block text-warning-ink">
                                        {t('admin.audio.keyMissing').replace('{provider}', name === 'openrouter' ? 'OpenRouter' : 'Mistral')}
                                    </span>
                                )}
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>

            {online && <p role="alert" className="rounded-control border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink">{t('admin.audio.externalWarning')}</p>}

            <fieldset className="rounded-control border border-line bg-surface p-4">
                <legend className="px-1 text-sm font-semibold text-ink">{t('admin.audio.model')}</legend>
                <p className="text-sm text-ink-muted">{t(online ? 'admin.audio.onlineModelHint' : 'admin.audio.modelHint')}</p>
                {online ? (
                    <label className="mt-4 block text-sm text-ink-body">
                        {t('admin.audio.modelId')}
                        <input type="text" value={selected} onChange={event => setSelected(event.target.value)}
                            maxLength={200} spellCheck={false} autoComplete="off"
                            className="mt-1 block w-full rounded-control border border-line-strong p-2" />
                    </label>
                ) : (
                <div className="mt-4 space-y-2">
                    {models.map((model) => (
                        <label key={`${engine}-${model.id}`} className="flex items-start gap-4 rounded-control border border-line p-4 text-sm">
                            <input
                                type="radio"
                                name="transcription-model"
                                value={model.id}
                                checked={selected === model.id}
                                onChange={() => setSelected(model.id)}
                                className="mt-1 h-4 w-4 border-line-strong text-brand focus:ring-focus"
                            />
                            <span>
                                <span className="block font-semibold text-ink">{model.id}</span>
                                <span className="mt-1 block text-ink-muted">{t(hintKey(engine, model.id))}</span>
                                <span className="mt-1 block text-xs text-ink-muted">
                                    {model.bytes ? `${formatBytes(model.bytes)} · ` : ''}
                                    {WEIGHT[engine]?.[model.id] ? `RAM ${WEIGHT[engine][model.id][0]} · ${t(`admin.audio.cpu.${WEIGHT[engine][model.id][1]}`)} · ` : ''}
                                    {engine === 'whisper.cpp' ? t('admin.audio.perRequest') : model.loaded ? t('admin.audio.loaded') : t('admin.audio.notLoaded')}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>
                )}
            </fieldset>

            <div className="flex items-center gap-4">
                <Button
                    type="button"
                    onClick={save}
                    disabled={!status || saving || !validTranscriptionModel(selected) || !transcriptionAvailable(engine, status.providers) || (selected.trim() === status.active && engine === status.engine)}
                >
                    <Save className="h-4 w-4" />{t('admin.audio.save')}
                </Button>
                {saved === 'saved' && <span className="text-sm text-success">{t('admin.audio.saved')}</span>}
                {saved === 'error' && <span role="alert" className="text-sm text-danger">{t('admin.audio.saveError')}</span>}
            </div>
        </div>
    );
}
