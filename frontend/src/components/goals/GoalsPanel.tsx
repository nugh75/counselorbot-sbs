'use client';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { List, Network, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { goalApi, type CatalogEntry, type GoalGroup, type PersonalGoal } from '@/lib/goals';
import { buildForest, visibleGoals } from '@/lib/goal-network';
import { GoalCatalogDialog } from './GoalCatalogDialog';
import { GoalDialog, type DialogTarget } from './GoalDialog';
import { GoalMap } from './GoalMap';
import { GoalTree } from './GoalTree';
import { GoalIssue } from './GoalUI';

const VIEW_KEY = 'cb_goals_view';
const readView = (): 'list' | 'map' => { try { return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'list'; } catch { return 'list'; } };
// A reload must not reopen a closed (or since-deleted) goal: drop `?goal=` once the dialog is
// done with it, keeping Next's own history state object intact. Same for `?new=1`, which opens
// the creation dialog from the timeline bar.
const stripParam = (name: string) => {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(name)) return;
        url.searchParams.delete(name);
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* best effort only */ }
};
const stripGoalParam = () => stripParam('goal');

export function GoalsPanel() {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [goals, setGoals] = useState<PersonalGoal[]>([]); const [catalog, setCatalog] = useState<CatalogEntry[]>([]); const [groups, setGroups] = useState<GoalGroup[]>([]);
    const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null);
    const [target, setTarget] = useState<DialogTarget | null>(null); const [catalogOpen, setCatalogOpen] = useState(false);
    const [saved, setSaved] = useState(false); const [showClosed, setShowClosed] = useState(false); const [view, setView] = useState<'list' | 'map'>('list');
    useEffect(() => { setView(readView()); }, []);
    const chooseView = (next: 'list' | 'map') => { setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* per-viewer convenience only */ } };
    const load = useCallback(async (): Promise<PersonalGoal[]> => {
        setLoading(true); setError(null);
        try {
            const [rows, entries, memberships] = await Promise.all([goalApi<PersonalGoal[]>('/user/goals'), goalApi<CatalogEntry[]>('/user/goal-catalog'), goalApi<GoalGroup[]>('/user/goal-groups')]);
            setGoals(rows); setCatalog(entries); setGroups(memberships);
            return rows;
        } catch (e) { setError(e); return []; } finally { setLoading(false); }
    }, []);
    useEffect(() => {
        void load().then(rows => {
            const search = new URLSearchParams(window.location.search);
            if (search.get('new') === '1') { setSaved(false); setTarget({ kind: 'create' }); stripParam('new'); return; }
            const requested = Number(search.get('goal'));
            if (!requested) return;
            if (rows.some(row => row.id === requested)) setTarget({ kind: 'edit', id: requested });
            else stripGoalParam();
        });
    }, [load]);
    const open = (next: DialogTarget) => { setSaved(false); setTarget(next); };
    const closeDialog = useCallback(() => { setTarget(null); stripGoalParam(); }, []);
    const openGoal = useCallback((id: number) => { setSaved(false); setTarget({ kind: 'edit', id }); }, []);
    const forest = useMemo(() => buildForest(goals, showClosed), [goals, showClosed]);
    const shown = useMemo(() => visibleGoals(goals, showClosed), [goals, showClosed]);
    const viewButton = (value: 'list' | 'map', icon: ReactNode, key: GoalTextKey) => <Button type="button" variant={view === value ? 'primary' : 'secondary'} aria-pressed={view === value} onClick={() => chooseView(value)}>{icon}{l(key)}</Button>;
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => open({ kind: 'create' })}><Plus className="h-4 w-4" aria-hidden />{l('custom')}</Button>
            <Button type="button" variant="secondary" onClick={() => setCatalogOpen(true)}>{l('choose')}</Button>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />{l('showClosed')}</label>
            <div className="ml-auto hidden gap-2 lg:flex">{viewButton('list', <List className="h-4 w-4" aria-hidden />, 'viewList')}{viewButton('map', <Network className="h-4 w-4" aria-hidden />, 'viewMap')}</div>
        </div>
        <GoalIssue error={error} lang={lang} retry={() => void load()} />
        {loading ? <p role="status">{l('loading')}</p> : <>
            {!goals.length && !error && <p className="py-3">{l('empty')}</p>}
            <div className={view === 'map' ? 'lg:hidden' : ''}><GoalTree goals={goals} forest={forest} groups={groups} onOpen={openGoal} onAddChild={id => open({ kind: 'create', parentId: id })} /></div>
            {view === 'map' && goals.length > 0 && <GoalMap goals={shown} all={goals} onOpen={openGoal} />}
            <Link className="block py-3 text-sm text-indigo-700 underline" href="/bussola">{l('unsure')}</Link>
        </>}
        {catalogOpen && <GoalCatalogDialog catalog={catalog} onClose={() => setCatalogOpen(false)} onPick={entry => { setCatalogOpen(false); open({ kind: 'create', source: entry }); }} />}
        {target && <GoalDialog target={target} goals={goals} groups={groups} saved={saved}
            onTarget={next => open(next)} onClose={closeDialog} onReload={() => void load()}
            onSaved={row => { setGoals(previous => previous.map(goal => goal.id === row.id ? row : goal)); setSaved(true); }}
            onCreated={row => { setGoals(previous => [row, ...previous]); setSaved(true); setTarget({ kind: 'edit', id: row.id }); }}
            onDeleted={() => { closeDialog(); void load(); }} />}
    </div>;
}
