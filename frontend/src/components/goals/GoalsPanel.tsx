'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { blankGoal, goalApi, goalFields, type PersonalGoal, type CatalogEntry, type GoalFields, type GoalGroup, type GoalResource } from '@/lib/goals';
import { Field, GoalIssue, input, resourceLabel } from './GoalUI';

function useDraftGuard(dirty: boolean, message: string) {
    useEffect(() => {
        if (!dirty) return;
        const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        const leave = (event: MouseEvent) => {
            const anchor = (event.target as Element).closest?.('a[href]');
            if (anchor && !window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
        };
        window.addEventListener('beforeunload', unload); document.addEventListener('click', leave, true);
        return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true); };
    }, [dirty, message]);
}

type FormProps = { form: GoalFields; setForm: (form: GoalFields) => void; groups: GoalGroup[] };
function GoalForm({ form, setForm, groups }: FormProps) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    return <div className="space-y-4">
        <Field label={l('title')}><input className={input} required maxLength={160} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        {(['motivation', 'criteria', 'reflection'] as const).map(key => <Field key={key} label={l(key)}><textarea className={input} rows={3} maxLength={key === 'criteria' ? 1500 : key === 'reflection' ? 3000 : 2000} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></Field>)}
        <div className="grid gap-4 sm:grid-cols-3">
            <Field label={l('reviewDate')}><input className={input} type="date" value={form.review_date || ''} onChange={e => setForm({ ...form, review_date: e.target.value || null })} /></Field>
            <Field label={l('priority')}><select className={input} value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })}>{(['high', 'normal', 'low'] as const).map((key, i) => <option key={key} value={i + 1}>{l(key)}</option>)}</select></Field>
            <Field label={l('status')}><select className={input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{(['active', 'paused', 'completed', 'archived'] as const).map(key => <option key={key} value={key}>{l(key)}</option>)}</select></Field>
        </div>
        <Field label={l('share')}><select className={input} value={form.shared_group_id || ''} onChange={e => setForm({ ...form, shared_group_id: Number(e.target.value) || null })}>
            <option value="">{l('private')}</option>{form.shared_group_id && !groups.some(g => g.id === form.shared_group_id) && <option value={form.shared_group_id}>{l('unavailable')}</option>}{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select></Field><p className="text-sm text-slate-600">{l('shareHelp')}</p>
    </div>;
}

function GoalDetail({ goal, groups, onSaved, onDelete, onDirty, onReload }: { goal: PersonalGoal; groups: GoalGroup[]; onSaved: (row: PersonalGoal) => void; onDelete: () => void; onDirty: (dirty: boolean) => void; onReload: () => void }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [form, setForm] = useState(() => goalFields(goal));
    const [resources, setResources] = useState<GoalResource[]>([]);
    const [selection, setSelection] = useState('');
    const [action, setAction] = useState({ title: '', detail: '', date: '' });
    const requestId = useRef('');
    const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
    const [resourcesError, setResourcesError] = useState<unknown>(null);
    const dirty = JSON.stringify(form) !== JSON.stringify(goalFields(goal));
    useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
    useDraftGuard(dirty, l('discard'));
    const loadResources = useCallback(() => { void goalApi<GoalResource[]>('/user/goal-resources').then(rows => { setResources(rows); setResourcesError(null); }).catch(setResourcesError); }, []);
    useEffect(loadResources, [loadResources]);
    const run = async (path: string, method: string, body?: unknown) => {
        setBusy(true); setError(null);
        try { const row = await goalApi<PersonalGoal>(path, method, body); onSaved(row); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const base = `/user/goals/${goal.id}`;
    const available = resources.filter(r => !goal.links.some(link => link.kind === r.kind && link.target_id === r.target_id));
    return <section className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-label={goal.title}>
        <h2 className="break-words text-xl font-bold text-slate-900">{goal.title}</h2>
        {goal.catalog_snapshot.data && <details className="rounded-md bg-slate-50 p-3 text-sm"><summary className="cursor-pointer py-1 font-semibold">{l('source')} · {l('version')} {goal.catalog_snapshot.version}</summary><p className="mt-2">{goal.catalog_snapshot.data.description}</p><p className="mt-2 whitespace-pre-wrap"><strong>{l('suggestions')}: </strong>{goal.catalog_snapshot.data.suggestions}</p></details>}
        <GoalIssue error={error} lang={lang} retry={onReload} />
        <form onSubmit={e => { e.preventDefault(); void run(base, 'PUT', form); }}><fieldset disabled={busy} className="space-y-4"><GoalForm form={form} setForm={setForm} groups={groups} /><p className="text-sm text-slate-600">{l('doneHelp')}</p><Button type="submit" disabled={!dirty}>{l('save')}</Button></fieldset></form>
        <section className="space-y-3 border-t border-slate-200 pt-5">
            <h3 className="font-bold">{l('links')}</h3>
            {goal.links.map(link => <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-3">
                <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{resourceLabel(lang, link.kind)}{link.stage && ` · ${link.stage === 'done' ? l('completed') : link.stage === 'doing' ? l('active') : l('next')}`}{link.date && ` · ${link.date}`}</p>{link.available && link.href ? <Link className="break-words font-medium text-indigo-700 underline" href={link.href}>{link.title}</Link> : <span>{l('unavailable')}</span>}</div>
                <Button type="button" variant="ghost" disabled={busy || dirty} onClick={() => void run(`${base}/links/${link.id}?revision=${goal.revision}`, 'DELETE')}>{l('unlink')}</Button>
            </div>)}
            {dirty && <p role="status" className="text-sm text-slate-600">{l('unsaved')}</p>}
            <GoalIssue error={resourcesError} lang={lang} retry={loadResources} />
            <form onSubmit={e => { e.preventDefault(); const resource = available.find(r => `${r.kind}:${r.target_id}` === selection); if (resource) void run(`${base}/links`, 'POST', { kind: resource.kind, target_id: resource.target_id, revision: goal.revision }); }}>
                <fieldset disabled={busy || dirty} className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('pickResource')}><select required className={input} value={selection} onChange={e => setSelection(e.target.value)}><option value="">—</option>{available.map(r => <option key={`${r.kind}:${r.target_id}`} value={`${r.kind}:${r.target_id}`}>{resourceLabel(lang, r.kind)} · {r.title.slice(0, 120)}</option>)}</select></Field></div><Button type="submit" disabled={!selection}>{l('link')}</Button></fieldset>
            </form>
        </section>
        <details className="rounded-md border border-slate-200 p-3"><summary className="cursor-pointer py-2 font-semibold">{l('createAction')}</summary>
            <form className="mt-3" onSubmit={e => { e.preventDefault(); requestId.current ||= crypto.randomUUID(); void run(`${base}/actions`, 'POST', { ...action, date: action.date || null, revision: goal.revision, request_id: requestId.current }); }}><fieldset disabled={busy || dirty} className="space-y-3">
                <p className="text-sm text-slate-600">{l('actionHelp')}</p>
                <Field label={l('actionTitle')}><input className={input} required maxLength={160} value={action.title} onChange={e => setAction({ ...action, title: e.target.value })} /></Field>
                <Field label={l('detail')}><textarea className={input} maxLength={1000} value={action.detail} onChange={e => setAction({ ...action, detail: e.target.value })} /></Field>
                <Field label={l('date')}><input className={input} type="date" value={action.date} onChange={e => setAction({ ...action, date: e.target.value })} /></Field>
                <Button type="submit">{l('createAction')}</Button>
            </fieldset></form>
        </details>
        <Button type="button" variant="ghost" disabled={busy || dirty} onClick={async () => { if (!window.confirm(l('deleteConfirm'))) return; setBusy(true); try { await goalApi(`${base}?revision=${goal.revision}`, 'DELETE'); onDelete(); } catch (e) { setError(e); } finally { setBusy(false); } }}>{l('delete')}</Button>
    </section>;
}

export function GoalsPanel() {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [goals, setGoals] = useState<PersonalGoal[]>([]); const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
    const [groups, setGroups] = useState<GoalGroup[]>([]); const [selected, setSelected] = useState<number | null>(null);
    const detailDirty = useRef(false); const createRequest = useRef('');
    const onDirty = useCallback((dirty: boolean) => { detailDirty.current = dirty; }, []);
    const [mode, setMode] = useState<'list' | 'catalog' | 'create'>('list');
    const [source, setSource] = useState<CatalogEntry | null>(null); const [form, setForm] = useState<GoalFields>({ ...blankGoal });
    const [search, setSearch] = useState(''); const [area, setArea] = useState('');
    const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null); const [saved, setSaved] = useState(false);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [rows, entries, memberships] = await Promise.all([goalApi<PersonalGoal[]>('/user/goals'), goalApi<CatalogEntry[]>('/user/goal-catalog'), goalApi<GoalGroup[]>('/user/goal-groups')]);
            setGoals(rows); setCatalog(entries); setGroups(memberships);
            const requested = Number(new URLSearchParams(window.location.search).get('goal'));
            setSelected(previous => rows.some(g => g.id === (previous || requested)) ? previous || requested : rows[0]?.id ?? null);
        } catch (e) { setError(e); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);
    const createDirty = mode === 'create' && JSON.stringify(form) !== JSON.stringify({ ...blankGoal, title: source?.data.title || '', criteria: source?.data.criteria || '' });
    useDraftGuard(createDirty, l('discard'));
    const navigate = (action: () => void) => { if ((!detailDirty.current && !createDirty) || window.confirm(l('discard'))) { detailDirty.current = false; action(); } };
    const chosen = goals.find(g => g.id === selected);
    const entries = catalog.filter(row => (!area || row.data.area === area) && `${row.data.title} ${row.data.description} ${row.data.audience}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    const start = (entry: CatalogEntry | null) => { createRequest.current = crypto.randomUUID(); setSource(entry); setForm({ ...blankGoal, title: entry?.data.title || '', criteria: entry?.data.criteria || '' }); setMode('create'); setSaved(false); setError(null); };
    return <div className="space-y-5">
        <div className="flex flex-wrap gap-2"><Button type="button" variant={mode === 'list' ? 'primary' : 'secondary'} onClick={() => navigate(() => setMode('list'))}>{l('goals')}</Button><Button type="button" variant={mode === 'catalog' ? 'primary' : 'secondary'} onClick={() => navigate(() => setMode('catalog'))}>{l('choose')}</Button><Button type="button" variant="secondary" onClick={() => navigate(() => start(null))}>{l('custom')}</Button></div>
        <GoalIssue error={error} lang={lang} retry={() => void load()} />
        {saved && <p role="status" className="text-indigo-700">{l('saved')}</p>}
        {loading ? <p role="status">{l('loading')}</p> : mode === 'catalog' ? <section className="space-y-4" aria-label={l('catalog')}>
            <div className="grid gap-3 sm:grid-cols-2"><Field label={l('search')}><input className={input} value={search} onChange={e => setSearch(e.target.value)} /></Field><Field label={l('area')}><select className={input} value={area} onChange={e => setArea(e.target.value)}><option value="">{l('allAreas')}</option>{[...new Set(catalog.map(row => row.data.area).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></Field></div>
            {!entries.length && <p>{l('noResults')}</p>}
            <div className="grid gap-4 md:grid-cols-2">{entries.map(entry => <article key={entry.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">{entry.data.area} · {entry.data.language.toUpperCase()}{entry.data.audience && ` · ${entry.data.audience}`}</p><h2 className="break-words text-lg font-bold" lang={entry.data.language}>{entry.data.title}</h2><p className="whitespace-pre-wrap text-sm text-slate-600" lang={entry.data.language}>{entry.data.description}</p>{entry.data.suggestions && <details className="text-sm"><summary className="cursor-pointer py-2">{l('suggestions')}</summary><p className="whitespace-pre-wrap" lang={entry.data.language}>{entry.data.suggestions}</p></details>}<Button type="button" variant="secondary" className="mt-auto self-start" onClick={() => start(entry)}>{l('adopt')}</Button></article>)}</div>
        </section> : mode === 'create' ? <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" onSubmit={async e => {
            e.preventDefault(); setBusy(true); setError(null);
            try { const row = await goalApi<PersonalGoal>('/user/goals', 'POST', { ...form, catalog_id: source?.id ?? null, catalog_version: source?.version ?? null, request_id: createRequest.current }); setGoals(previous => [row, ...previous]); setSelected(row.id); setMode('list'); setSaved(true); }
            catch (e) { setError(e); } finally { setBusy(false); }
        }}><fieldset disabled={busy} className="space-y-4"><h2 className="text-xl font-bold">{source ? l('adopt') : l('custom')}</h2><GoalForm form={form} setForm={setForm} groups={groups} /><div className="flex gap-2"><Button type="submit">{l('save')}</Button><Button type="button" variant="secondary" onClick={() => navigate(() => setMode('list'))}>{l('cancel')}</Button></div></fieldset></form> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <nav aria-label={l('goals')} className="min-w-0 space-y-2">{!goals.length && !error && <p className="py-3">{l('empty')}</p>}{goals.map(row => <button key={row.id} type="button" onClick={() => navigate(() => { setSelected(row.id); setSaved(false); })} aria-current={selected === row.id ? 'true' : undefined} className={`w-full rounded-lg border p-4 text-left ${selected === row.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><span className="block text-xs text-slate-500">{l(row.status as GoalTextKey)}</span><span className="block break-words font-semibold">{row.title}</span>{row.review_date && <span className="mt-2 block text-sm text-slate-600">{l('reviewDate')}: {row.review_date}</span>}</button>)}<Link className="block py-3 text-sm text-indigo-700 underline" href="/bussola">{l('unsure')}</Link></nav>
            {chosen && <GoalDetail key={`${chosen.id}-${chosen.revision}`} goal={chosen} groups={groups} onDirty={onDirty} onReload={() => void load()} onSaved={row => { setGoals(previous => previous.map(g => g.id === row.id ? row : g)); setSaved(true); }} onDelete={() => { setGoals(previous => previous.filter(g => g.id !== chosen.id)); setSelected(null); }} />}
        </div>}
    </div>;
}
