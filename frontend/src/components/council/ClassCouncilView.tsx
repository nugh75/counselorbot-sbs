'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Lock, Printer } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classCouncilText, type ClassCouncilTextKey } from '@/lib/i18n-class-council';
import { councilErrorKey, matchesStudent, submissionText, type CouncilOverview, type CouncilStudent } from '@/lib/class-council';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const STATE_KEYS: Record<string, ClassCouncilTextKey> = { done: 'done', not_done: 'not_done', locked: 'stateLocked' };

function Section({ title, empty, children, count }: { title: string; empty: string; children: React.ReactNode; count: number }) {
    return <section className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        {count === 0 ? <p className="text-sm text-slate-500">{empty}</p> : children}
    </section>;
}

function StudentSheet({ student, lang }: { student: CouncilStudent; lang: string }) {
    const l = (key: ClassCouncilTextKey) => classCouncilText(lang, key);
    const date = (value: string | null) => value ? new Date(value).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return <div className="space-y-6">
        <Section title={l('plans')} empty={l('nothing')} count={student.plans.length}>
            <div className="space-y-3">{student.plans.map(plan => <div key={plan.path_id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{plan.title}</p>
                    <p className="text-sm text-slate-600">{plan.done}/{plan.total} {l('stepsDone')}</p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100" aria-hidden>
                    <div className="h-2 rounded-full bg-teal-600" style={{ width: `${plan.total ? Math.round(plan.done / plan.total * 100) : 0}%` }} />
                </div>
                <ul className="mt-3 space-y-1 text-sm">{plan.steps.map((step, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-700">{step.title}{step.due_date && <span className="text-slate-500"> · {l('due')} {date(step.due_date)}</span>}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${step.state === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{l(STATE_KEYS[step.state] ?? 'not_done')}</span>
                </li>)}</ul>
            </div>)}</div>
        </Section>
        <Section title={l('results')} empty={l('nothing')} count={student.results.length}>
            <div className="space-y-3">{student.results.map((result, index) => <div key={index} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-800">{result.questionnaire_type} <span className="font-normal text-slate-500">· {date(result.submitted_at)}</span></p>
                {result.scores && Object.keys(result.scores).length > 0 && <dl className="mt-2 flex flex-wrap gap-2 text-xs">
                    {Object.entries(result.scores).filter(([, value]) => typeof value === 'number' || typeof value === 'string').map(([code, value]) =>
                        <div key={code} className="rounded-md bg-slate-50 px-2 py-1"><dt className="inline font-semibold text-slate-700">{code}</dt> <dd className="inline text-slate-600">{String(value)}</dd></div>)}
                </dl>}
                {result.summary && <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-medium text-indigo-700">{l('summary')}</summary>
                    <p className="mt-2 whitespace-pre-line text-slate-700">{result.summary}</p>
                </details>}
            </div>)}</div>
        </Section>
        <Section title={l('assignments')} empty={l('nothing')} count={student.assignments.length}>
            <div className="space-y-3">{student.assignments.map((item, index) => <div key={index} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-800">{item.title}{item.due_date && <span className="font-normal text-slate-500"> · {l('due')} {date(item.due_date)}</span>}</p>
                {item.submission ? <>
                    <p className="mt-2 text-xs font-semibold text-slate-500">{l('submitted')} · {date(item.submitted_at)}</p>
                    <p className="whitespace-pre-line text-slate-700">{submissionText(item.submission)}</p>
                </> : <p className="mt-1 text-slate-500">{l('notSubmitted')}</p>}
                {item.feedback && <><p className="mt-2 text-xs font-semibold text-slate-500">{l('feedback')}</p><p className="whitespace-pre-line text-slate-700">{item.feedback}</p></>}
            </div>)}</div>
        </Section>
        <Section title={l('goals')} empty={l('nothing')} count={student.goals.length}>
            <div className="space-y-3">{student.goals.map((goal, index) => <div key={index} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-800">{goal.title}</p>
                {goal.criteria && <p className="mt-1 text-slate-700"><span className="font-medium">{l('criteria')}:</span> {goal.criteria}</p>}
                {goal.reflection && <p className="mt-1 text-slate-700"><span className="font-medium">{l('reflection')}:</span> {goal.reflection}</p>}
            </div>)}</div>
        </Section>
    </div>;
}

export function ClassCouncilView({ token }: { token: string }) {
    const { lang } = useI18n();
    const l = (key: ClassCouncilTextKey) => classCouncilText(lang, key);
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ClassCouncilTextKey | ''>('');
    const [overview, setOverview] = useState<CouncilOverview | null>(null);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    const students = useMemo(() => overview?.students.filter(s => matchesStudent(s, query)) ?? [], [overview, query]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!password) return;
        setBusy(true); setError('');
        try {
            const res = await apiFetch(`/api/council/${encodeURIComponent(token)}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
            });
            if (!res.ok) { setError(councilErrorKey(res.status)); return; }
            setOverview(await res.json() as CouncilOverview);
            setPassword('');
        } catch {
            setError('networkError');
        } finally {
            setBusy(false);
        }
    };

    if (!overview) return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
        <div className="space-y-2 text-center">
            <Lock className="mx-auto h-10 w-10 text-slate-500" aria-hidden />
            <h1 className="text-2xl font-bold text-slate-800">{l('title')}</h1>
            <p className="text-sm text-slate-600">{l('enterPassword')}</p>
        </div>
        <form onSubmit={event => void submit(event)} className="space-y-3">
            <label className="block space-y-1 text-sm font-medium text-slate-700">
                <span>{l('password')}</span>
                <input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)}
                    className="min-h-[44px] w-full rounded-md border border-slate-300 px-3 text-base" />
            </label>
            {error && <p role="alert" className="text-sm text-red-600">{l(error)}</p>}
            <Button type="submit" disabled={busy || !password} className="w-full">{l(busy ? 'opening' : 'open')}</Button>
        </form>
    </main>;

    const expires = new Date(overview.expires_at).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{l('title')}</p>
                <h1 className="text-2xl font-bold text-slate-800">{overview.group.name}</h1>
                <p className="text-sm text-slate-500">{l('readOnly')} {expires}</p>
            </div>
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
                <Printer className="h-4 w-4" aria-hidden />{l('print')}
            </Button>
        </header>
        <p className="text-sm text-slate-600">{l('privacy')}</p>
        <div className="print:hidden">
            <label className="block max-w-sm space-y-1 text-sm font-medium text-slate-700">
                <span>{l('searchStudent')}</span>
                <input type="search" value={query} onChange={event => setQuery(event.target.value)}
                    className="min-h-[44px] w-full rounded-md border border-slate-300 px-3 text-base" />
            </label>
        </div>
        <h2 className="text-lg font-semibold text-slate-800">{l('students')} ({students.length})</h2>
        {overview.students.length === 0 && <p className="text-sm text-slate-500">{l('noStudents')}</p>}
        <div className="space-y-3">{students.map(student => {
            const expanded = open === student.username;
            const panel = `council-student-${student.username}`;
            const plansDone = student.plans.reduce((sum, plan) => sum + plan.done, 0);
            const plansTotal = student.plans.reduce((sum, plan) => sum + plan.total, 0);
            return <Card key={student.username} className="space-y-4 break-inside-avoid">
                <button type="button" aria-expanded={expanded} aria-controls={panel} onClick={() => setOpen(expanded ? null : student.username)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left">
                    <span>
                        <span className="block font-semibold text-slate-800">{student.display_name}</span>
                        <span className="block text-sm text-slate-500">
                            {plansTotal > 0 && `${plansDone}/${plansTotal} ${l('stepsDone')} · `}{student.results.length} {l('results').toLowerCase()}
                        </span>
                    </span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform print:hidden ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                <div id={panel} className={expanded ? '' : 'hidden print:block'}>
                    <StudentSheet student={student} lang={lang} />
                </div>
            </Card>;
        })}</div>
    </main>;
}
