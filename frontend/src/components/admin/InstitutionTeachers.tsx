'use client';

import { useEffect, useId, useState } from 'react';
import { apiFetch, getIdentity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { institutionTeacherText } from '@/lib/i18n-institution-teachers';

type Membership = { id: number; username: string; institution_id: number; is_active: boolean };

export function InstitutionTeachers({ institutionId, active }: { institutionId: number; active: boolean }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof institutionTeacherText>[1]) => institutionTeacherText(lang, key);
    const [admin, setAdmin] = useState(false);
    const [open, setOpen] = useState(false);
    const [members, setMembers] = useState<Membership[]>([]);
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [errorKey, setErrorKey] = useState<'' | 'loadError' | 'saveError'>('');
    const [attempt, setAttempt] = useState(0);
    const inputId = useId();
    const path = `/api/admin/institutions/${institutionId}/teachers`;
    const control = 'min-h-[44px] rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';

    useEffect(() => {
        let alive = true;
        void getIdentity().then(identity => { if (alive) setAdmin(Boolean(identity?.is_admin)); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (!admin || !open) return;
        const controller = new AbortController();
        void apiFetch(path, { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error('load');
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('load');
            if (!controller.signal.aborted) { setMembers(data); setErrorKey(''); }
        }).catch(() => {
            if (!controller.signal.aborted) setErrorKey('loadError');
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [admin, open, path, attempt]);

    const mutate = async (id?: number) => {
        if (busy) return;
        setBusy(true); setErrorKey('');
        try {
            const response = await apiFetch(id === undefined ? path : `${path}/${id}`, {
                method: id === undefined ? 'POST' : 'DELETE',
                ...(id === undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim() }) } : {}),
            });
            if (!response.ok) throw new Error('write');
            if (id === undefined) {
                const member: Membership = await response.json();
                setMembers(current => [...current.filter(item => item.id !== member.id), member].sort((a, b) => a.username.localeCompare(b.username)));
                setUsername('');
            } else setMembers(current => current.filter(member => member.id !== id));
        } catch { setErrorKey('saveError'); }
        finally { setBusy(false); }
    };

    if (!admin) return null;
    return <details className="w-full border-t border-slate-100 pt-2" onToggle={event => {
        const expanded = event.currentTarget.open;
        if (expanded) { setLoading(true); setErrorKey(''); }
        setOpen(expanded);
    }}>
        <summary className="cursor-pointer py-2 text-sm font-medium">{l('title')}</summary>
        {open && <div className="space-y-3 py-2" aria-busy={loading || busy}>
            <p className="text-xs text-slate-500">{l('hint')}</p>
            {!active && <p className="text-sm text-slate-600">{l('inactive')}</p>}
            {errorKey && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
                <span>{l(errorKey)}</span>
                <button type="button" className={control} disabled={busy} onClick={() => { setLoading(true); setErrorKey(''); setAttempt(value => value + 1); }}>{l('retry')}</button>
            </div>}
            {loading ? <p role="status" className="text-sm text-slate-500">{l('loading')}</p> : <>
                <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void mutate(); }}>
                    <div className="min-w-0 flex-1 basis-48">
                        <label htmlFor={inputId} className="text-sm">{l('account')}</label>
                        <input id={inputId} required maxLength={255} autoComplete="off" spellCheck={false} value={username} disabled={busy || !active || errorKey === 'loadError'} onChange={event => setUsername(event.target.value)} className={`${control} mt-1 w-full`} />
                    </div>
                    <button type="submit" disabled={busy || !active || !username.trim() || errorKey === 'loadError'} className={control}>{l('associate')}</button>
                </form>
                {members.length === 0 ? <p className="text-sm text-slate-500">{l('empty')}</p> : <ul className="space-y-1">
                    {members.map(member => <li key={member.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-1">
                        <span className="min-w-0 break-all text-sm">{member.username}</span>
                        <button type="button" disabled={busy} className={`${control} shrink-0`} aria-label={`${l('revoke')}: ${member.username}`} onClick={() => void mutate(member.id)}>{l('revoke')}</button>
                    </li>)}
                </ul>}
            </>}
        </div>}
    </details>;
}
