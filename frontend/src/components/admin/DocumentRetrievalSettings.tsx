'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { documentRetrievalText, type DocumentRetrievalKey } from '@/lib/i18n-document-retrieval';
import { collectionStatus, errorText, formatUsd, STATUS_TEXT, type RetrievalCollection, type RetrievalMode, type RetrievalProvider } from '@/lib/document-retrieval';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

type ProviderInfo = { id: RetrievalProvider; external: boolean; default_model: string; models: string[]; key_env: string[]; key_present: boolean | null };
type State = {
    provider: RetrievalProvider; model: string; dimensions: number | null; mode: RetrievalMode;
    providers: ProviderInfo[];
    privacy: { mode: string; ner_model: string; ner_status: string; ner_required: boolean; queries_blocked: boolean };
    collections: RetrievalCollection[];
};
type Draft = { provider: RetrievalProvider; model: string; dimensions: string; mode: RetrievalMode };
type Probe = { ok: boolean; dimensions?: number; elapsed_ms?: number; error?: string; query_filter?: string };
type Estimate = { input_count: number; estimated_tokens: number; estimated_cost_usd: number | null; price_known: boolean };

const PROVIDER_TEXT: Record<RetrievalProvider, DocumentRetrievalKey> = {
    ollama: 'providerOllama', mistral: 'providerMistral', openrouter: 'providerOpenrouter', none: 'providerNone',
};
const MODE_TEXT: Record<RetrievalMode, DocumentRetrievalKey> = { hybrid: 'modeHybrid', lexical: 'modeLexical', vector: 'modeVector' };
const mutation = { cache: 'no-store' as const, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CounselorBot' } };
const toDraft = (s: State): Draft => ({ provider: s.provider, model: s.model, dimensions: s.dimensions && s.provider === 'openrouter' ? String(s.dimensions) : '', mode: s.mode });
const field = 'min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900';

export function DocumentRetrievalSettings() {
    const { lang } = useI18n();
    const l = (key: DocumentRetrievalKey, values?: Record<string, string | number>) => documentRetrievalText(lang, key, values);
    const [state, setState] = useState<State | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [notice, setNotice] = useState<{ variant: 'success' | 'danger'; text: string } | null>(null);
    const [probe, setProbe] = useState<Probe | null>(null);
    const [estimates, setEstimates] = useState<Record<string, Estimate>>({});
    const saved = state ? toDraft(state) : null;
    const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
    useDraftGuard(dirty, l('dirty'), { blocked: busy });

    const apply = (data: State) => {
        // An unexpected payload must not break the rest of the settings page.
        if (!data || !Array.isArray(data.providers) || !Array.isArray(data.collections) || !data.privacy) throw new Error();
        setState(data); setDraft(toDraft(data));
    };
    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const response = await apiFetch('/api/admin/document-retrieval', { cache: 'no-store' });
            if (response.status === 403) { setForbidden(true); return; }
            if (!response.ok) throw new Error();
            apply(await response.json());
        } catch { setLoadError(true); }
    }, []);
    useEffect(() => { if (!getViewAsAccount()) void load(); }, [load]);
    if (forbidden || getViewAsAccount()) return null;

    const run = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true); setNotice(null);
        try { await action(); } catch { setNotice({ variant: 'danger', text: l('actionError') }); } finally { setBusy(false); }
    };
    const save = () => run(async () => {
        if (!draft) return;
        const response = await apiFetch('/api/admin/document-retrieval', { method: 'PUT', ...mutation, body: JSON.stringify(draft) });
        if (!response.ok) { setNotice({ variant: 'danger', text: l('saveError') }); return; }
        apply(await response.json()); setProbe(null); setEstimates({});
        setNotice({ variant: 'success', text: l('saved') });
    });
    const test = () => run(async () => {
        setProbe(null);
        const response = await apiFetch('/api/admin/document-retrieval/test', { method: 'POST', ...mutation });
        if (!response.ok) throw new Error();
        setProbe(await response.json());
        await load();
    });
    const chooseBasic = () => run(async () => {
        const response = await apiFetch('/api/admin/external-privacy', { method: 'PUT', ...mutation, body: JSON.stringify({ mode: 'basic' }) });
        if (!response.ok) throw new Error();
        setProbe(null); await load();
        setNotice({ variant: 'success', text: l('basicSaved') });
    });
    const estimate = (id: string) => run(async () => {
        const response = await apiFetch(`/api/admin/document-retrieval/collections/${encodeURIComponent(id)}/estimate`, { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const data: Estimate = await response.json();
        setEstimates(current => ({ ...current, [id]: data }));
    });
    const reindex = (id: string) => run(async () => {
        const response = await apiFetch(`/api/admin/document-retrieval/collections/${encodeURIComponent(id)}/reindex`, { method: 'POST', ...mutation });
        if (!response.ok) throw new Error();
        await load();
    });

    const provider = state?.providers.find(p => p.id === draft?.provider);
    const env = provider?.key_env[0] || '';
    const blocked = (!!state && state.privacy.queries_blocked) || probe?.query_filter === 'embedding_privacy_blocked';
    const costText = (e: Estimate) => e.input_count === 0 || e.estimated_cost_usd === 0 ? l('estimateFree')
        : e.price_known && e.estimated_cost_usd !== null ? formatUsd(e.estimated_cost_usd) : l('estimateUnknown');

    return <div data-testid="document-retrieval-settings"><Card>
        <h4 className="font-semibold text-slate-900">{l('title')}</h4>
        <p className="mt-2 text-sm text-slate-600">{l('help')}</p>
        {!state && !loadError && <p role="status" className="mt-3 text-sm text-slate-600">{l('loading')}</p>}
        {loadError && !state && <div className="mt-3 space-y-2"><Callout variant="danger">{l('loadError')}</Callout><Button variant="secondary" onClick={() => void load()}>{l('retry')}</Button></div>}
        {state && draft && <div className="mt-4 space-y-4">
            <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-800" htmlFor="retrieval-provider">{l('provider')}</label>
                <select id="retrieval-provider" value={draft.provider} disabled={busy} className={field}
                    onChange={e => { const next = e.target.value as RetrievalProvider; setDraft({ ...draft, provider: next, model: next === state.provider ? state.model : '', dimensions: '', mode: next === 'none' ? 'lexical' : draft.mode === 'lexical' && state.provider === 'none' ? 'hybrid' : draft.mode }); setNotice(null); }}>
                    {state.providers.map(p => <option key={p.id} value={p.id}>{l(PROVIDER_TEXT[p.id])}</option>)}
                </select>
            </div>
            {provider?.external && <>
                <p className={`text-sm font-semibold ${provider.key_present ? 'text-emerald-700' : 'text-amber-800'}`} data-testid="retrieval-key-status">
                    {l(provider.key_present ? 'keyPresent' : 'keyMissing', { env })}
                </p>
                <p className="text-sm text-slate-600">{l('keyHelp', { env })}</p>
                <Callout variant="info">{l('privacyExternal')}</Callout>
            </>}
            {draft.provider !== 'none' && provider && <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-800" htmlFor="retrieval-model">{l('model')}</label>
                <input id="retrieval-model" list="retrieval-models" value={draft.model} disabled={busy} maxLength={200} className={`${field} font-mono`}
                    placeholder={provider.default_model} onChange={e => setDraft({ ...draft, model: e.target.value })} />
                <datalist id="retrieval-models">{provider.models.map(m => <option key={m} value={m} />)}</datalist>
                <p className="text-xs text-slate-600">{l('modelHelp', { model: provider.default_model })}</p>
            </div>}
            {draft.provider === 'openrouter' && <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-800" htmlFor="retrieval-dimensions">{l('dimensions')}</label>
                <input id="retrieval-dimensions" inputMode="numeric" pattern="[0-9]*" value={draft.dimensions} disabled={busy} maxLength={5} className={field}
                    placeholder="768" onChange={e => setDraft({ ...draft, dimensions: e.target.value.replace(/\D/g, '') })} />
                <p className="text-xs text-slate-600">{l('dimensionsHelp')}</p>
            </div>}
            {draft.provider !== 'none' && <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-800" htmlFor="retrieval-mode">{l('mode')}</label>
                <select id="retrieval-mode" value={draft.mode} disabled={busy} className={field} onChange={e => setDraft({ ...draft, mode: e.target.value as RetrievalMode })}>
                    {(Object.keys(MODE_TEXT) as RetrievalMode[]).map(m => <option key={m} value={m}>{l(MODE_TEXT[m])}</option>)}
                </select>
            </div>}
            {provider?.external && state.provider === draft.provider && state.privacy.ner_required && !blocked
                && <p className="text-sm text-slate-600">{l('nerRequired', { model: state.privacy.ner_model })}</p>}
            {provider?.external && state.provider === draft.provider && blocked && <div className="space-y-2" data-testid="retrieval-ner-blocked">
                <Callout variant="warning">{l('nerBlocked')}</Callout>
                <Button variant="secondary" disabled={busy} onClick={() => void chooseBasic()}>{l('useBasic')}</Button>
            </div>}
            <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !dirty} onClick={() => void save()}>{l('save')}</Button>
                <Button variant="secondary" disabled={busy || dirty} onClick={() => void test()}>{l('test')}</Button>
            </div>
            <p className="text-xs text-slate-600">{dirty ? l('unsaved') : l('testHelp')}</p>
            {probe && <Callout variant={probe.ok ? 'success' : 'danger'}>
                {probe.ok ? l('testOk', { dimensions: probe.dimensions ?? 0, ms: probe.elapsed_ms ?? 0 }) : l('testFailed', { reason: l(errorText(probe.error)) })}
            </Callout>}
            {notice && <Callout variant={notice.variant}>{notice.text}</Callout>}
            <div className="space-y-2">
                <h5 className="text-sm font-semibold text-slate-800">{l('collections')}</h5>
                <p className="text-xs text-slate-600">{l('reindexHint')}</p>
                <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                    {state.collections.map(c => {
                        const status = collectionStatus(c, state.provider, state.mode);
                        const plan = estimates[c.id];
                        return <li key={c.id} className="space-y-2 p-3" data-testid={`retrieval-collection-${c.id}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="break-words text-sm font-semibold text-slate-900">{c.label}</p>
                                    <p className="text-xs text-slate-600">{l('chunks', { chunks: c.n_chunks })} · {l(STATUS_TEXT[status], { reason: l(errorText(c.last_build_error)) })}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" disabled={busy} onClick={() => void estimate(c.id)}>{l('estimate')}</Button>
                                    <Button variant="secondary" disabled={busy || c.building} onClick={() => void reindex(c.id)}>{l('reindex')}</Button>
                                </div>
                            </div>
                            {plan && <p className="text-xs text-slate-700" role="status">
                                {l('estimateResult', { inputs: plan.input_count, tokens: plan.estimated_tokens.toLocaleString(lang), cost: costText(plan) })}
                            </p>}
                        </li>;
                    })}
                </ul>
            </div>
        </div>}
    </Card></div>;
}
