'use client';

import { ChevronRight } from 'lucide-react';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { instituteText } from '@/lib/i18n-teacher-institutes';
import { parseInstituteChoices, parseTeacherInstitute, parseTeacherInstitutes, type TeacherInstitute } from '@/lib/teacher-institutes';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { GroupsPanel } from '@/components/admin/GroupsPanel';
import { credentialText } from '@/lib/i18n-institution-credentials';
import { InstituteCredentialsEditor } from './InstituteCredentialsEditor';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';
import { parseClassGroups } from './class-group-types';

const input = 'w-full min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm';

function InstituteEditor({ initial, onSaved, onCancel }: { initial: TeacherInstitute | null; onSaved: () => void; onCancel: () => void }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof instituteText>[1]) => instituteText(lang, key);
    const baseline = { name: initial?.name ?? '', kind: initial?.kind ?? 'school', website_url: initial?.website_url ?? '', orientation_page_url: initial?.orientation_page_url ?? '' };
    const [draft, setDraft] = useState(baseline);
    const [notice, setNotice] = useState<'error' | 'conflict' | null>(null);
    const [busy, setBusy] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const pending = useRef<AbortController | null>(null);
    const account = useRef(getViewAsAccount()?.username);
    useEffect(() => () => { pending.current?.abort(); }, []);
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
    useDraftGuard(dirty, l('discard'), { blocked: busy });
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (pending.current) return;
        if (account.current !== getViewAsAccount()?.username) { setForbidden(true); return; }
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true); setNotice(null);
        try {
            const response = await apiFetch(`/api/teacher/institutions${initial ? `/${initial.id}` : ''}`, {
                method: initial ? 'PUT' : 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...draft, name: draft.name.trim(), website_url: draft.website_url.trim() || null,
                    orientation_page_url: draft.orientation_page_url.trim() || null, ...(initial ? { revision: initial.revision } : {}) }),
            });
            if (controller.signal.aborted) return;
            if (account.current !== getViewAsAccount()?.username || [401, 403].includes(response.status)) { setForbidden(true); return; }
            if (!response.ok) { setNotice(initial && response.status === 409 ? 'conflict' : 'error'); return; }
            parseTeacherInstitute(await response.json());
            onSaved();
        } catch { if (!controller.signal.aborted) setNotice('error'); }
        finally { if (!controller.signal.aborted) { setBusy(false); pending.current = null; } }
    };
    if (forbidden) return <TeacherForbidden />;
    return <Card><form onSubmit={event => void save(event)} className="space-y-4">
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">{l('name')}<input className={input} required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="space-y-1 text-sm">{l('kind')}<select className={input} value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as 'school' | 'university' })}><option value="school">{l('school')}</option><option value="university">{l('university')}</option></select></label>
            {(['website_url', 'orientation_page_url'] as const).map((key, index) => <label key={key} className="space-y-1 text-sm">{l(index === 0 ? 'website' : 'orientation')}<input type="url" className={input} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        </fieldset>
        {notice && <Callout variant="danger"><p>{l(notice)}</p></Callout>}
        <div className="flex gap-2"><Button type="submit" disabled={busy || !draft.name.trim()}>{l('save')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { if (!dirty || window.confirm(l('discard'))) onCancel(); }}>{l('cancel')}</Button></div>
    </form></Card>;
}

export function InstitutesPanel() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof instituteText>[1]) => instituteText(lang, key);
    const own = useTeacherResource('/api/teacher/institutions', parseTeacherInstitutes);
    const [query, setQuery] = useState('');
    const [offset, setOffset] = useState(0);
    const directory = useTeacherResource(`/api/teacher/institutions/directory?q=${encodeURIComponent(query)}&offset=${offset}`, parseInstituteChoices);
    const [selected, setSelected] = useState('');
    const [editor, setEditor] = useState<TeacherInstitute | null | undefined>(undefined);
    const [credentialsFor, setCredentialsFor] = useState<number | null>(null);
    const [joinError, setJoinError] = useState(false);
    const [joining, setJoining] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const pending = useRef<AbortController | null>(null);
    const account = useRef(getViewAsAccount()?.username);
    useEffect(() => () => { pending.current?.abort(); }, []);
    const reload = () => { void own.reload(); void directory.reload(); };
    const join = async () => {
        if (pending.current || !selected) return;
        if (account.current !== getViewAsAccount()?.username) { setForbidden(true); return; }
        const controller = new AbortController(); pending.current = controller;
        setJoining(true); setJoinError(false);
        try {
            const response = await apiFetch(`/api/teacher/institutions/${selected}/join`, { method: 'POST', signal: controller.signal });
            if (controller.signal.aborted) return;
            if (account.current !== getViewAsAccount()?.username || [401, 403].includes(response.status)) { setForbidden(true); return; }
            if (!response.ok) throw new Error('Join failed');
            setSelected(''); reload();
        } catch { if (!controller.signal.aborted) { setJoinError(true); void directory.reload(); } }
        finally { if (!controller.signal.aborted) { setJoining(false); pending.current = null; } }
    };
    if (forbidden || own.forbidden || directory.forbidden) return <TeacherForbidden />;
    const choice = directory.data?.find(row => String(row.id) === selected);
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-slate-600">{l('duplicateHint')}</p><Button disabled={editor !== undefined || joining} onClick={() => setEditor(null)}>{l('create')}</Button></div>
        {editor !== undefined && <InstituteEditor key={editor?.id ?? 'new'} initial={editor} onSaved={() => { setEditor(undefined); reload(); }} onCancel={() => { setEditor(undefined); reload(); }} />}
        <Card><section aria-labelledby="institute-directory" className="space-y-3">
            <h2 id="institute-directory" className="font-bold">{l('directory')}</h2><p className="text-sm text-slate-600">{l('joinHint')}</p>
            <label className="block text-sm">{l('search')}<input type="search" className={input} value={query} disabled={joining} onChange={event => { setQuery(event.target.value); setOffset(0); setSelected(''); }} /></label>
            {directory.failed ? <Callout variant="danger"><p>{l('loadError')}</p><Button onClick={() => void directory.reload()}>{l('reload')}</Button></Callout> : <>
                <label className="block text-sm">{l('directory')}<select aria-label={l('directory')} className={input} value={selected} disabled={directory.loading || joining} onChange={event => setSelected(event.target.value)}><option value="">{l('select')}</option>{directory.data?.map(row => <option key={row.id} value={row.id} disabled={!row.can_join}>{row.name}{row.joined ? ` — ${l('joined')}` : !row.can_join ? ` — ${l('full')}` : ''}</option>)}</select></label>
                <Button disabled={!choice?.can_join || directory.loading || joining} onClick={() => void join()}>{l('join')}</Button>
                {directory.data?.length === 100 && <Button variant="secondary" onClick={() => { setOffset(offset + 100); setSelected(''); }}>{l('more')}</Button>}
            </>}
            {joinError && <p role="alert" className="text-sm text-red-700">{l('joinError')}</p>}
        </section></Card>
        <section aria-labelledby="my-institutes" className="space-y-3"><h2 id="my-institutes" className="font-bold">{l('mine')}</h2>
            {own.loading && <TeacherLoading />}
            {own.failed && <Callout variant="danger"><p>{l('loadError')}</p><Button onClick={() => void own.reload()}>{l('reload')}</Button></Callout>}
            {!own.loading && !own.failed && own.data?.length === 0 && <p>{l('empty')}</p>}
            {own.data?.map(row => <Card key={row.id}><div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/docente/istituti/${row.id}`} className="min-h-11 break-words font-semibold text-indigo-700">{row.name}</Link><Button variant="secondary" disabled={editor !== undefined || joining} onClick={() => setEditor(row)}>{l('edit')}</Button></div><p className="text-sm text-slate-600">{l('credentials')}: {l(row.credentials_configured ? 'configured' : 'missing')}{row.institution_code && <> · {credentialText(lang, 'codeLabel')}: <span className="font-mono">{row.institution_code}</span></>}</p>
                {credentialsFor === row.id
                    ? <InstituteCredentialsEditor institute={row} onSaved={() => { setCredentialsFor(null); reload(); }} onCancel={() => setCredentialsFor(null)} />
                    : <Button variant="secondary" className="mt-2" disabled={editor !== undefined || joining || credentialsFor !== null} onClick={() => setCredentialsFor(row.id)}>{credentialText(lang, row.credentials_configured ? 'replaceCredentials' : 'setCredentials')}</Button>}
                {row.needs_admin_review && <Callout variant="warning">{l('review')}</Callout>}</Card>)}
        </section>
    </div>;
}

export function InstituteClasses({ institutionId }: { institutionId: number }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof instituteText>[1]) => instituteText(lang, key);
    const school = useTeacherResource(`/api/teacher/institutions/${institutionId}`, parseTeacherInstitute);
    const groups = useTeacherResource('/api/admin/groups', parseClassGroups);
    const [selected, setSelected] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const [version, setVersion] = useState(0);
    const pending = useRef<AbortController | null>(null);
    const account = useRef(getViewAsAccount()?.username);
    useEffect(() => () => { pending.current?.abort(); }, []);
    const attach = async () => {
        if (!selected || pending.current) return;
        if (account.current !== getViewAsAccount()?.username) { setForbidden(true); return; }
        const controller = new AbortController(); pending.current = controller; setBusy(true); setError(false);
        try {
            const response = await apiFetch(`/api/admin/groups/${selected}`, { method: 'PUT', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ institution_id: institutionId }) });
            if (controller.signal.aborted) return;
            if (account.current !== getViewAsAccount()?.username || [401, 403].includes(response.status)) { setForbidden(true); return; }
            if (!response.ok) throw new Error('Class link failed');
            setSelected(''); void groups.reload(); setVersion(value => value + 1);
        } catch { if (!controller.signal.aborted) setError(true); }
        finally { if (!controller.signal.aborted) { setBusy(false); pending.current = null; } }
    };
    if (forbidden || school.forbidden || groups.forbidden) return <TeacherForbidden />;
    if (school.loading) return <TeacherLoading />;
    if (school.failed || !school.data) return <Callout variant="danger"><p>{l('loadError')}</p><Button onClick={() => void school.reload()}>{l('reload')}</Button></Callout>;
    return <div className="space-y-5">
        <nav aria-label={l('classes')} className="flex flex-wrap gap-2 text-sm"><Link href="/docente/istituti" className="text-indigo-700">{l('title')}</Link><ChevronRight className="h-4 w-4 self-center text-slate-400" aria-hidden /><span>{school.data.name}</span><ChevronRight className="h-4 w-4 self-center text-slate-400" aria-hidden /><span>{l('classes')}</span></nav>
        <h2 className="break-words text-xl font-bold">{school.data.name}</h2>
        {groups.failed && <Callout variant="danger"><p>{l('loadError')}</p><Button onClick={() => void groups.reload()}>{l('reload')}</Button></Callout>}
        {groups.data?.some(row => row.institution_id === null) && <Card><div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">{l('unlinked')}<select aria-label={l('unlinked')} className={input} value={selected} disabled={busy || groups.loading} onChange={event => setSelected(event.target.value)}><option value="">{l('select')}</option>{groups.data.filter(row => row.institution_id === null).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><Button disabled={!selected || busy || groups.loading} onClick={() => void attach()}>{l('attach')}</Button></div>{error && <p role="alert">{l('error')}</p>}</Card>}
        <GroupsPanel key={version} institutionId={institutionId} />
    </div>;
}
