'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { List, ListTree, Network, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getIdentity } from '@/lib/auth';
import { GoalError, goalApi, type CatalogData, type CatalogEntry, type GoalGroup, type TeacherCatalogEntry } from '@/lib/goals';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { useI18n } from '@/lib/i18n-context';
import { buildForest, catalogGoals, descendants, orderBranches } from '@/lib/goal-network';
import { useClientValue } from '@/lib/use-client-value';
import { GoalMap } from './GoalMap';
import { GoalTree } from './GoalTree';
import { Field, GoalIssue, input } from './GoalUI';

type SharedGoal = { id: number; username: string; title: string; status: string; criteria: string; reflection: string; review_date: string | null; parent_ids: number[] };
type CatalogView = 'list' | 'tree' | 'map';
const VIEW_KEY = 'cb_catalog_view';
const readView = (): CatalogView => { try { const value = localStorage.getItem(VIEW_KEY); return value === 'tree' || value === 'map' ? value : 'list'; } catch { return 'list'; } };
const emptyData = (language: string): CatalogData => ({ title: '', description: '', area: '', audience: '', criteria: '', suggestions: '', language });
export function GoalCatalogEditor({ initialData }: { initialData?: CatalogData } = {}) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [rows, setRows] = useState<TeacherCatalogEntry[]>([]); const [groups, setGroups] = useState<GoalGroup[]>([]);
    const [admin, setAdmin] = useState(false); const [username, setUsername] = useState(''); const [editing, setEditing] = useState<TeacherCatalogEntry | null>(null);
    const [data, setData] = useState<CatalogData>(() => initialData ?? emptyData(lang)); const [groupId, setGroupId] = useState<number | null>(null);
    const [status, setStatus] = useState('draft'); const [formOpen, setFormOpen] = useState(Boolean(initialData));
    const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
    const [saved, setSaved] = useState(false); const [sharedGroup, setSharedGroup] = useState('');
    const [shared, setShared] = useState<SharedGoal[]>([]); const [sharedError, setSharedError] = useState<unknown>(null); const [sharedLoading, setSharedLoading] = useState(false);
    const [sharedAttempt, setSharedAttempt] = useState(0);
    const [parentId, setParentId] = useState<number | null>(null); const [parentChoice, setParentChoice] = useState(''); const [cycle, setCycle] = useState(false);
    const [chosenView, setView] = useState<CatalogView | null>(null); const storedView = useClientValue(readView, 'list'); const view = chosenView ?? storedView;
    const chooseView = (next: CatalogView) => { setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* per-viewer convenience only */ } };
    const formRef = useRef<HTMLFormElement>(null);
    const goals = useMemo(() => catalogGoals(rows), [rows]);
    const forest = useMemo(() => buildForest(goals, true), [goals]);
    const fetchCatalog = useCallback(() => Promise.all([
        goalApi<TeacherCatalogEntry[]>('/teacher/goal-catalog'),
        goalApi<GoalGroup[]>('/admin/groups'),
        getIdentity(),
    ]), []);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try { const [entries, groupRows, identity] = await fetchCatalog(); setRows(entries); setGroups(groupRows); setAdmin(Boolean(identity?.is_admin)); setUsername(identity?.username || ''); }
        catch (e) { setError(e); } finally { setLoading(false); }
    }, [fetchCatalog]);
    useEffect(() => {
        let active = true;
        fetchCatalog()
            .then(([entries, groupRows, identity]) => {
                if (!active) return;
                setRows(entries); setGroups(groupRows); setAdmin(Boolean(identity?.is_admin)); setUsername(identity?.username || ''); setLoading(false);
            })
            .catch(e => { if (active) { setError(e); setLoading(false); } });
        return () => { active = false; };
    }, [fetchCatalog]);
    const sharedKey = `${sharedGroup}:${sharedAttempt}`; const [sharedKeyShown, setSharedKeyShown] = useState(sharedKey);
    if (sharedKeyShown !== sharedKey) { setSharedKeyShown(sharedKey); setShared([]); setSharedError(null); setSharedLoading(Boolean(sharedGroup)); }
    useEffect(() => {
        if (!sharedGroup) return;
        let active = true;
        void goalApi<SharedGoal[]>(`/teacher/groups/${sharedGroup}/goals`).then(result => { if (active) setShared(result); }).catch(e => { if (active) setSharedError(e); }).finally(() => { if (active) setSharedLoading(false); });
        return () => { active = false; };
    }, [sharedGroup, sharedAttempt]);
    const open = (row: TeacherCatalogEntry | null, duplicate = false, parent: number | null = null) => {
        setEditing(duplicate ? null : row); setData(row ? { ...row.data } : emptyData(lang)); setGroupId(row?.group_id ?? null);
        setStatus(duplicate ? 'draft' : row?.status || 'draft'); setFormOpen(true); setSaved(false); setError(null);
        setParentId(parent); setParentChoice(''); setCycle(false);
        requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'nearest' }));
    };
    const canEdit = (row: CatalogEntry) => admin || row.author_username === username;
    // Stable while rows and identity are unchanged, so the map does not lay itself out again on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open only reads lang and state setters
    const openGoal = useCallback((id: number) => { const row = rows.find(item => item.id === id); if (row) open(row, !(admin || row.author_username === username)); }, [rows, admin, username, lang]);
    const title = (id: number) => rows.find(row => row.id === id)?.data.title ?? `#${id}`;
    // Branches join one author's entries (backend rule): offer only those, never the entry itself, its descendants or current parents.
    const blocked = editing ? new Set([editing.id, ...descendants(goals, editing.id), ...editing.parent_ids]) : new Set<number>();
    const candidates = editing ? rows.filter(row => row.author_username === editing.author_username && !blocked.has(row.id)) : [];
    const changeParent = async (request: () => Promise<TeacherCatalogEntry>) => {
        setBusy(true); setError(null); setCycle(false);
        try { const row = await request(); setRows(previous => previous.map(item => item.id === row.id ? row : item)); setEditing(row); setParentChoice(''); }
        catch (e) { if (e instanceof GoalError && e.status === 422) setCycle(true); else setError(e); } finally { setBusy(false); }
    };
    const viewButton = (value: CatalogView, icon: ReactNode, key: GoalTextKey, className = '') => <Button type="button" className={className} variant={view === value ? 'primary' : 'secondary'} aria-pressed={view === value} onClick={() => chooseView(value)}>{icon}{l(key)}</Button>;
    const list = <div className="divide-y divide-line">{rows.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{row.data.title}</h3><p className="text-sm text-ink-muted">{l(row.status as GoalTextKey)} · {row.group_id ? groups.find(g => g.id === row.group_id)?.name || l('unavailable') : l('common')} · {l('version')} {row.version} · {row.author_username}</p>{row.target_note && <p className="text-sm text-ink-muted">{l('writtenFor')}: {row.target_note}</p>}</div><div className="flex flex-wrap gap-2">{canEdit(row) && <Button type="button" variant="secondary" onClick={() => open(row)}>{l('edit')}</Button>}<Button type="button" variant="ghost" onClick={() => open(row, true)}>{l('duplicate')}</Button></div></article>)}</div>;
    return <Card as="section" variant="flat" className="space-y-6" aria-label={l('catalog')}>
        <h2 className="text-xl font-semibold">{l('catalog')}</h2><p className="text-sm text-ink-muted">{l('teacherHelp')}</p>
        <GoalIssue error={error} lang={lang} retry={() => void load()} />{saved && <p role="status">{l('saved')}</p>}
        {loading ? <p role="status">{l('loading')}</p> : <>
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => open(null)}>{l('newProposal')}</Button>
                <div className="ml-auto flex flex-wrap gap-2">{viewButton('list', <List className="h-4 w-4" aria-hidden />, 'viewList')}{viewButton('tree', <ListTree className="h-4 w-4" aria-hidden />, 'viewTree')}{viewButton('map', <Network className="h-4 w-4" aria-hidden />, 'viewMap', 'hidden lg:inline-flex')}</div>
            </div>
            {formOpen && <form ref={formRef} onSubmit={async e => {
                e.preventDefault(); setBusy(true); setError(null); setSaved(false);
                try {
                    const row = await goalApi<TeacherCatalogEntry>(`/teacher/goal-catalog${editing ? `/${editing.id}` : ''}`, editing ? 'PUT' : 'POST', { data, group_id: groupId, status, version: editing?.version || 0, ...(editing ? {} : { parent_id: parentId }) });
                    setRows(previous => [row, ...previous.filter(item => item.id !== row.id)]); setFormOpen(false); setSaved(true);
                } catch (e) { setError(e); } finally { setBusy(false); }
            }}><fieldset disabled={busy} className="space-y-4">
                <Field label={l('title')}><input className={input} required maxLength={160} value={data.title} onChange={e => setData({ ...data, title: e.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">{(['area', 'audience'] as const).map(key => <Field key={key} label={l(key)}><input className={input} maxLength={key === 'area' ? 80 : 160} value={data[key]} onChange={e => setData({ ...data, [key]: e.target.value })} /></Field>)}</div>
                {(['description', 'criteria', 'suggestions'] as const).map(key => <Field key={key} label={l(key)}><textarea rows={3} className={input} maxLength={key === 'description' ? 2000 : key === 'criteria' ? 1500 : 3000} value={data[key]} onChange={e => setData({ ...data, [key]: e.target.value })} /></Field>)}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={l('language')}><select className={input} value={data.language} onChange={e => setData({ ...data, language: e.target.value })}>{[['it', 'Italiano'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['sv', 'Svenska']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                    <Field label={l('scope')}><select className={input} value={groupId || ''} onChange={e => { setGroupId(Number(e.target.value) || null); setStatus('draft'); }}><option value="">{l('common')}</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
                    <Field label={l('status')}><select className={input} value={status} onChange={e => setStatus(e.target.value)}>{(['draft', ...(groupId ? [] : ['pending']), ...(admin || groupId ? ['published'] : []), 'archived'] as GoalTextKey[]).map(key => <option key={key} value={key}>{l(key)}</option>)}{status === 'published' && !admin && !groupId && <option value="published" disabled>{l('published')}</option>}</select></Field>
                </div>
                {(editing ? editing.parent_ids.length > 0 : parentId !== null) && <section className="space-y-2" aria-label={l('servesTo')}><h3 className="font-semibold">{l('servesTo')}</h3>
                    <ul className="divide-y divide-line">{(editing ? editing.parent_ids : [parentId!]).map(id => <li key={id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 break-words">{title(id)}</span>{editing && <Button type="button" variant="ghost" aria-label={`${l('detach')} ${title(id)}`} onClick={() => void changeParent(() => goalApi<TeacherCatalogEntry>(`/teacher/goal-catalog/${editing.id}/parents/${id}?version=${editing.version}`, 'DELETE'))}><X className="h-4 w-4" aria-hidden /></Button>}</li>)}</ul>
                </section>}
                {editing && candidates.length > 0 && <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('addParent')}><select className={input} value={parentChoice} onChange={e => { setParentChoice(e.target.value); setCycle(false); }}><option value="">—</option>{candidates.map(row => <option key={row.id} value={row.id}>{row.data.title.slice(0, 120)}</option>)}</select></Field></div><Button type="button" variant="secondary" disabled={!parentChoice} onClick={() => void changeParent(() => goalApi<TeacherCatalogEntry>(`/teacher/goal-catalog/${editing.id}/parents`, 'POST', { parent_id: Number(parentChoice), version: editing.version }))}>{l('attach')}</Button></div>}
                {cycle && <p role="alert" className="text-sm text-danger">{l('cycle')}</p>}
                <div className="flex gap-2"><Button type="submit">{l('save')}</Button><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>{l('cancel')}</Button></div>
            </fieldset></form>}
            {view === 'tree' ? <GoalTree goals={goals} forest={forest} groups={[]} showProgress={false} onOpen={openGoal} onAddChild={id => open(null, false, id)} canAddChild={id => rows.some(row => row.id === id && row.author_username === username)} />
                : view === 'map' ? <><div className="lg:hidden">{list}</div>{rows.length > 0 && <GoalMap goals={goals} all={goals} showProgress={false} onOpen={openGoal} />}</> : list}
            <section className="space-y-4 border-t border-line pt-6" aria-label={l('shared')}><h3 className="font-semibold">{l('shared')}</h3><Field label={l('selectGroup')}><select className={input} value={sharedGroup} onChange={e => setSharedGroup(e.target.value)}><option value="">—</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
                <GoalIssue error={sharedError} lang={lang} retry={() => setSharedAttempt(n => n + 1)} />{sharedLoading && <p role="status">{l('loading')}</p>}{sharedGroup && !sharedLoading && !sharedError && !shared.length && <p className="text-sm text-ink-muted">{l('noShared')}</p>}
                {orderBranches(shared).map(({ row, depth }) => <article key={row.id} style={{ marginInlineStart: `${Math.min(depth, 3) * 1.5}rem` }} className="space-y-2 border-t border-line py-4"><p className="text-sm text-ink-muted">{row.username} · {l(row.status as GoalTextKey)}</p><h4 className="font-semibold">{row.title}</h4><p className="whitespace-pre-wrap text-sm">{row.criteria}</p><p className="whitespace-pre-wrap text-sm">{row.reflection}</p>{row.review_date && <p className="text-sm">{l('reviewDate')}: {row.review_date}</p>}</article>)}
            </section>
        </>}
    </Card>;
}
