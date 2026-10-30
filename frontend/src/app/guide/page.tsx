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
import { Card } from '@/components/ui/Card';

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
        className="flex min-h-control items-center justify-between gap-4 rounded-control py-2 text-link hover:underline">
        <span>{guideTaskCopy(lang, item.id).title}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>;
    return <div className="page-wide space-y-6" data-testid="guide">
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-2xl font-semibold text-ink">{l('title')}</h1><p className="mt-1 text-sm text-ink-muted">{l('intro')}</p></div>
            {teacher && <nav aria-label={l('audience')} className="flex flex-wrap gap-1 rounded-control border border-line bg-surface p-1">
                {(['student', 'teacher', ...(admin ? ['admin'] : [])] as GuideAudience[]).map(value => <Link key={value}
                    href={`/guide?audience=${value}`} scroll={false}
                    aria-current={audience === value ? 'page' : undefined}
                    className={`inline-flex min-h-control items-center rounded-control px-4 text-sm font-semibold ${audience === value ? 'bg-brand text-ink-on-brand' : 'text-ink-body hover:bg-surface-sunken'}`}>{l(value)}</Link>)}
            </nav>}
        </header>
        <div role="search" className="relative max-w-2xl">
            <label htmlFor="guide-search" className="mb-2 block text-sm font-semibold text-ink">{l('search')}</label>
            <Search className="pointer-events-none absolute bottom-4 left-4 h-5 w-5 text-ink-muted" aria-hidden="true" />
            <input id="guide-search" type="search" value={query} onChange={event => changeQuery(event.target.value)}
                placeholder={l('searchHint')} aria-controls="guide-content" autoComplete="off"
                className="min-h-[48px] w-full rounded-control border border-line-strong bg-surface py-2 pr-12 pl-10 text-base text-ink" />
            {query && <button aria-label={l('clear')} onClick={() => changeQuery('')}
                className="absolute right-0 bottom-0 flex h-[48px] w-control items-center justify-center text-ink-muted"><X className="h-5 w-5" aria-hidden="true" /></button>}
        </div>
        <div id="guide-content">
            {task && copy ? <div ref={articleRegion} className="mx-auto max-w-4xl scroll-mt-24 space-y-4">
                <Link href={homeHref} scroll={false} className="inline-flex min-h-control items-center gap-2 text-sm font-semibold text-link"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{l('back')}</Link>
                <article id={`guide-task-${task.id}`} className="rounded-card border border-line bg-surface shadow-card space-y-6 p-4 sm:p-6" aria-labelledby="guide-task-title">
                    <div><p className="mb-1 text-xs font-semibold text-link">{groupLabel(task.group)}</p>
                        <h2 id="guide-task-title" ref={articleTitle} tabIndex={-1} className="scroll-mt-24 text-xl font-semibold text-ink">{copy.title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{copy.intro}</p></div>
                    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]"><div className="space-y-4">
                    <ol className="space-y-4" data-testid="guide-steps">{copy.steps.map((step, index) => <li key={index} className="flex gap-4 text-sm leading-relaxed text-ink">
                        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono font-semibold text-link">{index + 1}</span><span className="pt-1">{step}</span>
                    </li>)}</ol>
                    <Link href={task.feature && audience !== 'student' ? task.href.replace('/profilo/', '/docente/') : task.href}
                        className="inline-flex min-h-control items-center gap-2 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover">{l('open')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    {task.important ? <aside className="rounded-control border border-line bg-surface-sunken p-4 text-sm leading-relaxed text-ink-body">
                        <p className="mb-1 font-semibold">{l('important')}</p>{copy.note}</aside>
                        : <details className="rounded-control border border-line p-4 text-sm text-ink-body"><summary className="cursor-pointer py-1 font-semibold">{l('note')}</summary><p className="pt-2 leading-relaxed">{copy.note}</p></details>}
                    </div><GuideFigure key={task.id} task={task} title={copy.title} /></div>
                </article>
                {related.length > 0 && <nav aria-label={l('related')} className="rounded-card border border-line bg-surface shadow-card p-4">
                    <h2 className="text-sm font-semibold text-ink">{l('related')}</h2>
                    {related.map(item => <div key={item.id}>{actionLink(item)}</div>)}
                </nav>}
            </div> : requestedTask && !query ? <Card className="space-y-4 p-6"><p role="status" className="text-sm text-ink-body">{l('unavailable')}</p><Link href={homeHref} className="inline-flex min-h-control items-center text-link underline">{l('back')}</Link></Card>
                : query || group ? <section className="max-w-3xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-ink">{query ? l('results') : groupLabel(group!)}</h2>
                        <Link href={homeHref} scroll={false} className="inline-flex min-h-control items-center text-sm text-link underline">{l('back')}</Link></div>
                    <p role="status" aria-live="polite" className="text-sm text-ink-muted">{result.length ? `${l('results')}: ${result.length}` : l('empty')}</p>
                    <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4">{result.map(item => <li key={item.id}>{actionLink(item)}</li>)}</ul>
                </section> : <nav aria-label={l('all')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {GUIDE_GROUPS.map(value => ({value, items: tasks.filter(item => item.group === value)})).filter(({items}) => items.length).map(({value, items}) => <section key={value} className="rounded-card border border-line bg-surface shadow-card flex flex-col p-4">
                        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-ink"><BookOpen className="h-4 w-4 text-link" aria-hidden="true" />{groupLabel(value)}</h2>
                        {items.slice(0, 2).map(item => <div key={item.id}>{actionLink(item)}</div>)}
                        {items.length > 2 && <Link href={`${homeHref}&group=${value}`} scroll={false} className="mt-auto inline-flex min-h-control items-center pt-2 text-sm text-ink-muted underline">{l('all')} ({items.length})</Link>}
                    </section>)}
                </nav>}
        </div>
    </div>;
}
