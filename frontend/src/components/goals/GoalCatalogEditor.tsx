'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getIdentity } from '@/lib/auth';
import { goalApi, type CatalogData, type CatalogEntry, type GoalGroup } from '@/lib/goals';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { useI18n } from '@/lib/i18n-context';
import { Field, GoalIssue, input } from './GoalUI';
import { AssignmentButton } from '@/components/teacher/AssignmentButton';

type SharedGoal = { id: number; username: string; title: string; status: string; criteria: string; reflection: string; review_date: string | null };
const emptyData = (language: string): CatalogData => ({ title: '', description: '', area: '', audience: '', criteria: '', suggestions: '', language });
export function GoalCatalogEditor({ initialData }: { initialData?: CatalogData } = {}) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [rows, setRows] = useState<CatalogEntry[]>([]); const [groups, setGroups] = useState<GoalGroup[]>([]);
    const [admin, setAdmin] = useState(false); const [username, setUsername] = useState(''); const [editing, setEditing] = useState<CatalogEntry | null>(null);
    const [data, setData] = useState<CatalogData>(() => initialData ?? emptyData(lang)); const [groupId, setGroupId] = useState<number | null>(null);
    const [status, setStatus] = useState('draft'); const [formOpen, setFormOpen] = useState(Boolean(initialData));
    const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
    const [saved, setSaved] = useState(false); const [sharedGroup, setSharedGroup] = useState('');
    const [shared, setShared] = useState<SharedGoal[]>([]); const [sharedError, setSharedError] = useState<unknown>(null); const [sharedLoading, setSharedLoading] = useState(false);
    const [sharedAttempt, setSharedAttempt] = useState(0);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try { const [entries, groupRows, identity] = await Promise.all([goalApi<CatalogEntry[]>('/teacher/goal-catalog'), goalApi<GoalGroup[]>('/admin/groups'), getIdentity()]); setRows(entries); setGroups(groupRows); setAdmin(Boolean(identity?.is_admin)); setUsername(identity?.username || ''); }
        catch (e) { setError(e); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (!sharedGroup) { setShared([]); return; }
        let active = true; setSharedLoading(true); setShared([]); setSharedError(null);
        void goalApi<SharedGoal[]>(`/teacher/groups/${sharedGroup}/goals`).then(result => { if (active) setShared(result); }).catch(e => { if (active) setSharedError(e); }).finally(() => { if (active) setSharedLoading(false); });
        return () => { active = false; };
    }, [sharedGroup, sharedAttempt]);
    const open = (row: CatalogEntry | null, duplicate = false) => {
        setEditing(duplicate ? null : row); setData(row ? { ...row.data } : emptyData(lang)); setGroupId(row?.group_id ?? null);
        setStatus(duplicate ? 'draft' : row?.status || 'draft'); setFormOpen(true); setSaved(false); setError(null);
    };
    return <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-label={l('catalog')}>
        <h2 className="text-xl font-bold">{l('catalog')}</h2><p className="text-sm text-slate-600">{l('teacherHelp')}</p>
        <GoalIssue error={error} lang={lang} retry={() => void load()} />{saved && <p role="status">{l('saved')}</p>}
        {loading ? <p role="status">{l('loading')}</p> : <>
            <Button type="button" onClick={() => open(null)}>{l('newProposal')}</Button>
            {formOpen && <form onSubmit={async e => {
                e.preventDefault(); setBusy(true); setError(null); setSaved(false);
                try {
                    const row = await goalApi<CatalogEntry>(`/teacher/goal-catalog${editing ? `/${editing.id}` : ''}`, editing ? 'PUT' : 'POST', { data, group_id: groupId, status, version: editing?.version || 0 });
                    setRows(previous => [row, ...previous.filter(item => item.id !== row.id)]); setFormOpen(false); setSaved(true);
                } catch (e) { setError(e); } finally { setBusy(false); }
            }}><fieldset disabled={busy} className="space-y-4 rounded-lg bg-slate-50 p-4">
                <Field label={l('title')}><input className={input} required maxLength={160} value={data.title} onChange={e => setData({ ...data, title: e.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">{(['area', 'audience'] as const).map(key => <Field key={key} label={l(key)}><input className={input} maxLength={key === 'area' ? 80 : 160} value={data[key]} onChange={e => setData({ ...data, [key]: e.target.value })} /></Field>)}</div>
                {(['description', 'criteria', 'suggestions'] as const).map(key => <Field key={key} label={l(key)}><textarea rows={3} className={input} maxLength={key === 'description' ? 2000 : key === 'criteria' ? 1500 : 3000} value={data[key]} onChange={e => setData({ ...data, [key]: e.target.value })} /></Field>)}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={l('language')}><select className={input} value={data.language} onChange={e => setData({ ...data, language: e.target.value })}>{[['it', 'Italiano'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['sv', 'Svenska']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                    <Field label={l('scope')}><select className={input} value={groupId || ''} onChange={e => { setGroupId(Number(e.target.value) || null); setStatus('draft'); }}><option value="">{l('common')}</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
                    <Field label={l('status')}><select className={input} value={status} onChange={e => setStatus(e.target.value)}>{(['draft', ...(groupId ? [] : ['pending']), ...(admin || groupId ? ['published'] : []), 'archived'] as GoalTextKey[]).map(key => <option key={key} value={key}>{l(key)}</option>)}{status === 'published' && !admin && !groupId && <option value="published" disabled>{l('published')}</option>}</select></Field>
                </div>
                <div className="flex gap-2"><Button type="submit">{l('save')}</Button><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>{l('cancel')}</Button></div>
            </fieldset></form>}
            <div className="divide-y divide-slate-200">{rows.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{row.data.title}</h3><p className="text-sm text-slate-500">{l(row.status as GoalTextKey)} · {row.group_id ? groups.find(g => g.id === row.group_id)?.name || l('unavailable') : l('common')} · {l('version')} {row.version} · {row.author_username}</p></div><div className="flex flex-wrap gap-2">{row.status === 'published' && <AssignmentButton kind="goal" id={row.id} title={row.data.title} groupId={row.group_id} />}{(admin || row.author_username === username) && <Button type="button" variant="secondary" onClick={() => open(row)}>{l('edit')}</Button>}<Button type="button" variant="ghost" onClick={() => open(row, true)}>{l('duplicate')}</Button></div></article>)}</div>
            <section className="space-y-3 border-t border-slate-200 pt-5" aria-label={l('shared')}><h3 className="font-bold">{l('shared')}</h3><Field label={l('selectGroup')}><select className={input} value={sharedGroup} onChange={e => setSharedGroup(e.target.value)}><option value="">—</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
                <GoalIssue error={sharedError} lang={lang} retry={() => setSharedAttempt(n => n + 1)} />{sharedLoading && <p role="status">{l('loading')}</p>}{sharedGroup && !sharedLoading && !sharedError && !shared.length && <p className="text-sm text-slate-600">{l('noShared')}</p>}
                {shared.map(row => <article key={row.id} className="space-y-2 rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">{row.username} · {l(row.status as GoalTextKey)}</p><h4 className="font-semibold">{row.title}</h4><p className="whitespace-pre-wrap text-sm">{row.criteria}</p><p className="whitespace-pre-wrap text-sm">{row.reflection}</p>{row.review_date && <p className="text-sm">{l('reviewDate')}: {row.review_date}</p>}</article>)}
            </section>
        </>}
    </section>;
}
