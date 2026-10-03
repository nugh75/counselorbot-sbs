'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notifyChatGPTChange } from '@/lib/chatgpt';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { personalAreaText } from '@/lib/i18n-personal-area';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';

type Settings = {
    available: boolean; chatgpt_enabled: boolean; configured: boolean; provider: string; model: string;
    enabled: boolean; active: boolean; providers: string[];
};
export function PersonalAPISettings({ area }: { area: 'profilo' | 'docente' }) {
    const { lang, t } = useI18n();
    const router = useRouter();
    const l = (key: Parameters<typeof personalAPIText>[1]) => personalAPIText(lang, key);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [provider, setProvider] = useState('openai');
    const [model, setModel] = useState('');
    const [key, setKey] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [login, setLogin] = useState(false);
    const [error, setError] = useState(false);
    const [feedback, setFeedback] = useState<'saved' | 'working' | 'failed' | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const dirty = !!settings && (provider !== settings.provider || model !== settings.model || enabled !== settings.enabled || !!key);
    useDraftGuard(dirty && !!settings?.available, l('dirty'), { blocked: busy });
    const accept = useCallback((data: Settings) => {
        setSettings(data); setProvider(data.provider); setModel(data.model); setEnabled(data.enabled); setKey('');
    }, []);
    const load = useCallback(async () => {
        setLoading(true); setError(false);
        try {
            const response = await apiFetch('/api/user/api-settings', { cache: 'no-store' });
            if (response.status === 401) { setLogin(true); return; }
            if (!response.ok) throw new Error();
            accept(await response.json());
        } catch { setError(true); } finally { setLoading(false); }
    }, [accept]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (settings?.available === false) router.replace(`/${area}`);
    }, [settings?.available, router, area]);
    useEffect(() => {
        const controller = new AbortController();
        const refresh = () => {
            void apiFetch('/api/user/api-settings', { signal: controller.signal, cache: 'no-store' }).then(async response => {
                if (!response.ok) return;
                const data: Settings = await response.json();
                if (!data.available || !dirty) accept(data);
            }).catch(() => {});
        };
        window.addEventListener('focus', refresh);
        window.addEventListener('chatgpt-connection-changed', refresh);
        return () => { controller.abort(); window.removeEventListener('focus', refresh); window.removeEventListener('chatgpt-connection-changed', refresh); };
    }, [accept, dirty]);
    const mutate = async (method: 'PUT' | 'DELETE' | 'POST') => {
        setBusy(true); setError(false); setFeedback(null);
        try {
            const response = await apiFetch(`/api/user/api-settings${method === 'POST' ? '/verify' : ''}`, {
                method, headers: { 'X-Requested-With': 'CounselorBot', ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
                ...(method === 'PUT' ? { body: JSON.stringify({ provider, model, enabled, ...(key ? { api_key: key } : {}) }) } : {}),
            });
            if (!response.ok) throw new Error();
            const data = await response.json();
            if (method === 'POST') setFeedback(data.working ? 'working' : 'failed');
            else { accept(data); setConfirmDelete(false); setFeedback('saved'); notifyChatGPTChange(); }
        } catch { setError(true); } finally { setBusy(false); }
    };
    const save = (event: FormEvent) => { event.preventDefault(); void mutate('PUT'); };
    if (settings?.available === false) return null;
    const field = 'mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900';
    return <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
            <Link href={`/${area}`} className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                <ArrowLeft className="h-4 w-4" aria-hidden />{area === 'docente' ? teacherAreaText(lang, 'title') : personalAreaText(lang, 'title')}
            </Link>
            {settings?.available && <PageHeader title={l('title')} subtitle={l('description')} icon={<KeyRound className="h-6 w-6 text-indigo-600" aria-hidden />} />}
            {loading && <p role="status">{l('loading')}</p>}
            {login && <Callout variant="info">{l('login')} <Link href="/login" className="underline">{l('signIn')}</Link></Callout>}
            {error && <Callout variant="danger">{l('error')}</Callout>}
            {error && !settings && <Button variant="secondary" onClick={() => void load()}>{l('retry')}</Button>}
            {settings && <>
                <Callout variant="info">{l('notice')}</Callout>
                {settings.chatgpt_enabled && <p className="text-sm text-slate-600">{l('choiceHelp')}</p>}
                <p className="text-sm font-semibold text-indigo-700">{l(settings.active ? 'active' : 'system')}</p>
                {!settings.available && <Callout variant="warning">{l('unavailable')}</Callout>}
                {settings.available && <Card>
                    <form onSubmit={save} className="space-y-5">
                        <fieldset disabled={busy} className="space-y-5">
                            <div><label htmlFor="personal-provider" className="text-sm font-semibold text-slate-800">{l('provider')}</label>
                                <select id="personal-provider" className={field} value={provider} onChange={event => { setProvider(event.target.value); setKey(''); setFeedback(null); }}>
                                    {settings.providers.map(value => <option key={value} value={value}>{value === 'gemini' ? 'Google Gemini' : value === 'openai' ? 'OpenAI' : value === 'openrouter' ? 'OpenRouter' : value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
                                </select>
                            </div>
                            <div><label htmlFor="personal-model" className="text-sm font-semibold text-slate-800">{l('model')}</label>
                                <input id="personal-model" className={field} value={model} maxLength={200} required onChange={event => { setModel(event.target.value); setFeedback(null); }} aria-describedby="personal-model-help" />
                                <p id="personal-model-help" className="mt-1 text-sm text-slate-600">{l('modelHelp')}</p>
                            </div>
                            <div><label htmlFor="personal-key" className="text-sm font-semibold text-slate-800">{l('key')}</label>
                                <input id="personal-key" type="password" className={field} value={key} maxLength={4096} autoComplete="off" autoCapitalize="none" spellCheck={false} required={!settings.configured || provider !== settings.provider} onChange={event => { setKey(event.target.value); setFeedback(null); }} aria-describedby={settings.configured ? 'personal-key-help' : undefined} />
                                {settings.configured && <p id="personal-key-help" className="mt-1 text-sm text-slate-600">{l('keySaved')}</p>}
                            </div>
                            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setFeedback(null); }} />{l('usePersonal')}</label>
                            <div className="flex flex-wrap gap-3">
                                <Button type="submit" disabled={busy || !dirty}>{l('save')}</Button>
                                <Button type="button" variant="secondary" disabled={busy || dirty || !settings.configured} onClick={() => void mutate('POST')}>{l('verify')}</Button>
                            </div>
                        </fieldset>
                    </form>
                </Card>}
                {settings.configured && (confirmDelete ? <Card>
                    <p className="text-sm text-slate-800">{l('confirm')}</p>
                    <div className="mt-3 flex flex-wrap gap-3"><Button variant="danger" disabled={busy} onClick={() => void mutate('DELETE')}>{l('remove')}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button></div>
                </Card> : <Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>{l('remove')}</Button>)}
            </>}
            {feedback && <Callout variant={feedback === 'failed' ? 'warning' : 'info'}><span role="status">{l(feedback)}</span></Callout>}
        </div>
    </div>;
}
