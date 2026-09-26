'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { goalApi, type Commitment, type Outcome, type PersonalGoal, type Satisfaction } from '@/lib/goals';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Field, GoalIssue, input } from './GoalUI';
import type { DialogTarget } from './GoalDialog';

type ReviewForm = { commitment: Commitment | null; outcome: Outcome | null; satisfaction: Satisfaction | null; obstacles: string; change: string; learned: string; next_step: string };

/** Il Bilancio dentro il popup obiettivo (§7.4): chiude l'obiettivo e offre i ponti verso il «dopo». */
export function GoalReviewStep({ goal, onDone, onCancel, onNavigate, onDirty }: { goal: PersonalGoal; onDone: (row: PersonalGoal) => void; onCancel: () => void; onNavigate: (target: DialogTarget) => void; onDirty: (dirty: boolean) => void }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [form, setForm] = useState<ReviewForm>({ commitment: null, outcome: null, satisfaction: null, obstacles: '', change: '', learned: '', next_step: '' });
    const [dirty, setDirty] = useState(false); const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
    const change = (patch: Partial<ReviewForm>) => { setForm({ ...form, ...patch }); setDirty(true); };
    useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
    useDraftGuard(dirty, l('discard'));
    const save = async () => {
        setBusy(true);
        try {
            const row = await goalApi<PersonalGoal>(`/user/goals/${goal.id}/reviews`, 'POST', { ...form, revision: goal.revision });
            setDone(true); setDirty(false); onDirty(false); onDone(row);
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    // L'Annulla butta una bozza non salvata solo dopo conferma, come il resto del popup.
    const quit = () => { if (!dirty || window.confirm(l('discard'))) onCancel(); };
    const radios = (legend: GoalTextKey, name: string, current: string | null, values: readonly string[], prefix: string, select: (value: string) => void) => <fieldset disabled={busy || done} className="space-y-1">
        <legend className="text-sm font-medium text-slate-700">{l(legend)}</legend>
        {values.map(value => <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name={name} checked={current === value} onChange={() => select(value)} />
            {l((prefix + value) as GoalTextKey)}
        </label>)}
    </fieldset>;
    return <>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:px-6">
            <GoalIssue error={error} lang={lang} />
            {radios('reviewCommitment', 'review-commitment', form.commitment, ['full', 'enough', 'partial', 'none'], 'commitment_', value => change({ commitment: value as Commitment }))}
            {radios('reviewOutcome', 'review-outcome', form.outcome, ['reached', 'partial', 'not_reached', 'abandoned'], 'outcome_', value => change({ outcome: value as Outcome }))}
            {radios('reviewSatisfaction', 'review-satisfaction', form.satisfaction, ['much', 'enough', 'little', 'none'], 'satisfaction_', value => change({ satisfaction: value as Satisfaction }))}
            <Field label={l('obstacles')}><textarea className={input} maxLength={1500} disabled={busy || done} value={form.obstacles} onChange={e => change({ obstacles: e.target.value })} /></Field>
            <Field label={l('change')}><textarea className={input} maxLength={1500} disabled={busy || done} value={form.change} onChange={e => change({ change: e.target.value })} /></Field>
            <Field label={l('learned')}><textarea className={input} maxLength={1500} disabled={busy || done} value={form.learned} onChange={e => change({ learned: e.target.value })} /></Field>
            <Field label={l('nextStep')}><textarea className={input} maxLength={1500} disabled={busy || done} value={form.next_step} onChange={e => change({ next_step: e.target.value })} /></Field>
            <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="font-semibold">{l('criteria')}</p>
                <p className="whitespace-pre-wrap">{goal.criteria || '—'}</p>
                <p className="mt-2 text-slate-600">{l('evidence')} · {goal.links.filter(link => link.role === 'evidence').length}</p>
            </div>
            {done && <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <p role="status" className="text-indigo-700">{l('saved')}</p>
                <div><Button type="button" variant="secondary" onClick={() => onNavigate({ kind: 'create', prefill: { title: form.next_step.slice(0, 160) } })}>{l('toNewGoal')}</Button></div>
                <div><Button type="button" variant="secondary" onClick={() => onNavigate({ kind: 'edit', id: goal.id, prefill: { action: form.next_step.slice(0, 160) } })}>{l('toNewAction')}</Button></div>
                <Link className="block text-sm text-indigo-700 underline" href={`/profilo/taccuino?note=${encodeURIComponent(form.change)}`}>{l('toNotebook')}</Link>
            </div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-4 sm:px-6">
            <div className="ml-auto flex gap-2">
                <Button type="button" variant="secondary" onClick={quit}>{l('cancel')}</Button>
                {!done && <Button type="button" disabled={busy || !form.outcome} onClick={() => void save()}>{l('closeGoal')}</Button>}
            </div>
        </div>
    </>;
}