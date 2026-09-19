'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { goalText } from '@/lib/i18n-goals';
import { goalApi, type PersonalGoal, type ResourceKind } from '@/lib/goals';
import { GoalIssue } from './GoalUI';

export function JourneyOverview({ kind }: { kind?: ResourceKind }) {
    const { lang } = useI18n(); const [goals, setGoals] = useState<PersonalGoal[]>([]); const [error, setError] = useState<unknown>(null); const [loaded, setLoaded] = useState(false);
    const load = useCallback(() => { void goalApi<PersonalGoal[]>('/user/goals').then(rows => { setGoals(rows); setError(null); setLoaded(true); }).catch(setError); }, []);
    useEffect(load, [load]);
    const active = goals.filter(g => kind ? g.links.some(link => link.kind === kind) : g.status === 'active');
    const next = [...new Map(active.flatMap(g => g.links.filter(link => link.kind === 'action' && link.available && link.stage !== 'done').map(link => [link.target_id, { ...link, goal: g } ] as const))).values()].slice(0, 3);
    return <section className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-5" aria-label={goalText(lang, kind ? 'related' : 'journey')}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">{goalText(lang, kind ? 'related' : 'journey')}</h2><Link className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white" href="/profilo/obiettivi">{goalText(lang, kind ? 'manage' : 'goals')}</Link></div>
        <GoalIssue error={error} lang={lang} retry={load} />
        {active.length > 0 ? <div className="flex flex-wrap gap-2">{active.slice(0, 6).map(g => <Link key={g.id} className="min-h-11 max-w-full break-words rounded-md border border-indigo-200 bg-white p-3 text-indigo-700" href={`/profilo/obiettivi?goal=${g.id}`}>{g.title}{!kind && g.review_date && <span className="mt-1 block text-xs text-slate-600">{goalText(lang, 'reviewDate')}: {g.review_date}</span>}</Link>)}</div> : loaded && !kind && <p className="text-sm text-slate-600">{goalText(lang, 'empty')}</p>}
        {!kind && next.length > 0 && <div><h3 className="mb-2 text-sm font-bold">{goalText(lang, 'next')}</h3><ul className="space-y-2">{next.map(action => <li key={action.target_id} className="text-sm"><Link className="text-indigo-700 underline" href={`/profilo/obiettivi?goal=${action.goal.id}`}>{action.title}</Link><span className="text-slate-600"> · {action.goal.title}</span></li>)}</ul></div>}
        {!kind && <Link className="inline-block py-1 text-sm text-indigo-700 underline" href="/bussola">{goalText(lang, 'unsure')}</Link>}
    </section>;
}
