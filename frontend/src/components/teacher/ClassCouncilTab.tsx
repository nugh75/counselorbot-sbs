'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classCouncilText, type ClassCouncilTextKey } from '@/lib/i18n-class-council';
import { councilPath, parseCouncilLinks, type CouncilLink } from '@/lib/class-council';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';

const DURATIONS = [7, 14, 30, 60, 90];

function CopyField({ label, value, lang }: { label: string; value: string; lang: string }) {
    const [copied, setCopied] = useState(false);
    return <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">{value}</code>
            <Button variant="secondary" onClick={() => {
                void navigator.clipboard?.writeText(value).then(() => setCopied(true));
            }}>{classCouncilText(lang, copied ? 'copied' : 'copy')}</Button>
        </div>
    </div>;
}

export function ClassCouncilTab({ groupId }: { groupId: number }) {
    const { lang } = useI18n();
    const l = (key: ClassCouncilTextKey) => classCouncilText(lang, key);
    const links = useTeacherResource(`/api/teacher/groups/${groupId}/council-links`, parseCouncilLinks);
    const [days, setDays] = useState(30);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<'' | 'createError' | 'ownerOnly'>('');
    const [created, setCreated] = useState<CouncilLink | null>(null);
    const date = (value: string) => new Date(value).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const create = async () => {
        setBusy(true); setError(''); setCreated(null);
        try {
            const res = await apiFetch(`/api/teacher/groups/${groupId}/council-links`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }),
            });
            if (!res.ok) { setError(res.status === 403 ? 'ownerOnly' : 'createError'); return; }
            setCreated(await res.json() as CouncilLink);
            await links.reload();
        } catch {
            setError('createError');
        } finally {
            setBusy(false);
        }
    };

    const revoke = async (link: CouncilLink) => {
        if (!window.confirm(l('revokeConfirm'))) return;
        const res = await apiFetch(`/api/teacher/council-links/${link.id}`, { method: 'DELETE' }).catch(() => null);
        if (res && res.status === 403) setError('ownerOnly');
        if (created?.id === link.id) setCreated(null);
        await links.reload();
    };

    return <div className="space-y-5">
        <Card className="space-y-4">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-800">{l('title')}</h2>
                <p className="text-sm text-slate-600">{l('intro')}</p>
                <p className="text-sm text-slate-600">{l('privacy')}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span className="block">{l('duration')}</span>
                    <select value={days} onChange={event => setDays(Number(event.target.value))}
                        className="min-h-[44px] rounded-md border border-slate-300 bg-white px-3 text-sm">
                        {DURATIONS.map(value => <option key={value} value={value}>{value} {l('days')}</option>)}
                    </select>
                </label>
                <Button disabled={busy} onClick={() => void create()}>{l(busy ? 'creating' : 'create')}</Button>
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{l(error)}</p>}
            {created?.password && <div role="status" className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-800">{l('newLink')}</p>
                <p className="text-sm text-emerald-800">{l('passwordOnce')}</p>
                <CopyField label={l('link')} value={`${origin}${councilPath(created.token)}`} lang={lang} />
                <CopyField label={l('password')} value={created.password} lang={lang} />
            </div>}
        </Card>
        <Card className="space-y-3">
            <h3 className="font-semibold text-slate-800">{l('links')}</h3>
            {links.loading && <TeacherLoading />}
            {links.failed && <Callout variant="danger"><p>{l('loadError')}</p>
                <Button variant="secondary" onClick={() => void links.reload()}>{l('reload')}</Button></Callout>}
            {links.data && links.data.length === 0 && <p className="text-sm text-slate-500">{l('noLinks')}</p>}
            {links.data && links.data.length > 0 && <ul className="divide-y divide-slate-100">
                {links.data.map(link => <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 space-y-1 text-sm">
                        <p className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${link.state === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{l(link.state)}</span>
                            <span className="text-slate-700">{l('expires')} {date(link.expires_at)}</span>
                        </p>
                        <p className="text-slate-500">{link.last_viewed_at ? `${l('lastViewed')}: ${date(link.last_viewed_at)}` : l('neverViewed')}</p>
                    </div>
                    {link.state === 'active' && <Button variant="secondary" onClick={() => void revoke(link)}>{l('revoke')}</Button>}
                </li>)}
            </ul>}
        </Card>
    </div>;
}
