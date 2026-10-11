'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';

type Share = { owner_username: string; connection_id: string; mine: boolean; reasoning: string | null; last_error: string | null;
    name: string | null; provider: string | null; model: string | null };
type State = { available: boolean; share: Share | null; connections: { id: string; name: string; provider: string; model: string }[];
    usage: { requests: number; cost_usd: number } };
const LEVELS = ['none', 'low', 'medium', 'high'];
const field = 'mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900';

// #201: the teacher's own API connection made available to this class.
export function ClassAPIShareSection({ groupId }: { groupId: number }) {
    const { lang } = useI18n();
    const l = (key: keyof typeof classSettingsTexts) => classSettingsText(lang, key);
    const p = (key: Parameters<typeof personalAPIText>[1]) => personalAPIText(lang, key);
    const [state, setState] = useState<State | null>(null);
    const [connection, setConnection] = useState('');
    const [reasoning, setReasoning] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'saved' | 'error' | null>(null);
    const accept = useCallback((data: State) => {
        setState(data);
        setConnection(data.share?.mine ? data.share.connection_id : '');
        setReasoning(data.share?.mine ? data.share.reasoning ?? '' : '');
    }, []);
    useEffect(() => {
        let active = true;
        void apiFetch(`/api/teacher/groups/${groupId}/api-share`, { cache: 'no-store' })
            .then(response => response.ok ? response.json() : null).then(data => { if (active && data) accept(data); }).catch(() => {});
        return () => { active = false; };
    }, [groupId, accept]);
    if (!state || (!state.available && !state.share)) return null;
    const send = (method: 'PUT' | 'DELETE') => {
        setBusy(true); setStatus(null);
        void apiFetch(`/api/teacher/groups/${groupId}/api-share`, {
            method, cache: 'no-store', headers: { 'X-Requested-With': 'CounselorBot', ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
            ...(method === 'PUT' ? { body: JSON.stringify({ connection_id: connection, reasoning: reasoning || null }) } : {}),
        }).then(async response => { if (!response.ok) throw new Error(); accept(await response.json()); setStatus('saved'); })
            .catch(() => setStatus('error')).finally(() => setBusy(false));
    };
    const share = state.share;
    const dirty = connection !== (share?.mine ? share.connection_id : '') || reasoning !== (share?.mine ? share.reasoning ?? '' : '');
    const usage = l('shareUsage').replace('{requests}', String(state.usage.requests)).replace('{cost}', state.usage.cost_usd.toFixed(2));
    return <Card>
        <section aria-labelledby="class-api-share-heading" className="space-y-3" data-testid="class-api-share">
            <h2 id="class-api-share-heading" className="text-lg font-bold text-slate-800">{l('shareTitle')}</h2>
            <p className="text-sm text-slate-600">{l('shareHelp')}</p>
            <p className="text-sm text-slate-600">{l('shareNoChatgpt')}</p>
            {share && <p role="status" className="text-sm font-semibold text-indigo-700">{share.mine
                ? l('shareActive').replace('{model}', `${share.name} · ${share.model}`)
                : l('shareOther').replace('{model}', `${share.provider} · ${share.model}`)}</p>}
            {share?.mine && share.last_error && <Callout variant="warning">{l('shareError')}</Callout>}
            {share && <p className="text-sm text-slate-600">{usage}</p>}
            {state.available && (state.connections.length === 0
                ? <p className="text-sm text-slate-600">{l('shareNoConnections')}</p>
                : <fieldset disabled={busy} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                        <label htmlFor="class-api-share-connection" className="text-sm font-semibold text-slate-800">{l('shareConnection')}</label>
                        <select id="class-api-share-connection" className={field} value={connection} onChange={e => setConnection(e.target.value)}>
                            <option value="">{l('shareNone')}</option>
                            {state.connections.map(c => <option key={c.id} value={c.id}>{c.name} · {c.model}</option>)}
                        </select>
                    </div>
                    {connection && <div className="sm:w-48">
                        <label htmlFor="class-api-share-reasoning" className="text-sm font-semibold text-slate-800">{p('reasoning')}</label>
                        <select id="class-api-share-reasoning" className={field} value={reasoning} onChange={e => setReasoning(e.target.value)}>
                            <option value="">{p('reasoningDefault')}</option>
                            {LEVELS.map(level => <option key={level} value={level}>{p(`reasoning_${level}` as Parameters<typeof personalAPIText>[1])}</option>)}
                        </select>
                    </div>}
                </fieldset>)}
            <div className="flex flex-wrap gap-3">
                {state.available && connection && <Button type="button" disabled={busy || !dirty} onClick={() => send('PUT')}>{l('shareSave')}</Button>}
                {share && <Button type="button" variant="secondary" disabled={busy} onClick={() => send('DELETE')}>{l('shareStop')}</Button>}
            </div>
            {status === 'saved' && <p role="status" className="text-sm text-slate-700">{l('shareSaved')}</p>}
            {status === 'error' && <Callout variant="danger">{p('error')}</Callout>}
            <Link href="/docente/api-personali" className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline">{l('counselorOpenSources')}</Link>
        </section>
    </Card>;
}
