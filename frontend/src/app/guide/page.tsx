'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Search, X } from 'lucide-react';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { usePersonalAIFeatures } from '@/lib/use-personal-ai-features';
import { guideTaskCopy } from '@/lib/i18n-guide-tasks';
import { guideUIText, type GuideUIKey } from '@/lib/i18n-guide-ui';
import { GUIDE_GROUPS, GUIDE_TASKS, guideTaskHref, legacyGuideTask, searchGuideTasks, visibleGuideTasks, type GuideAudience, type GuideGroup } from '@/lib/guide-tasks';
import { GuideFigure } from '@/components/guide/GuideFigure';

const subscribeHash = (callback: () => void) => {
    window.addEventListener('hashchange', callback);
    window.addEventListener('popstate', callback);
    return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
};
const readHash = () => window.location.hash;
const serverHash = () => '';
export default function GuidePage() {
    const {lang} = useI18n();
    return <Suspense fallback={<p role="status">{guideUIText(lang, 'loading')}</p>}><GuideContent /></Suspense>;
}

function GuideContent() {
    const { lang } = useI18n();
    const l = (key: GuideUIKey) => guideUIText(lang, key);
    const params = useSearchParams();
    const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
    const [identity, setIdentity] = useState<Identity | null>(null);
    const query = params.get('q') || '';
    const features = usePersonalAIFeatures();
    const articleTitle = useRef<HTMLHeadingElement>(null);
    const articleRegion = useRef<HTMLDivElement>(null);
    const teacher = canUseTeacherAssistant(identity);
    const admin = identity?.is_admin === true;
    const requestedAudience = params.get('audience');
    const baseAudience: GuideAudience = requestedAudience === 'admin' && admin ? 'admin'
        : requestedAudience === 'teacher' ? 'teacher'
        : requestedAudience === 'student' ? 'student' : teacher ? 'teacher' : 'student';
    const legacy = params.get('task') ? null : legacyGuideTask(hash);
    const legacyTask = GUIDE_TASKS.find(item => item.id === legacy);
    const legacyAudience = legacyTask?.audience.includes(baseAudience) ? baseAudience : legacyTask?.audience[0];
    const audience = legacyAudience && (legacyAudience !== 'admin' || admin) ? legacyAudience : baseAudience;
    const tasks = useMemo(() => visibleGuideTasks(audience, features), [audience, features]);
    const requestedTask = params.get('task') || legacy;
    const task = query ? undefined : tasks.find(item => item.id === requestedTask);
    const group = GUIDE_GROUPS.find(value => value === params.get('group'));
    const result = searchGuideTasks(group && !query ? tasks.filter(item => item.group === group) : tasks, query, lang);
    const homeHref = `/guide?audience=${audience}`;
    const copy = task ? guideTaskCopy(lang, task.id) : null;
    const related = tasks.filter(item => task?.related?.includes(item.id));
    const changeQuery = (value: string) => {
        const next = new URLSearchParams(params.toString());
        next.set('audience', audience);
        if (value) next.set('q', value); else next.delete('q');
        window.history.replaceState(null, '', `/guide?${next}${hash}`);
    };
    const groupLabel = (value: GuideGroup) => l(audience === 'teacher' && ['plans', 'chat', 'study', 'tools'].includes(value)
        ? `teacher${value[0].toUpperCase()}${value.slice(1)}` as GuideUIKey : value);
    useEffect(() => {
        let active = true;
        void getIdentity().then(value => { if (active) setIdentity(value); }).catch(() => {});
        return () => { active = false; };
    }, []);
    useEffect(() => {
        if (!legacy || !legacyAudience || (legacyAudience === 'admin' && !admin)) return;
        const next = new URLSearchParams(params.toString());
        next.set('audience', legacyAudience); next.set('task', legacy);
        window.history.replaceState(null, '', `/guide?${next}`);
    }, [legacy, legacyAudience, admin, params]);
    useEffect(() => {
        if (!task) return;
        articleTitle.current?.focus({preventScroll: true});
        articleRegion.current?.scrollIntoView({block: 'start'});
    }, [task]);
    const actionLink = (item: typeof GUIDE_TASKS[number]) => <Link href={guideTaskHref(item.id, audience)} scroll={false}
        className="flex min-h-[44px] items-center justify-between gap-3 rounded-md py-2 font-medium text-indigo-700 hover:underline">
        <span>{guideTaskCopy(lang, item.id).title}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>;
    return <div className="page-wide space-y-5" data-testid="guide">
        <header className="flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="text-2xl font-bold text-slate-900">{l('title')}</h1><p className="mt-1 text-sm text-slate-600">{l('intro')}</p></div>
            {teacher && <nav aria-label={l('audience')} className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
                {(['student', 'teacher', ...(admin ? ['admin'] : [])] as GuideAudience[]).map(value => <Link key={value}
                    href={`/guide?audience=${value}`} scroll={false}
                    aria-current={audience === value ? 'page' : undefined}
                    className={`inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-semibold ${audience === value ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>{l(value)}</Link>)}
            </nav>}
        </header>
        <div role="search" className="relative max-w-2xl">
            <label htmlFor="guide-search" className="mb-1.5 block text-sm font-semibold text-slate-800">{l('search')}</label>
            <Search className="pointer-events-none absolute bottom-3.5 left-3 h-5 w-5 text-slate-500" aria-hidden="true" />
            <input id="guide-search" type="search" value={query} onChange={event => changeQuery(event.target.value)}
                placeholder={l('searchHint')} aria-controls="guide-content" autoComplete="off"
                className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white py-3 pr-12 pl-10 text-base text-slate-900" />
            {query && <button aria-label={l('clear')} onClick={() => changeQuery('')}
                className="absolute right-0 bottom-0 flex h-[48px] w-[44px] items-center justify-center text-slate-600"><X className="h-5 w-5" aria-hidden="true" /></button>}
        </div>
        <div id="guide-content">
            {task && copy ? <div ref={articleRegion} className="mx-auto max-w-4xl scroll-mt-24 space-y-4">
                <Link href={homeHref} scroll={false} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-indigo-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{l('back')}</Link>
                <article id={`guide-task-${task.id}`} className="glass-panel space-y-5 p-4 sm:p-6" aria-labelledby="guide-task-title">
                    <div><p className="mb-1 text-xs font-semibold text-indigo-700">{groupLabel(task.group)}</p>
                        <h2 id="guide-task-title" ref={articleTitle} tabIndex={-1} className="scroll-mt-24 text-xl font-bold text-slate-900">{copy.title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.intro}</p></div>
                    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]"><div className="space-y-4">
                    <ol className="space-y-3" data-testid="guide-steps">{copy.steps.map((step, index) => <li key={index} className="flex gap-3 text-sm leading-relaxed text-slate-800">
                        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-mono font-semibold text-indigo-700">{index + 1}</span><span className="pt-0.5">{step}</span>
                    </li>)}</ol>
                    <Link href={task.feature && audience !== 'student' ? task.href.replace('/profilo/', '/docente/') : task.href}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{l('open')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    {task.important ? <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                        <p className="mb-1 font-semibold">{l('important')}</p>{copy.note}</aside>
                        : <details className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><summary className="cursor-pointer py-1 font-semibold">{l('note')}</summary><p className="pt-2 leading-relaxed">{copy.note}</p></details>}
                    </div><GuideFigure key={task.id} task={task} title={copy.title} /></div>
                </article>
                {related.length > 0 && <nav aria-label={l('related')} className="glass-panel p-4">
                    <h2 className="text-sm font-semibold text-slate-800">{l('related')}</h2>
                    {related.map(item => <div key={item.id}>{actionLink(item)}</div>)}
                </nav>}
            </div> : requestedTask && !query ? <div className="glass-panel space-y-3 p-5"><p role="status" className="text-sm text-slate-700">{l('unavailable')}</p><Link href={homeHref} className="inline-flex min-h-[44px] items-center text-indigo-700 underline">{l('back')}</Link></div>
                : query || group ? <section className="max-w-3xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">{query ? l('results') : groupLabel(group!)}</h2>
                        <Link href={homeHref} scroll={false} className="inline-flex min-h-[44px] items-center text-sm text-indigo-700 underline">{l('back')}</Link></div>
                    <p role="status" aria-live="polite" className="text-sm text-slate-600">{result.length ? `${l('results')}: ${result.length}` : l('empty')}</p>
                    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">{result.map(item => <li key={item.id}>{actionLink(item)}</li>)}</ul>
                </section> : <nav aria-label={l('all')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {GUIDE_GROUPS.map(value => ({value, items: tasks.filter(item => item.group === value)})).filter(({items}) => items.length).map(({value, items}) => <section key={value} className="glass-panel flex flex-col p-4">
                        <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />{groupLabel(value)}</h2>
                        {items.slice(0, 2).map(item => <div key={item.id}>{actionLink(item)}</div>)}
                        {items.length > 2 && <Link href={`${homeHref}&group=${value}`} scroll={false} className="mt-auto inline-flex min-h-[44px] items-center pt-2 text-sm text-slate-600 underline">{l('all')} ({items.length})</Link>}
                    </section>)}
                </nav>}
        </div>
    </div>;
}
