'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Lock, Printer } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classCouncilText, type ClassCouncilTextKey } from '@/lib/i18n-class-council';
import { councilErrorKey, matchesStudent, submissionText, type CouncilOverview, type CouncilStudent } from '@/lib/class-council';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';

const STATE_KEYS: Record<string, ClassCouncilTextKey> = { done: 'done', not_done: 'not_done', locked: 'stateLocked' };

function Section({ title, empty, children, count }: { title: string; empty: string; children: React.ReactNode; count: number }) {
    return <section className="space-y-2 border-t border-line pt-4">
        <h4 className="text-sm font-semibold text-ink-muted">{title}</h4>
        {count === 0 ? <p className="text-sm text-ink-muted">{empty}</p> : children}
    </section>;
}

function StudentSheet({ student, lang }: { student: CouncilStudent; lang: string }) {
    const l = (key: ClassCouncilTextKey) => classCouncilText(lang, key);
    const date = (value: string | null) => value ? new Date(value).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return <div className="space-y-6">
        <Section title={l('plans')} empty={l('nothing')} count={student.plans.length}>
            <div className="divide-y divide-line">{student.plans.map(plan => <div key={plan.path_id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{plan.title}</p>
                    <p className="text-sm text-ink-body">{plan.done}/{plan.total} {l('stepsDone')}</p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-surface-sunken" aria-hidden>
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${plan.total ? Math.round(plan.done / plan.total * 100) : 0}%` }} />
                </div>
                <ul className="mt-3 space-y-1 text-sm">{plan.steps.map((step, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink-body">{step.title}{step.due_date && <span className="text-ink-muted"> · {l('due')} {date(step.due_date)}</span>}</span>
                    <StatusBadge tone={step.state === 'done' ? 'success' : 'neutral'}>{l(STATE_KEYS[step.state] ?? 'not_done')}</StatusBadge>
                </li>)}</ul>
            </div>)}</div>
        </Section>
        <Section title={l('results')} empty={l('nothing')} count={student.results.length}>
            <div className="divide-y divide-line">{student.results.map((result, index) => <div key={index} className="py-3 first:pt-0 last:pb-0">
                <p className="font-semibold text-ink">{result.questionnaire_type} <span className="font-normal text-ink-muted">· {date(result.submitted_at)}</span></p>
                {result.scores && Object.keys(result.scores).length > 0 && <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {Object.entries(result.scores).filter(([, value]) => typeof value === 'number' || typeof value === 'string').map(([code, value]) =>
                        <div key={code}><dt className="inline font-semibold text-ink-body">{code}</dt> <dd className="inline text-ink-muted">{String(value)}</dd></div>)}
                </dl>}
                {result.summary && <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-semibold text-link">{l('summary')}</summary>
                    <p className="mt-2 whitespace-pre-line text-ink-body">{result.summary}</p>
                </details>}
            </div>)}</div>
        </Section>
        <Section title={l('sharedConversations')} empty={l('sharedConversationsEmpty')} count={student.shared_conversations.length}>
            <div className="divide-y divide-line">{student.shared_conversations.map(conversation => <div key={conversation.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-ink">
                    {conversation.questionnaire_type || l('sharedConversations')}
                    <span className="ml-2 font-normal text-ink-muted">
                        · {conversation.whole_chat ? l('shareWholeChat') : l('sharedExtract')} · {l('sharedUntil')} {date(conversation.expires_at)}
                    </span>
                </p>
                <div className="mt-2 space-y-2 text-sm">
                    {conversation.messages.map((message, index) => <div key={index}>
                        <p className="font-semibold text-ink-body">{message.role === 'student' ? l('studentOne') : 'CounselorBot'}</p>
                        <p className="whitespace-pre-line break-words text-ink-body">{message.text}</p>
                    </div>)}
                </div>
            </div>)}</div>
        </Section>
        <Section title={l('assignments')} empty={l('nothing')} count={student.assignments.length}>
            <div className="divide-y divide-line">{student.assignments.map((item, index) => <div key={index} className="py-3 text-sm first:pt-0 last:pb-0">
                <p className="font-semibold text-ink">{item.title}{item.due_date && <span className="font-normal text-ink-muted"> · {l('due')} {date(item.due_date)}</span>}</p>
                {item.submission ? <>
                    <p className="mt-2 text-xs font-semibold text-ink-muted">{l('submitted')} · {date(item.submitted_at)}</p>
                    <p className="whitespace-pre-line text-ink-body">{submissionText(item.submission)}</p>
                </> : <p className="mt-1 text-ink-muted">{l('notSubmitted')}</p>}
                {item.feedback && <><p className="mt-2 text-xs font-semibold text-ink-muted">{l('feedback')}</p><p className="whitespace-pre-line text-ink-body">{item.feedback}</p></>}
            </div>)}</div>
        </Section>
        <Section title={l('goals')} empty={l('nothing')} count={student.goals.length}>
            <div className="divide-y divide-line">{student.goals.map((goal, index) => <div key={index} className="py-3 text-sm first:pt-0 last:pb-0">
                <p className="font-semibold text-ink">{goal.title}</p>
                {goal.criteria && <p className="mt-1 text-ink-body"><span className="font-semibold">{l('criteria')}:</span> {goal.criteria}</p>}
                {goal.reflection && <p className="mt-1 text-ink-body"><span className="font-semibold">{l('reflection')}:</span> {goal.reflection}</p>}
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
            <Lock className="mx-auto h-10 w-10 text-ink-muted" aria-hidden />
            <h1 className="text-2xl font-semibold text-ink">{l('title')}</h1>
            <p className="text-sm text-ink-body">{l('enterPassword')}</p>
        </div>
        <form onSubmit={event => void submit(event)} className="space-y-3">
            <Field label={l('password')} error={error ? l(error) : undefined}>
                <Input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} />
            </Field>
            <Button type="submit" disabled={busy || !password} className="w-full">{l(busy ? 'opening' : 'open')}</Button>
        </form>
    </main>;

    const expires = new Date(overview.expires_at).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <p className="text-sm font-semibold text-link">{l('title')}</p>
                <h1 className="text-2xl font-semibold text-ink">{overview.group.name}</h1>
                <p className="text-sm text-ink-muted">{l('readOnly')} {expires}</p>
            </div>
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
                <Printer className="h-4 w-4" aria-hidden />{l('print')}
            </Button>
        </header>
        <p className="text-sm text-ink-body">{l('privacy')}</p>
        <div className="print:hidden">
            <Field label={l('searchStudent')} className="max-w-sm">
                <Input type="search" value={query} onChange={event => setQuery(event.target.value)} />
            </Field>
        </div>
        <h2 className="text-lg font-semibold text-ink">{l('students')} ({students.length})</h2>
        {overview.students.length === 0 && <p className="text-sm text-ink-muted">{l('noStudents')}</p>}
        <div>{students.map(student => {
            const expanded = open === student.username;
            const panel = `council-student-${student.username}`;
            const plansDone = student.plans.reduce((sum, plan) => sum + plan.done, 0);
            const plansTotal = student.plans.reduce((sum, plan) => sum + plan.total, 0);
            return <Card key={student.username} variant="flat" className="space-y-4 break-inside-avoid">
                <button type="button" aria-expanded={expanded} aria-controls={panel} onClick={() => setOpen(expanded ? null : student.username)}
                    className="flex min-h-control w-full items-center justify-between gap-3 text-left">
                    <span>
                        <span className="block font-semibold text-ink">{student.display_name}</span>
                        <span className="block text-sm text-ink-muted">
                            {plansTotal > 0 && `${plansDone}/${plansTotal} ${l('stepsDone')} · `}{student.results.length} {l('results').toLowerCase()}
                        </span>
                    </span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-ink-muted transition-transform print:hidden ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                <div id={panel} className={expanded ? '' : 'hidden print:block'}>
                    <StudentSheet student={student} lang={lang} />
                </div>
            </Card>;
        })}</div>
    </main>;
}
