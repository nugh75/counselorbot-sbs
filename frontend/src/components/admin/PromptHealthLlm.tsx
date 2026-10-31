'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Calculator, Power, Save, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ModelSearchSelect } from '@/components/admin/ModelSearchSelect';
import { postJson } from '@/components/admin/PromptCompare';
import {
    estimateCost,
    type PromptHealthFinding, type PromptHealthLlmEstimate, type PromptHealthLlmRun, type PromptHealthLlmSettings,
} from '@/lib/prompt-health';

const SELECT_CLASS = 'min-h-control w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-body';

/**
 * Controllo con un modello (#763): il proprietario sceglie fornitore e modello
 * fra quelli delle API configurate (nessun modello predefinito), vede quante
 * chiamate servono e lancia il controllo. Parte anche dopo ogni salvataggio di
 * un prompt, mai all'avvio. Solo avvisi.
 */
export function PromptHealthLlm({ onFindings }: { onFindings: (findings: PromptHealthFinding[]) => void }) {
    const { t, lang } = useI18n();
    const titleId = useId();
    const providerId = useId();
    const [settings, setSettings] = useState<PromptHealthLlmSettings | null>(null);
    const [provider, setProvider] = useState('');
    const [model, setModel] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [estimate, setEstimate] = useState<PromptHealthLlmEstimate | null>(null);
    const [result, setResult] = useState<PromptHealthLlmRun | null>(null);
    const [busy, setBusy] = useState<'save' | 'estimate' | 'run' | null>(null);
    const [status, setStatus] = useState<'saved' | 'saveError' | 'runError' | 'loadError' | null>(null);

    useEffect(() => {
        apiFetch('/api/admin/prompt-health/llm/settings')
            .then(response => { if (!response.ok) throw new Error('settings'); return response.json(); })
            .then((value: PromptHealthLlmSettings) => { setSettings(value); setProvider(value.provider); setModel(value.model); })
            .catch(() => setStatus('loadError'));
    }, []);

    // Stessa sorgente degli altri selettori di modello: i modelli serviti dal fornitore.
    useEffect(() => {
        if (!provider) { setModels([]); return; }
        const controller = new AbortController();
        setModelsLoading(true);
        apiFetch(`/api/admin/models?provider=${encodeURIComponent(provider)}`, { signal: controller.signal })
            .then(response => (response.ok ? response.json() : { models: [] }))
            .then((value: { models?: string[] }) => setModels(value.models ?? []))
            .catch(() => { if (!controller.signal.aborted) setModels([]); })
            .finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
        return () => controller.abort();
    }, [provider]);

    const save = async (next: { provider: string; model: string }) => {
        setBusy('save');
        setStatus(null);
        try {
            const response = await apiFetch('/api/admin/prompt-health/llm/settings', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
            });
            if (!response.ok) throw new Error('save');
            const value: PromptHealthLlmSettings = await response.json();
            setSettings(value);
            setProvider(value.provider);
            setModel(value.model);
            setEstimate(null);
            setStatus('saved');
        } catch {
            setStatus('saveError');
        } finally {
            setBusy(null);
        }
    };

    const runEstimate = useCallback(async () => {
        setBusy('estimate');
        try {
            setEstimate(await postJson<PromptHealthLlmEstimate>('/api/admin/prompt-health/llm/estimate', { prompt_ids: [], language: lang }));
        } catch {
            setStatus('runError');
        } finally {
            setBusy(null);
        }
    }, [lang]);

    const run = async () => {
        setBusy('run');
        setStatus(null);
        try {
            const value = await postJson<PromptHealthLlmRun>('/api/admin/prompt-health/llm/run', { prompt_ids: [], language: lang });
            setResult(value);
            onFindings(value.findings);
            setEstimate(null);
        } catch {
            setStatus('runError');
        } finally {
            setBusy(null);
        }
    };

    const changed = !!settings && (provider !== settings.provider || model !== settings.model);
    const cost = estimate ? estimateCost(estimate.cost_usd) : null;

    return <Card as="section" aria-labelledby={titleId} className="space-y-3">
        <h2 id={titleId} className="text-lg font-semibold text-ink-strong">{t('admin.promptHealth.llm.title')}</h2>
        <p className="text-sm text-ink-muted">{t('admin.promptHealth.llm.help')}</p>
        {status === 'loadError' && <Callout variant="danger">{t('admin.promptHealth.loadError')}</Callout>}
        {settings && settings.providers.length === 0 && <Callout variant="info">{t('admin.promptHealth.llm.noProviders')}</Callout>}
        {settings && <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
                <label htmlFor={providerId} className="text-sm font-semibold text-ink-body">{t('admin.promptHealth.llm.provider')}</label>
                <select id={providerId} value={provider} className={SELECT_CLASS}
                    onChange={event => { setProvider(event.target.value); setModel(''); }}>
                    <option value="">{t('admin.promptHealth.llm.providerNone')}</option>
                    {settings.providers.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>
            <div className="space-y-1">
                <label htmlFor="prompt_health_llm_model" className="text-sm font-semibold text-ink-body">{t('admin.promptHealth.llm.model')}</label>
                <ModelSearchSelect key={provider} id="prompt_health_llm_model" models={models} value={model} onChange={setModel}
                    disabled={!provider} loading={modelsLoading} emptyLabel={t('admin.promptHealth.llm.modelEmpty')} />
            </div>
        </div>}
        {settings && <p className="text-xs text-ink-muted">{t('admin.promptHealth.llm.costHint')}</p>}
        {settings && <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy !== null || !changed || !provider || !model} onClick={() => save({ provider, model })}>
                <Save className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.llm.save')}
            </Button>
            {settings.configured && <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => save({ provider: '', model: '' })}>
                <Power className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.llm.off')}
            </Button>}
            <Button type="button" variant="secondary" disabled={busy !== null || !settings.configured} onClick={runEstimate}>
                <Calculator className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.llm.estimate')}
            </Button>
            <Button type="button" variant="secondary" disabled={busy !== null || !settings.configured || changed} onClick={run}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />{busy === 'run' ? t('admin.promptHealth.llm.running') : t('admin.promptHealth.llm.run')}
            </Button>
        </div>}
        <div role="status" className="space-y-2">
            {settings && !settings.configured && <Callout variant="info">{t('admin.promptHealth.llm.notConfigured')}</Callout>}
            {estimate && <p className="text-sm text-ink-body">
                {t('admin.promptHealth.llm.estimateText', {
                    combinations: estimate.combinations, cached: estimate.cached, calls: estimate.calls,
                    max: estimate.max_calls_per_run, tokens: estimate.input_tokens + estimate.output_tokens,
                })}
                {' · '}{cost ? t('admin.promptHealth.llm.cost', { cost }) : t('admin.promptHealth.llm.costUnknown')}
            </p>}
            {result && <p className="text-sm text-ink-body">
                {t('admin.promptHealth.llm.result', { calls: result.calls, cached: result.cached, failed: result.failed })}
                {result.remaining > 0 && ` ${t('admin.promptHealth.llm.remaining', { count: result.remaining })}`}
            </p>}
            {status === 'saved' && <Callout variant="success">{t('admin.promptHealth.llm.saved')}</Callout>}
            {status === 'saveError' && <Callout variant="danger">{t('admin.promptHealth.llm.saveError')}</Callout>}
            {status === 'runError' && <Callout variant="danger">{t('admin.promptHealth.llm.runError')}</Callout>}
        </div>
    </Card>;
}
