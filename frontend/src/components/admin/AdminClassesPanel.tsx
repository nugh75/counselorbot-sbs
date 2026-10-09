'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { classSettingsText } from '@/lib/i18n-class-settings';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { TeacherForbidden, TeacherLoading } from '@/components/teacher/TeacherAccess';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

interface AdminClass {
    id: number; name: string; code: string; school: string | null; institution_id: number | null;
    institution_name: string | null; owner_username: string; owner_display_name: string | null;
    co_teachers: string[]; members_count: number; is_active: boolean; has_custom_settings: boolean; locked_items_count: number;
}
function parseClasses(payload: unknown): AdminClass[] {
    if (!Array.isArray(payload) || !payload.every(row => row && Number.isInteger(row.id)
        && typeof row.name === 'string' && typeof row.owner_username === 'string' && Array.isArray(row.co_teachers))) throw new Error('Invalid classes');
    return payload;
}
function ClassDirectory({ rows }: { rows: AdminClass[] }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof classSettingsText>[1]) => classSettingsText(lang, key);
    const [search, setSearch] = useState('');
    const [owner, setOwner] = useState('');
    const [institution, setInstitution] = useState('');
    const [active, setActive] = useState('');
    const [query, setQuery] = useState('');
    const result = useTeacherResource(`/api/admin/classes${query}`, parseClasses);
    const institutions = [...new Map(rows.filter(row => row.institution_id).map(row => [row.institution_id, row.institution_name])).entries()];
    const owners = [...new Map(rows.map(row => [row.owner_username, row.owner_display_name || row.owner_username])).entries()];
    const inputClass = 'min-h-[44px] min-w-0 rounded-md border border-slate-300 bg-white px-2';
    return <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-800">{l('adminClasses')}</h1>
        <form className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2" onSubmit={event => {
            event.preventDefault();
            const params = new URLSearchParams();
            if (search.trim()) params.set('search', search.trim());
            if (owner) params.set('owner', owner);
            if (institution) params.set('institution_id', institution);
            if (active) params.set('is_active', active);
            const next = `?${params}`;
            if (query === next) void result.reload(); else setQuery(next);
        }}>
            <label className="flex min-w-0 flex-col gap-1">{l('searchClasses')}<input className={inputClass} type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label className="flex min-w-0 flex-col gap-1">{l('owner')}<select className={inputClass} value={owner} onChange={event => setOwner(event.target.value)}><option value="">{l('all')}</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label className="flex min-w-0 flex-col gap-1">{l('institution')}<select className={inputClass} value={institution} onChange={event => setInstitution(event.target.value)}><option value="">{l('all')}</option>{institutions.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}</select></label>
            <label className="flex min-w-0 flex-col gap-1">{l('active')}<select className={inputClass} value={active} onChange={event => setActive(event.target.value)}><option value="">{l('all')}</option><option value="true">{l('active')}</option><option value="false">{l('inactive')}</option></select></label>
            <Button type="submit" disabled={result.loading}>{l('filter')}</Button>
        </form>
        {result.forbidden ? <TeacherForbidden /> : result.loading ? <TeacherLoading /> : result.failed ? <Callout variant="danger">{l('loadError')} <Button onClick={() => void result.reload()}>{l('reload')}</Button></Callout> : <>
            <p className="text-sm text-slate-600">{l('back')}: {result.data?.length ?? 0}</p>
            {!result.data?.length && <p className="text-slate-600">{l('noClasses')}</p>}
            {result.data?.map(row => <Card key={row.id}><article className="space-y-3 break-words text-sm text-slate-700">
                <h2 className="text-lg font-bold text-slate-800">{row.name}</h2>
                <div className="grid gap-2 sm:grid-cols-3"><p className="font-mono">{row.code}</p><p>{row.school}</p><p>{row.institution_name}</p>
                    <p>{l('owner')}: {row.owner_display_name || row.owner_username}</p><p>{row.members_count} {l('members')}</p><p>{l(row.is_active ? 'active' : 'inactive')}</p></div>
                {row.co_teachers.length > 0 && <p>{row.co_teachers.join(' · ')}</p>}
                <p>{row.has_custom_settings && `${l('customSettings')} · `}{l('lockCount')}: {row.locked_items_count}</p>
                <Link href={`/admin/classi/${row.id}`} className="inline-flex min-h-[44px] items-center text-indigo-700 underline">{l('adminEdit')} · {l('audit')}</Link>
                <Link href="/docente/classi" className="ml-4 inline-flex min-h-[44px] items-center text-indigo-700 underline">{l('students')}</Link>
            </article></Card>)}
        </>}
    </div>;
}
export function AdminClassesPanel() {
    const { lang } = useI18n();
    const resource = useTeacherResource('/api/admin/classes', parseClasses);
    if (resource.forbidden) return <TeacherForbidden />;
    if (resource.loading) return <TeacherLoading />;
    if (resource.failed || !resource.data) return <Callout variant="danger">{classSettingsText(lang, 'loadError')} <Button onClick={() => void resource.reload()}>{classSettingsText(lang, 'reload')}</Button></Callout>;
    return <ClassDirectory rows={resource.data} />;
}
