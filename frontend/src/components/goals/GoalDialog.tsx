'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalFormat, goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { blankGoal, goalApi, goalFields, GoalError, type CatalogEntry, type GoalFields, type GoalGroup, type GoalResource, type PersonalGoal } from '@/lib/goals';
import { compareGoals, descendants, effectiveShares, progress, visibilityDelta } from '@/lib/goal-network';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { GoalForm } from './GoalForm';
import { Field, GoalIssue, input, resourceLabel } from './GoalUI';

export type DialogTarget = { kind: 'edit'; id: number } | { kind: 'create'; parentId?: number; source?: CatalogEntry };
type Shared = { goals: PersonalGoal[]; groups: GoalGroup[]; onSaved: (row: PersonalGoal) => void; onCreated: (row: PersonalGoal) => void; onDeleted: () => void; onReload: () => void };
type Props = Shared & { target: DialogTarget; saved: boolean; onTarget: (target: DialogTarget) => void; onClose: () => void };

/** Modal on desktop, full-screen sheet on mobile. Unsaved work is confirmed before any exit. */
export function GoalDialog({ target, saved, onTarget, onClose, ...shared }: Props) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const dialog = useRef<HTMLDialogElement>(null); const dirty = useRef(false);
    const leave = (action: () => void) => { if (!dirty.current || window.confirm(l('discard'))) { dirty.current = false; action(); } };
    const onDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
    useEffect(() => {
        const node = dialog.current; const opener = document.activeElement as HTMLElement | null;
        if (node && !node.open) node.showModal();
        return () => opener?.focus?.();
    }, []);
    const goal = target.kind === 'edit' ? shared.goals.find(row => row.id === target.id) : undefined;
    const title = goal?.title ?? (target.kind === 'create' && target.source ? l('adopt') : l('custom'));
    const bodyKey = target.kind === 'edit' ? `${target.id}-${goal?.revision}` : `new-${target.parentId ?? ''}-${target.source?.id ?? ''}`;
    return <dialog ref={dialog} aria-labelledby="goal-dialog-title"
        onCancel={event => { event.preventDefault(); leave(onClose); }}
        onClick={event => { if (event.target === dialog.current) leave(onClose); }}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-slate-900 backdrop:bg-slate-900/50 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-xl">
        <div className="flex h-full max-h-[inherit] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6">
                <h2 id="goal-dialog-title" className="min-w-0 break-words text-xl font-bold">{title}</h2>
                <Button type="button" variant="ghost" aria-label={l('close')} onClick={() => leave(onClose)}><X className="h-5 w-5" aria-hidden /></Button>
            </div>
            {target.kind === 'edit' && !goal ? <p className="p-6">{l('unavailable')}</p>
                : <GoalDialogBody key={bodyKey} target={target} goal={goal} saved={saved} onDirty={onDirty}
                    onNavigate={next => leave(() => onTarget(next))} onRequestClose={() => leave(onClose)} {...shared}
                    onCreated={row => { dirty.current = false; shared.onCreated(row); }} />}
        </div>
    </dialog>;
}

type BodyProps = Shared & { target: DialogTarget; goal?: PersonalGoal; saved: boolean; onDirty: (dirty: boolean) => void; onNavigate: (target: DialogTarget) => void; onRequestClose: () => void };

function GoalDialogBody({ target, goal, goals, groups, saved, onDirty, onNavigate, onRequestClose, onSaved, onCreated, onDeleted, onReload }: BodyProps) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const source = target.kind === 'create' ? target.source : undefined;
    const parentId = target.kind === 'create' ? target.parentId : undefined;
    const initial = useMemo<GoalFields>(() => goal ? goalFields(goal) : { ...blankGoal, title: source?.data.title || '', criteria: source?.data.criteria || '' }, [goal, source]);
    const [form, setForm] = useState<GoalFields>(initial);
    const [action, setAction] = useState({ title: '', detail: '', date: '' });
    const [selection, setSelection] = useState(''); const [parentChoice, setParentChoice] = useState('');
    const [resources, setResources] = useState<GoalResource[]>([]); const [resourcesError, setResourcesError] = useState<unknown>(null);
    const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
    const actionRequest = useRef(''); const createRequest = useRef(crypto.randomUUID());
    const fieldsDirty = JSON.stringify(form) !== JSON.stringify(initial);
    const actionDraft = Boolean(action.title || action.detail || action.date);
    // F06: every field the student typed counts, not only the goal form. Only one
    // pending draft (goal form, action, link selection or parent choice) at a time:
    // the others stay disabled so a mutation never silently discards a sibling draft.
    const dirty = fieldsDirty || actionDraft || Boolean(selection || parentChoice);
    // Once an action/selection/parent draft exists, the goal form itself locks too:
    // otherwise editing and saving it would remount the body and silently drop that draft.
    const otherDraft = actionDraft || Boolean(selection) || Boolean(parentChoice);
    useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
    useDraftGuard(dirty, l('discard'));
    const loadResources = useCallback(() => { void goalApi<GoalResource[]>('/user/goal-resources').then(rows => { setResources(rows); setResourcesError(null); }).catch(setResourcesError); }, []);
    useEffect(() => { if (goal) loadResources(); }, [goal, loadResources]);

    const byId = (id: number) => goals.find(row => row.id === id);
    const groupName = (id: number) => groups.find(group => group.id === id)?.name ?? `#${id}`;
    const confirmVisibility = (after: PersonalGoal[], ids: number[]) => {
        const { gained, lost } = visibilityDelta(goals, after, ids);
        if (!gained.length && !lost.length) return true;
        return window.confirm([gained.length ? `${l('visibilityGain')} ${gained.map(groupName).join(', ')}` : '', lost.length ? `${l('visibilityLoss')} ${lost.map(groupName).join(', ')}` : '', l('visibilityConfirm')].filter(Boolean).join('\n'));
    };
    const run = async (work: () => Promise<PersonalGoal>, done: (row: PersonalGoal) => void = onSaved) => {
        setBusy(true); setError(null);
        try { done(await work()); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const patched = (patch: Partial<PersonalGoal>) => goals.map(row => row.id === goal!.id ? { ...row, ...patch } : row);
    const base = goal ? `/user/goals/${goal.id}` : '';

    const submit = () => {
        if (!goal) {
            // A new sub-goal inherits any effective share of its chosen parent: announce and
            // confirm exactly like an existing goal's visibility change (same helper, same wording).
            if (parentId) {
                const draft: PersonalGoal = { ...blankGoal, ...form, method: [], id: -1, catalog_id: null, catalog_snapshot: {}, links: [], parent_ids: [parentId], origin: null, reviews: [], checks: [] };
                if (!confirmVisibility([...goals, draft], [draft.id])) return;
            }
            return void run(() => goalApi<PersonalGoal>('/user/goals', 'POST', { ...form, parent_id: parentId ?? null, catalog_id: source?.id ?? null, catalog_version: source?.version ?? null, request_id: createRequest.current }), onCreated);
        }
        if (!confirmVisibility(patched({ shared_group_id: form.shared_group_id }), [goal.id])) return;
        void run(() => goalApi<PersonalGoal>(base, 'PUT', form));
    };
    const attach = () => {
        const id = Number(parentChoice); if (!goal || !id) return;
        if (!confirmVisibility(patched({ parent_ids: [...goal.parent_ids, id] }), [goal.id])) return;
        // A cycle (422) is not a saving failure: show only the dedicated message, never the generic error box.
        void run(async () => { try { return await goalApi<PersonalGoal>(`${base}/parents`, 'POST', { parent_id: id, revision: goal.revision }); } catch (e) { if (e instanceof GoalError && e.status === 422) { window.alert(l('cycle')); return goal; } throw e; } });
    };
    const detach = (id: number) => {
        if (!goal || !confirmVisibility(patched({ parent_ids: goal.parent_ids.filter(p => p !== id) }), [goal.id])) return;
        void run(() => goalApi<PersonalGoal>(`${base}/parents/${id}?revision=${goal.revision}`, 'DELETE'));
    };
    const remove = async () => {
        if (!goal) return;
        const children = goals.filter(row => row.parent_ids.includes(goal.id));
        const after = goals.filter(row => row.id !== goal.id).map(row => ({ ...row, parent_ids: row.parent_ids.filter(p => p !== goal.id) }));
        const { lost } = visibilityDelta(goals, after, children.map(row => row.id));
        const message = [goalFormat(lang, 'deleteNamed', { title: goal.title }), children.length ? goalFormat(lang, 'deleteKeepsChildren', { n: children.length }) : '', lost.length ? `${l('visibilityLoss')} ${lost.map(groupName).join(', ')}` : ''].filter(Boolean).join('\n');
        if (!window.confirm(message)) return;
        setBusy(true);
        try { await goalApi(`${base}?revision=${goal.revision}`, 'DELETE'); onDirty(false); onDeleted(); } catch (e) { setError(e); } finally { setBusy(false); }
    };

    const parents = goal ? goal.parent_ids.map(byId).filter((row): row is PersonalGoal => Boolean(row)) : parentId && byId(parentId) ? [byId(parentId)!] : [];
    const children = goal ? goals.filter(row => row.parent_ids.includes(goal.id)).sort(compareGoals) : [];
    const blocked = goal ? new Set([goal.id, ...descendants(goals, goal.id), ...goal.parent_ids]) : new Set<number>();
    const candidates = goal ? goals.filter(row => !blocked.has(row.id)).sort(compareGoals) : [];
    const inherited = goal ? [...effectiveShares(goals, goal.id)].filter(([, from]) => from.id !== goal.id) : parentId ? [...effectiveShares(goals, parentId)] : [];
    const { done, total } = goal ? progress(goals, goal.id) : { done: 0, total: 0 };
    const available = goal ? resources.filter(r => !goal.links.some(link => link.kind === r.kind && link.target_id === r.target_id)) : [];
    const goalRow = (row: PersonalGoal, icon: React.ReactNode, extra?: React.ReactNode) => <li key={row.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2">
        {icon}<button type="button" className="min-h-11 min-w-0 flex-1 break-words text-left text-indigo-700 underline" onClick={() => onNavigate({ kind: 'edit', id: row.id })}>{row.title}</button>
        {row.status !== 'active' && <span className="text-xs text-slate-500">{l(row.status as GoalTextKey)}</span>}{extra}
    </li>;

    return <>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:px-6">
            {saved && <p role="status" className="text-indigo-700">{l('saved')}</p>}
            <GoalIssue error={error} lang={lang} retry={onReload} />
            {parents.length > 0 && <section className="space-y-2"><h3 className="font-bold">{l('servesTo')}</h3>
                <ul className="space-y-1">{parents.map(row => goalRow(row, <ArrowUp className="h-4 w-4 shrink-0" aria-hidden />, goal && <Button type="button" variant="ghost" disabled={busy || dirty} aria-label={`${l('detach')} ${row.title}`} onClick={() => detach(row.id)}><X className="h-4 w-4" aria-hidden /></Button>))}</ul>
            </section>}
            {goal && candidates.length > 0 && <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('addParent')}><select className={input} disabled={busy || fieldsDirty || actionDraft || Boolean(selection)} value={parentChoice} onChange={e => setParentChoice(e.target.value)}><option value="">—</option>{candidates.map(row => <option key={row.id} value={row.id}>{row.title.slice(0, 120)}</option>)}</select></Field></div><Button type="button" variant="secondary" disabled={!parentChoice || busy || fieldsDirty || actionDraft || Boolean(selection)} onClick={attach}>{l('attach')}</Button></div>}
            {!goal && parentId && <p className="text-sm text-slate-600">{l('howPrompt')}</p>}
            {goal?.catalog_snapshot.data && <details className="rounded-md bg-slate-50 p-3 text-sm"><summary className="cursor-pointer py-1 font-semibold">{l('source')} · {l('version')} {goal.catalog_snapshot.version}</summary><p className="mt-2">{goal.catalog_snapshot.data.description}</p><p className="mt-2 whitespace-pre-wrap"><strong>{l('suggestions')}: </strong>{goal.catalog_snapshot.data.suggestions}</p></details>}
            <form id="goal-dialog-form" onSubmit={e => { e.preventDefault(); submit(); }}><fieldset disabled={busy || (Boolean(goal) && otherDraft)} className="space-y-4">
                <GoalForm form={form} setForm={setForm} groups={groups} />
                {inherited.map(([group, from]) => <p key={group} className="text-sm text-slate-600">ℹ {goalFormat(lang, 'inheritedShare', { group: groupName(group), goal: from.title })}</p>)}
                {goal && <p className="text-sm text-slate-600">{l('doneHelp')}</p>}
            </fieldset></form>
            {goal && dirty && <p role="status" className="text-sm text-slate-600">{l('unsaved')}</p>}
            {goal && <section className="space-y-2"><h3 className="font-bold">{l('reachedBy')}{total > 0 && <span className="ml-2 text-sm font-normal text-slate-600">{done}/{total} {l('subgoalsDone')}</span>}</h3>
                <ul className="space-y-1">{children.map(row => goalRow(row, <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />))}</ul>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => onNavigate({ kind: 'create', parentId: goal.id })}><Plus className="h-4 w-4" aria-hidden />{l('addSubgoal')}</Button>
            </section>}
            {goal && <details open={goal.links.length > 0} className="rounded-md border border-slate-200 p-3"><summary className="cursor-pointer py-2 font-semibold">{l('links')} · {goal.links.length}</summary>
                <div className="mt-3 space-y-3">
                    {goal.links.map(link => <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-3">
                        <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{resourceLabel(lang, link.kind)}{link.stage && ` · ${link.stage === 'done' ? l('completed') : link.stage === 'doing' ? l('active') : l('next')}`}{link.date && ` · ${link.date}`}</p>{link.available && link.href ? <Link className="break-words font-medium text-indigo-700 underline" href={link.href}>{link.title}</Link> : <span>{l('unavailable')}</span>}</div>
                        <Button type="button" variant="ghost" disabled={busy || dirty} onClick={() => void run(() => goalApi<PersonalGoal>(`${base}/links/${link.id}?revision=${goal.revision}`, 'DELETE'))}>{l('unlink')}</Button>
                    </div>)}
                    <GoalIssue error={resourcesError} lang={lang} retry={loadResources} />
                    <form onSubmit={e => { e.preventDefault(); const resource = available.find(r => `${r.kind}:${r.target_id}` === selection); if (resource) void run(() => goalApi<PersonalGoal>(`${base}/links`, 'POST', { kind: resource.kind, target_id: resource.target_id, revision: goal.revision })); }}>
                        <fieldset disabled={busy || fieldsDirty || actionDraft || Boolean(parentChoice)} className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('pickResource')}><select required className={input} value={selection} onChange={e => setSelection(e.target.value)}><option value="">—</option>{available.map(r => <option key={`${r.kind}:${r.target_id}`} value={`${r.kind}:${r.target_id}`}>{resourceLabel(lang, r.kind)} · {r.title.slice(0, 120)}</option>)}</select></Field></div><Button type="submit" disabled={!selection}>{l('link')}</Button></fieldset>
                    </form>
                </div>
            </details>}
            {goal && <details className="rounded-md border border-slate-200 p-3"><summary className="cursor-pointer py-2 font-semibold">{l('createAction')}</summary>
                <form className="mt-3" onSubmit={e => { e.preventDefault(); actionRequest.current ||= crypto.randomUUID(); void run(() => goalApi<PersonalGoal>(`${base}/actions`, 'POST', { ...action, date: action.date || null, revision: goal.revision, request_id: actionRequest.current })); }}><fieldset disabled={busy || fieldsDirty || Boolean(selection) || Boolean(parentChoice)} className="space-y-3">
                    <p className="text-sm text-slate-600">{l('actionHelp')}</p>
                    <Field label={l('actionTitle')}><input className={input} required maxLength={160} value={action.title} onChange={e => setAction({ ...action, title: e.target.value })} /></Field>
                    <Field label={l('detail')}><textarea className={input} maxLength={1000} value={action.detail} onChange={e => setAction({ ...action, detail: e.target.value })} /></Field>
                    <Field label={l('date')}><input className={input} type="date" value={action.date} onChange={e => setAction({ ...action, date: e.target.value })} /></Field>
                    <Button type="submit">{l('createAction')}</Button>
                </fieldset></form>
            </details>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-4 sm:px-6">
            {goal && <Button type="button" variant="ghost" disabled={busy || dirty} onClick={() => void remove()}>{l('delete')}</Button>}
            <div className="ml-auto flex gap-2"><Button type="button" variant="secondary" onClick={onRequestClose}>{l('cancel')}</Button><Button type="submit" form="goal-dialog-form" disabled={busy || (goal ? !fieldsDirty || otherDraft : !form.title.trim())}>{l('save')}</Button></div>
        </div>
    </>;
}
