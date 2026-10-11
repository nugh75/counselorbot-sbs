'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Plus } from 'lucide-react';
import { apiFetch, getIdentity, getViewAsAccount } from '@/lib/auth';
import { notifyChatGPTChange } from '@/lib/chatgpt';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText, personalAPIErrorText } from '@/lib/i18n-personal-api';
import { personalAreaText } from '@/lib/i18n-personal-area';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChatGPTConnectionPanel } from './ChatGPTConnectionPanel';
import { PersonalAPIPolicy } from '@/components/admin/PersonalAPIPolicy';
import { ChatGPTSettingsPanel } from '@/components/admin/ChatGPTSettingsPanel';
import { SourceOptions } from './SourceOptions';
import { decode, encode, fromServer, levelsFor, validSource, type Binding, type PersonalSources as Settings } from '@/lib/personal-sources';

type Connection = { id: string; name: string; provider: string; model: string };
type Counselor = { id: number; name: string; description: string; persona: string };
const sortedBindings = (items: Binding[]) => JSON.stringify([...items].sort((a, b) => a.counselor_id - b.counselor_id));
const providerName = (value: string) => (({ openai: 'OpenAI', openrouter: 'OpenRouter', gemini: 'Google Gemini' } as Record<string, string>)[value] ?? value.charAt(0).toUpperCase() + value.slice(1));

async function request(path: string, method = 'GET', body?: unknown) {
    const response = await apiFetch(path, {
        method, cache: 'no-store', headers: { 'X-Requested-With': 'CounselorBot', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'login' : typeof data.detail === 'string' ? data.detail : 'error');
    return data;
}

export function PersonalAPISettings({ area }: { area: 'profilo' | 'docente' }) {
    const { lang, t } = useI18n();
    const router = useRouter();
    const l = (key: Parameters<typeof personalAPIText>[1]) => personalAPIText(lang, key);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [own, setOwn] = useState<Counselor[]>([]);
    const [enabled, setEnabled] = useState(false);
    const [defaultSource, setDefaultSource] = useState('');
    const [defaultReasoning, setDefaultReasoning] = useState('');
    const [bindings, setBindings] = useState<Binding[]>([]);
    const [connectionOpen, setConnectionOpen] = useState(false);
    const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
    const [name, setName] = useState('');
    const [provider, setProvider] = useState('openai');
    const [model, setModel] = useState('');
    const [key, setKey] = useState('');
    const [counselorOpen, setCounselorOpen] = useState(false);
    const [editingCounselor, setEditingCounselor] = useState<Counselor | null>(null);
    const [counselorName, setCounselorName] = useState('');
    const [description, setDescription] = useState('');
    const [persona, setPersona] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Parameters<typeof personalAPIText>[1] | null>(null);
    const [deleteConnection, setDeleteConnection] = useState<string | null>(null);
    const [deleteCounselor, setDeleteCounselor] = useState<number | null>(null);
    const messageRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (error || feedback) messageRef.current?.scrollIntoView({ block: 'nearest' }); }, [error, feedback]);
    const routingDirty = !!settings && (enabled !== settings.enabled || defaultSource !== encode(settings.default_connection_id, settings.default_chatgpt_model) || defaultReasoning !== (settings.default_reasoning ?? '') || sortedBindings(bindings) !== sortedBindings(fromServer(settings.bindings)));
    const connectionDirty = connectionOpen && (name !== (editingConnection?.name ?? '') || provider !== (editingConnection?.provider ?? 'openai') || model !== (editingConnection?.model ?? '') || !!key);
    const counselorDirty = counselorOpen && (counselorName !== (editingCounselor?.name ?? '') || description !== (editingCounselor?.description ?? '') || persona !== (editingCounselor?.persona ?? ''));
    const dirty = routingDirty || connectionDirty || counselorDirty;
    const dirtyRef = useRef(dirty);
    useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
    useDraftGuard(dirty && !!settings?.available, l('dirty'), { blocked: busy });

    const accept = useCallback((data: Settings, preserve = false) => {
        setSettings(data);
        if (!preserve) { setEnabled(data.enabled); setDefaultSource(encode(data.default_connection_id, data.default_chatgpt_model)); setDefaultReasoning(data.default_reasoning ?? ''); setBindings(fromServer(data.bindings)); }
        else {
            setDefaultSource(source => validSource(data, source) ? source : '');
            setBindings(items => items.filter(b => validSource(data, b.source) && data.counselors.some(c => c.id === b.counselor_id)));
        }
        if (!data.available) { setKey(''); setPersona(''); setConnectionOpen(false); setCounselorOpen(false); }
    }, []);
    const load = useCallback(async (preserve = false) => {
        setError(null);
        try {
            const data: Settings = await request('/api/user/api-connections');
            accept(data, preserve);
            if (data.api_enabled) setOwn(await request('/api/user/counselors'));
        } catch (exc) { setError(exc instanceof Error ? exc.message : 'error'); }
        finally { setLoading(false); }
    }, [accept]);
    useEffect(() => { void load(); }, [load]);
    // #217: a class that forbids own sources gets an explanation instead of a redirect.
    const blocked = settings?.class_blocked === true;
    // Administrators switch the features on here, so the page stays open for them even when both are off.
    const [admin, setAdmin] = useState<boolean | null>(null);
    useEffect(() => { void getIdentity().then(identity => setAdmin(Boolean(identity?.is_admin) && !getViewAsAccount())).catch(() => setAdmin(false)); }, []);
    useEffect(() => { if (settings?.available === false && !blocked && admin === false) router.replace(`/${area}`); }, [settings?.available, blocked, admin, router, area]);
    useEffect(() => {
        let active = true;
        const refresh = () => {
            void request('/api/user/api-connections').then((data: Settings) => {
                if (active && (!data.available || !dirtyRef.current)) accept(data);
            }).catch(() => {});
        };
        window.addEventListener('focus', refresh); window.addEventListener('chatgpt-connection-changed', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('chatgpt-connection-changed', refresh); };
    }, [accept]);
    const run = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true); setError(null); setFeedback(null);
        try { await action(); } catch (exc) { setError(exc instanceof Error ? exc.message : 'error'); } finally { setBusy(false); }
    };
    const editConnection = (row: Connection | null) => {
        if (connectionDirty && !window.confirm(l('dirty'))) return;
        setEditingConnection(row); setName(row?.name ?? ''); setProvider(row?.provider ?? 'openai'); setModel(row?.model ?? ''); setKey(''); setConnectionOpen(true);
    };
    const editCounselor = (row: Counselor | null) => {
        if (counselorDirty && !window.confirm(l('dirty'))) return;
        setEditingCounselor(row); setCounselorName(row?.name ?? ''); setDescription(row?.description ?? ''); setPersona(row?.persona ?? ''); setCounselorOpen(true);
    };
    const saveConnection = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const data: Settings = await request(`/api/user/api-connections${editingConnection ? `/${editingConnection.id}` : ''}`, editingConnection ? 'PUT' : 'POST', { name, provider, model, ...(key ? { api_key: key } : {}) });
            accept(data, routingDirty); setKey(''); setConnectionOpen(false); setFeedback('saved'); notifyChatGPTChange();
        });
    };
    const saveCounselor = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            await request(`/api/user/counselors${editingCounselor ? `/${editingCounselor.id}` : ''}`, editingCounselor ? 'PUT' : 'POST', { name: counselorName, description, persona });
            setCounselorOpen(false); setPersona(''); await load(routingDirty); setFeedback('counselorSaved'); notifyChatGPTChange();
        });
    };
    const saveRouting = () => void run(async () => {
        const fallback = decode(defaultSource);
        accept(await request('/api/user/api-routing', 'PUT', { enabled, default_connection_id: fallback.connection_id, default_chatgpt_model: fallback.chatgpt_model,
            default_reasoning: defaultSource && defaultReasoning || null,
            bindings: bindings.map(b => ({ counselor_id: b.counselor_id, ...decode(b.source), reasoning: b.reasoning || null })) }));
        setFeedback('saved'); notifyChatGPTChange();
    });
    const assign = (cid: number, source: string, reasoning = '') => setBindings(items => [...items.filter(b => b.counselor_id !== cid),
        ...(source ? [{ counselor_id: cid, source, reasoning: levelsFor(settings, source).includes(reasoning) ? reasoning : '' }] : [])]);
    const chooseDefault = (source: string) => { setDefaultSource(source); if (!levelsFor(settings, source).includes(defaultReasoning)) setDefaultReasoning(''); };
    // The level select next to a source; hidden while the source is the institution or the default.
    const reasoningSelect = (id: string, source: string, value: string, onChange: (value: string) => void) => source && <div className="sm:w-48">
        <label htmlFor={id} className="text-sm font-semibold text-slate-800">{l('reasoning')}</label>
        <select id={id} className={field} value={value} onChange={e => onChange(e.target.value)}>
            <option value="">{l('reasoningDefault')}</option>
            {levelsFor(settings, source).map(level => <option key={level} value={level}>{l(`reasoning_${level}` as Parameters<typeof personalAPIText>[1])}</option>)}
        </select>
    </div>;
    // Options shared by the default and the per-counselor selects: the person's APIs and ChatGPT models.
    const sourceOptions = settings && <SourceOptions sources={settings} />;
    if (settings?.available === false && !blocked && !admin) return null;
    const field = 'mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900';
    return <div className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/${area}`} className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"><ArrowLeft className="h-4 w-4" aria-hidden />{area === 'docente' ? teacherAreaText(lang, 'title') : personalAreaText(lang, 'title')}</Link>
        {(settings?.available || blocked || admin) && <PageHeader title={l('sectionTitle')} subtitle={l('description')} icon={<KeyRound className="h-6 w-6 text-indigo-600" aria-hidden />} />}
        <div ref={messageRef}>
        {loading && <p role="status">{l('loading')}</p>}
        {error === 'login' && <Callout variant="info">{l('login')} <Link href="/login" className="underline">{l('signIn')}</Link></Callout>}
        {error && error !== 'login' && <Callout variant="danger">{personalAPIErrorText(lang, error) ?? (error.startsWith('chatgpt.errors.') ? t(error) : l('error'))}</Callout>}
        {error && !settings && <Button variant="secondary" onClick={() => void load()}>{l('retry')}</Button>}
        {feedback && <Callout variant="info"><span role="status">{l(feedback)}</span></Callout>}
        {blocked && <Callout variant="info">{l('classBlocked')}</Callout>}
        </div>
        {admin && <section id="ai-admin" aria-labelledby="ai-admin-title" className="space-y-4">
            <h2 id="ai-admin-title" className="text-xl font-bold text-slate-900">{l('adminSection')}</h2>
            <p className="text-sm text-slate-600">{l('adminSectionHelp')}</p>
            <PersonalAPIPolicy />
            <ChatGPTSettingsPanel />
        </section>}
        {settings && !blocked && settings.available && <>
            {settings.chatgpt_enabled && <div id="chatgpt"><ChatGPTConnectionPanel area={area} /></div>}
            {settings.api_enabled && <>
            <Callout variant="info">{l('notice')}</Callout>
            <section aria-labelledby="personal-connections-title" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="personal-connections-title" className="text-xl font-bold text-slate-900">{l('connections')}</h2><Button variant="secondary" disabled={busy} onClick={() => editConnection(null)}><Plus className="h-4 w-4" aria-hidden />{l('addConnection')}</Button></div>
                <p className="text-sm text-slate-600">{l('connectionsHelp')}</p>
                {settings.connections.length === 0 && <p className="text-sm text-slate-600">{l('noConnections')}</p>}
                {settings.connections.map(row => <Card key={row.id}>
                    <h3 className="break-words font-bold text-slate-900">{row.name}</h3><p className="mt-1 break-all text-sm text-slate-600">{providerName(row.provider)} · {row.model}</p>
                    <div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => editConnection(row)}>{l('editCounselor')}</Button><Button variant="secondary" disabled={busy || (editingConnection?.id === row.id && connectionDirty)} onClick={() => void run(async () => { const result = await request(`/api/user/api-connections/${row.id}/test`, 'POST'); if (result.working) setFeedback('modelWorking'); else setError(result.error_code ?? 'error'); })}>{l('modelTest')}</Button><Button variant="ghost" disabled={busy} onClick={() => setDeleteConnection(row.id)}>{l('removeConnection')}</Button></div>
                    {deleteConnection === row.id && <div className="mt-4 space-y-3"><p>{l('confirmConnection')}</p><div className="flex flex-wrap gap-3"><Button variant="danger" disabled={busy} onClick={() => void run(async () => { accept(await request(`/api/user/api-connections/${row.id}`, 'DELETE'), routingDirty); if (editingConnection?.id === row.id) { setKey(''); setConnectionOpen(false); } setDeleteConnection(null); setFeedback('saved'); notifyChatGPTChange(); })}>{l('removeConnection')}</Button><Button variant="secondary" disabled={busy} onClick={() => setDeleteConnection(null)}>{t('common.cancel')}</Button></div></div>}
                </Card>)}
                {!!settings.connections.length && <p className="text-sm text-slate-600">{l('modelTestHelp')}</p>}
                {connectionOpen && <Card><form onSubmit={saveConnection} className="space-y-5"><fieldset disabled={busy} className="space-y-5">
                    <div><label htmlFor="personal-connection-name" className="text-sm font-semibold text-slate-800">{l('connectionName')}</label><input id="personal-connection-name" className={field} value={name} maxLength={100} required onChange={e => setName(e.target.value)} aria-describedby="connection-name-help" /><p id="connection-name-help" className="mt-1 text-sm text-slate-600">{l('connectionNameHelp')}</p></div>
                    <div><label htmlFor="personal-provider" className="text-sm font-semibold text-slate-800">{l('provider')}</label><select id="personal-provider" className={field} value={provider} onChange={e => { setProvider(e.target.value); setKey(''); }}>{settings.providers.map(value => <option key={value} value={value}>{providerName(value)}</option>)}</select></div>
                    <div><label htmlFor="personal-model" className="text-sm font-semibold text-slate-800">{l('model')}</label><input id="personal-model" className={field} value={model} maxLength={200} required onChange={e => setModel(e.target.value)} aria-describedby="personal-model-help" /><p id="personal-model-help" className="mt-1 text-sm text-slate-600">{l('modelHelp')}</p></div>
                    <div><label htmlFor="personal-key" className="text-sm font-semibold text-slate-800">{l('key')}</label><input id="personal-key" type="password" className={field} value={key} maxLength={4096} autoComplete="off" autoCapitalize="none" spellCheck={false} required={!editingConnection || provider !== editingConnection.provider} onChange={e => setKey(e.target.value)} />{editingConnection && <p className="mt-1 text-sm text-slate-600">{l('keySaved')}</p>}</div>
                    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !connectionDirty}>{l('saveConnection')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { if (!connectionDirty || window.confirm(l('dirty'))) { setKey(''); setConnectionOpen(false); } }}>{t('common.cancel')}</Button></div>
                </fieldset></form></Card>}
            </section>
            </>}
            <section aria-labelledby="personal-routing-title" className="space-y-4"><h2 id="personal-routing-title" className="text-xl font-bold text-slate-900">{l('counselors')}</h2><p className="text-sm text-slate-600">{l('routingHelp')}</p><Card><fieldset disabled={busy} className="space-y-5">
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />{l('usePersonal')}</label>
                {settings.chatgpt_enabled && settings.api_enabled && <p className="text-sm text-slate-600">{l('choiceHelp')}</p>}
                <p className="text-sm font-semibold text-indigo-700">{l(settings.enabled ? 'active' : 'system')}</p>
                <div><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><label htmlFor="personal-default-connection" className="text-sm font-semibold text-slate-800">{l('defaultConnection')}</label><select id="personal-default-connection" className={field} value={defaultSource} onChange={e => chooseDefault(e.target.value)}><option value="">{l('institution')}</option>{sourceOptions}</select></div>{reasoningSelect('personal-default-reasoning', defaultSource, defaultReasoning, setDefaultReasoning)}</div><p className="mt-1 text-sm text-slate-600">{l('defaultHelp')}</p></div>
                <p className="text-sm text-slate-600">{l('reasoningHelp')}</p>
                {settings.counselors.length === 0 && <p className="text-sm text-slate-600">{l('noCounselors')}</p>}
                {settings.counselors.map(c => { const bound = bindings.find(b => b.counselor_id === c.id); return <div key={c.id} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><label htmlFor={`personal-counselor-${c.id}`} className="text-sm font-semibold text-slate-800">{c.name}{c.is_personal && <span className="ml-2 text-slate-600">({l('personalCounselor')})</span>}</label><select id={`personal-counselor-${c.id}`} className={field} value={bound?.source ?? ''} onChange={e => assign(c.id, e.target.value, bound?.reasoning)}><option value="">{l('useDefault')}</option>{sourceOptions}</select></div>{reasoningSelect(`personal-reasoning-${c.id}`, bound?.source ?? '', bound?.reasoning ?? '', value => assign(c.id, bound!.source, value))}</div>; })}
                <Button disabled={busy || !routingDirty || (enabled && !defaultSource && !bindings.length)} onClick={saveRouting}>{l('saveRouting')}</Button>
            </fieldset></Card></section>
            {settings.api_enabled && <section aria-labelledby="own-counselors-title" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="own-counselors-title" className="text-xl font-bold text-slate-900">{l('ownCounselors')}</h2><Button variant="secondary" disabled={busy} onClick={() => editCounselor(null)}><Plus className="h-4 w-4" aria-hidden />{l('createCounselor')}</Button></div><p className="text-sm text-slate-600">{l('ownHelp')}</p>
                {own.map(c => <Card key={c.id}><h3 className="break-words font-bold text-slate-900">{c.name}</h3><p className="mt-1 break-words text-sm text-slate-600">{c.description}</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => editCounselor(c)}>{l('editCounselor')}</Button><Button variant="ghost" disabled={busy} onClick={() => setDeleteCounselor(c.id)}>{l('deleteCounselor')}</Button></div>{deleteCounselor === c.id && <div className="mt-4 space-y-3"><p>{l('confirmCounselor')}</p><div className="flex flex-wrap gap-3"><Button variant="danger" disabled={busy} onClick={() => void run(async () => { await request(`/api/user/counselors/${c.id}`, 'DELETE'); if (editingCounselor?.id === c.id) { setPersona(''); setCounselorOpen(false); } setDeleteCounselor(null); await load(routingDirty); setFeedback('counselorRemoved'); notifyChatGPTChange(); })}>{l('deleteCounselor')}</Button><Button variant="secondary" disabled={busy} onClick={() => setDeleteCounselor(null)}>{t('common.cancel')}</Button></div></div>}</Card>)}
                {counselorOpen && <Card><form onSubmit={saveCounselor} className="space-y-5"><fieldset disabled={busy} className="space-y-5">
                    <div><label htmlFor="own-counselor-name" className="text-sm font-semibold text-slate-800">{l('counselorName')}</label><input id="own-counselor-name" className={field} value={counselorName} maxLength={100} required onChange={e => setCounselorName(e.target.value)} /></div>
                    <div><label htmlFor="own-counselor-description" className="text-sm font-semibold text-slate-800">{l('counselorDescription')}</label><textarea id="own-counselor-description" className={field} value={description} maxLength={1000} rows={2} onChange={e => setDescription(e.target.value)} /></div>
                    <div><label htmlFor="own-counselor-persona" className="text-sm font-semibold text-slate-800">{l('counselorInstructions')}</label><textarea id="own-counselor-persona" className={field} value={persona} maxLength={6000} rows={5} required onChange={e => setPersona(e.target.value)} aria-describedby="own-instructions-help" /><p id="own-instructions-help" className="mt-1 text-sm text-slate-600">{l('instructionsHelp')}</p></div>
                    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !counselorDirty}>{l('saveCounselor')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { if (!counselorDirty || window.confirm(l('dirty'))) { setPersona(''); setCounselorOpen(false); } }}>{t('common.cancel')}</Button></div>
                </fieldset></form></Card>}
            </section>}
        </>}
    </div></div>;
}
