'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { assignmentText } from '@/lib/i18n-assignments';
import { learningText } from '@/lib/i18n-assignment-work';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { goalApi as request, GoalError, type PersonalGoal } from '@/lib/goals';

const input = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm';
type Submission = { text: string; portfolio?: { title: string; description: string } };
type Work = {
    revision: number; workspace_revision: number; planned: boolean;
    action: { id: string; title: string; stage: string } | null;
    event: { id: string; reflection: string } | null;
    linked_goals: { id: number; title: string }[];
    submission: Submission | null; submitted_at: string | null; feedback: string; feedback_at: string | null;
};
type Portfolio = { id: number; title: string; description: string | null; updated_at: string | null; created_at: string };
type SharedWork = Pick<Work, 'revision' | 'submission' | 'submitted_at' | 'feedback' | 'feedback_at'> & { username: string };

function useDraftGuard(dirty: boolean, lang: string) {
    useEffect(() => {
        if (!dirty) return;
        const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        const leave = (event: MouseEvent) => {
            if ((event.target as Element).closest?.('a[href]') && !window.confirm(learningText(lang, 'leaveDraft'))) { event.preventDefault(); event.stopPropagation(); }
        };
        window.addEventListener('beforeunload', unload); document.addEventListener('click', leave, true);
        return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true); };
    }, [dirty, lang]);
}

function SharedText({ value }: { value: Submission }) {
    return <div className="space-y-2 whitespace-pre-wrap break-words text-sm">
        {value.text && <p>{value.text}</p>}
        {value.portfolio && <div className="border-l-2 border-indigo-200 pl-3"><p className="font-semibold">{value.portfolio.title}</p><p>{value.portfolio.description}</p></div>}
    </div>;
}

function WorkEditor({ assignmentId }: { assignmentId: number }) {
    const { lang } = useI18n(); const l = (key: Parameters<typeof learningText>[1]) => learningText(lang, key);
    const base = `/user/assignments/${assignmentId}`;
    const [work, setWork] = useState<Work | null>(null);
    const [goals, setGoals] = useState<PersonalGoal[]>([]); const [portfolio, setPortfolio] = useState<Portfolio[]>([]);
    const [date, setDate] = useState(''); const [reflection, setReflection] = useState('');
    const [reflectionRevision, setReflectionRevision] = useState(0);
    const [goalId, setGoalId] = useState(''); const [portfolioId, setPortfolioId] = useState(''); const [shareText, setShareText] = useState('');
    const [shareBaseline, setShareBaseline] = useState('');
    const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [saved, setSaved] = useState(false);
    const load = useCallback(async () => {
        setBusy(true); setError(null); setSaved(false);
        try {
            const [state, ownGoals, ownPortfolio] = await Promise.all([request<Work>(`${base}/work`), request<PersonalGoal[]>('/user/goals'), request<Portfolio[]>('/user/portfolio')]);
            setWork(state); setGoals(ownGoals); setPortfolio(ownPortfolio);
            setReflection(state.event?.reflection || ''); setShareText(state.submission?.text || ''); setPortfolioId('');
            setReflectionRevision(state.workspace_revision);
            setShareBaseline(JSON.stringify([state.submission?.text || '', '']));
        } catch (e) { setError(e); } finally { setBusy(false); }
    }, [base]);
    useEffect(() => { void load(); }, [load]);
    const dirty = Boolean(work && (reflection !== (work.event?.reflection || '') || JSON.stringify([shareText, portfolioId]) !== shareBaseline));
    useDraftGuard(dirty, lang);
    const mutate = async (path: string, method: string, body?: unknown) => {
        setBusy(true); setError(null); setSaved(false);
        try {
            const next = await request<Work>(`${base}/${path}`, method, body);
            setWork(next); setSaved(true);
            if (path === 'reflection' || path === 'plan' || reflection === (work?.event?.reflection || '')) {
                setReflection(next.event?.reflection || ''); setReflectionRevision(next.workspace_revision);
            }
            if (path === 'submission') setShareBaseline(JSON.stringify([shareText, portfolioId]));
            window.dispatchEvent(new Event('personal-assignments-changed'));
            return next;
        } catch (e) { setError(e); return null; } finally { setBusy(false); }
    };
    const selectedPortfolio = portfolio.find(item => String(item.id) === portfolioId);
    const selectedGoal = goals.find(goal => String(goal.id) === goalId);
    const preview: Submission = { text: shareText, ...(selectedPortfolio ? { portfolio: { title: selectedPortfolio.title, description: selectedPortfolio.description || '' } } : {}) };
    return <div className="space-y-4 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-600">{l('privateWork')}</p>
        {busy && <p role="status">{assignmentText(lang, 'loading')}</p>}
        {saved && <p role="status">{l('saved')}</p>}
        {error != null && <p role="alert" className="text-sm text-red-700">{error instanceof GoalError && error.status === 409 ? l('conflict') : assignmentText(lang, 'error')} <button type="button" className="underline" disabled={busy} onClick={() => void load()}>{l('reload')}</button></p>}
        {work && <fieldset disabled={busy} className="min-w-0 space-y-5">
            {!work.planned ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate('plan', 'POST', { date: date || null }); }}>
                <label className="block text-sm font-medium">{l('planDate')}<input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} /></label>
                <Button type="submit">{l('plan')}</Button>
            </form> : <>
                {work.action && <p className="text-sm font-medium text-indigo-700">{work.action.title} · {visualLabel(lang, work.action.stage)}</p>}
                {(!work.action || !work.event) && <p className="text-sm text-amber-700">{l('missing')}</p>}
                <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-indigo-700">
                    {work.action && <Link className="py-2 underline" href="/profilo/azioni">{l('openActivities')}</Link>}
                    {work.event && <Link className="py-2 underline" href={`/profilo/timeline?event=${encodeURIComponent(work.event.id)}`}>{l('openTimeline')}</Link>}
                    <Link className="py-2 underline" href="/profilo/portfolio">{l('openPortfolio')}</Link>
                </nav>
                {work.linked_goals.length > 0 && <ul className="space-y-1 text-sm">{work.linked_goals.map(goal => <li key={goal.id}><Link className="inline-block py-2 text-indigo-700 underline" href={`/profilo/obiettivi?goal=${goal.id}`}>{goal.title}</Link></li>)}</ul>}
                {work.action && work.event && <form className="space-y-2" onSubmit={async event => {
                    event.preventDefault(); if (!selectedGoal) return;
                    const next = await mutate('goal', 'POST', { revision: work.revision, goal_id: selectedGoal.id, goal_revision: selectedGoal.revision });
                    if (next) { setGoals(rows => rows.map(row => row.id === selectedGoal.id ? { ...row, revision: row.revision + 1 } : row)); setGoalId(''); }
                }}>
                    <label className="block text-sm font-medium">{l('goal')}<select className={input} value={goalId} onChange={e => setGoalId(e.target.value)}><option value="">{l('none')}</option>{goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
                    <Button type="submit" variant="secondary" disabled={!selectedGoal}>{l('linkGoal')}</Button>
                </form>}
                {work.event && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void mutate('reflection', 'PUT', { revision: work.revision, workspace_revision: reflectionRevision, reflection }); }}>
                    <label className="block text-sm font-medium">{l('reflection')}<textarea className={input} rows={3} maxLength={1000} value={reflection} onChange={e => { setReflection(e.target.value); setSaved(false); }} /></label>
                    <Button type="submit" variant="secondary" disabled={reflection === work.event.reflection}>{l('saveReflection')}</Button>
                </form>}
                {work.submission && <section className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3" aria-label={l('shared')}>
                    <h4 className="font-semibold">{l('shared')}</h4><SharedText value={work.submission} />
                    {work.feedback && <div className="space-y-2 border-t border-indigo-200 pt-3"><h5 className="font-semibold">{l('feedback')}</h5><p className="whitespace-pre-wrap text-sm">{work.feedback}</p></div>}
                    <Button type="button" variant="secondary" onClick={() => { if (window.confirm(l('confirmWithdraw'))) void mutate(`submission?revision=${work.revision}`, 'DELETE'); }}>{l('withdraw')}</Button>
                </section>}
                <details className="rounded-lg border border-slate-200 p-3">
                    <summary className="cursor-pointer py-2 font-semibold">{l('submission')}</summary>
                    <form className="mt-3 space-y-3" onSubmit={event => {
                        event.preventDefault(); void mutate('submission', 'POST', { revision: work.revision, text: shareText,
                            portfolio_id: selectedPortfolio?.id || null, portfolio_updated_at: selectedPortfolio ? selectedPortfolio.updated_at || selectedPortfolio.created_at : null });
                    }}>
                        <p className="text-sm text-slate-600">{l('shareHelp')}</p>
                        {reflection && <Button type="button" variant="secondary" onClick={() => setShareText(reflection)}>{l('useReflection')}</Button>}
                        <label className="block text-sm font-medium">{l('shareText')}<textarea className={input} rows={4} maxLength={3000} value={shareText} onChange={e => { setShareText(e.target.value); setSaved(false); }} /></label>
                        <label className="block text-sm font-medium">{l('portfolio')}<select className={input} value={portfolioId} onChange={e => setPortfolioId(e.target.value)}><option value="">{l('none')}</option>{portfolio.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                        <section className="space-y-2 rounded-md bg-slate-50 p-3" aria-label={l('preview')}><h5 className="text-sm font-semibold">{l('preview')}</h5><SharedText value={preview} /></section>
                        <Button type="submit" disabled={!shareText.trim() && !selectedPortfolio}>{l('share')}</Button>
                    </form>
                </details>
            </>}
        </fieldset>}
    </div>;
}

export function AssignmentWork({ assignmentId }: { assignmentId: number }) {
    const { lang } = useI18n(); const [open, setOpen] = useState(false);
    useEffect(() => {
        const check = () => { if (window.location.hash === `#assignment-${assignmentId}`) setOpen(true); };
        check(); window.addEventListener('hashchange', check); return () => window.removeEventListener('hashchange', check);
    }, [assignmentId]);
    return <div className="space-y-3"><Button type="button" variant="secondary" aria-expanded={open} onClick={() => setOpen(true)}>{learningText(lang, 'openWork')}</Button>{open && <WorkEditor assignmentId={assignmentId} />}</div>;
}

function FeedbackEditor({ row, onSave }: { row: SharedWork; onSave: (text: string) => Promise<void> }) {
    const { lang } = useI18n(); const [text, setText] = useState(row.feedback);
    useDraftGuard(text !== row.feedback, lang);
    return <article className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h4 className="font-semibold">{row.username}</h4>{row.submission && <SharedText value={row.submission} />}
        <form className="space-y-2" onSubmit={event => { event.preventDefault(); void onSave(text); }}>
            <label className="block text-sm font-medium">{learningText(lang, 'feedback')}<textarea className={input} rows={3} maxLength={3000} required value={text} onChange={e => setText(e.target.value)} /></label>
            <Button type="submit" disabled={!text.trim()}>{learningText(lang, 'sendFeedback')}</Button>
        </form>
    </article>;
}

export function AssignmentSubmissions({ assignmentId }: { assignmentId: number }) {
    const { lang } = useI18n(); const [rows, setRows] = useState<SharedWork[] | null>(null);
    const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
    const base = `/teacher/assignments/${assignmentId}/submissions`;
    const load = async () => { setBusy(true); setError(null); setSaved(false); try { setRows(await request<SharedWork[]>(base)); } catch (e) { setError(e); } finally { setBusy(false); } };
    return <section className="space-y-3 border-t border-slate-200 pt-3" aria-label={learningText(lang, 'submissions')}>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>{learningText(lang, rows ? 'reload' : 'submissions')}</Button>
        {busy && <p role="status">{assignmentText(lang, 'loading')}</p>}
        {saved && <p role="status">{learningText(lang, 'saved')}</p>}
        {error != null && <p role="alert">{error instanceof GoalError && error.status === 409 ? learningText(lang, 'conflict') : assignmentText(lang, 'error')}</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-600">{learningText(lang, 'noSubmissions')}</p>}
        <fieldset disabled={busy} className="space-y-3">{rows?.map(row => <FeedbackEditor key={`${row.username}-${row.revision}`} row={row} onSave={async text => {
            setBusy(true); setError(null); setSaved(false);
            try { const updated = await request<SharedWork>(`${base}/${encodeURIComponent(row.username)}/feedback`, 'PUT', { revision: row.revision, text }); setRows(previous => previous?.map(item => item.username === row.username ? updated : item) || []); setSaved(true); }
            catch (e) { setError(e); } finally { setBusy(false); }
        }} />)}</fieldset>
    </section>;
}
