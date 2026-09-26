'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { translate, type Lang } from '@/lib/i18n';
import { goalApi, type GoalGroup, type PersonalGoal } from '@/lib/goals';
import { goalText } from '@/lib/i18n-goals';
import { EVENT_ROLES } from '@/lib/event-booklet';
import { GoalDialog, type DialogTarget } from '@/components/goals/GoalDialog';
import { emptyEventReview, type EventReview, type TimelineEvent } from '@/lib/visual-tools';

const field = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const linesOf = (text: string): string[] => text.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 10);

/** «Rileggere l'esperienza» (C3): the rilettura of a past milestone (backend `EventReview`,
    ex scheda evento/biografia del libretto). Shared by the session-scoped timeline tool
    (`TimelineTools`) and the personal timeline page (`PersonalTimeline`'s `MilestoneEditor`).
    A compiled "next time" bridges to a new goal (GoalDialog, origin `event`) or a new action. */
export function ExperienceReview({ event, locale, onPatch }: { event: TimelineEvent; locale: string; onPatch: (review: EventReview) => void }) {
    const lang = locale.slice(0, 2) as Lang;
    const b = (key: string) => translate(lang, key);
    const l = (key: string) => visualLabel(locale, key);
    const review = event.review ?? emptyEventReview();
    const patch = (next: Partial<EventReview>) => onPatch({ ...review, ...next });
    const [goals, setGoals] = useState<PersonalGoal[]>([]);
    const [groups, setGroups] = useState<GoalGroup[]>([]);
    const [target, setTarget] = useState<DialogTarget | null>(null);
    const [dialogSaved, setDialogSaved] = useState(false);
    useEffect(() => {
        let active = true;
        goalApi<PersonalGoal[]>('/user/goals').then((rows) => { if (active) setGoals(rows); }).catch(() => { if (active) setGoals([]); });
        goalApi<GoalGroup[]>('/user/goal-groups').then((rows) => { if (active) setGroups(rows); }).catch(() => { if (active) setGroups([]); });
        return () => { active = false; };
    }, []);
    const reloadGoals = () => {
        goalApi<PersonalGoal[]>('/user/goals').then((rows) => setGoals(rows)).catch(() => setGoals([]));
    };
    const nextStep = review.try_next.trim();
    return <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-indigo-700">{l('experienceReview')}</summary>
        <div className="mt-3 space-y-3">
            <fieldset>
                <legend className="text-sm">{b('eventBooklet.field.role')}</legend>
                <div className="flex flex-wrap gap-4">
                    {EVENT_ROLES.map(role => <label key={role} className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="radio" name={`review-role-${event.id}`} checked={review.role === role} onChange={() => patch({ role })} />{b(`eventBooklet.role.${role}`)}
                    </label>)}
                </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">{b('eventBooklet.field.worked')} <span className="text-xs text-slate-500">({b('eventBooklet.itemsHint')})</span>
                    <textarea rows={3} className={field} value={review.worked.join('\n')} onChange={e => patch({ worked: linesOf(e.target.value) })} /></label>
                <label className="block text-sm">{b('eventBooklet.field.didNotWork')} <span className="text-xs text-slate-500">({b('eventBooklet.itemsHint')})</span>
                    <textarea rows={3} className={field} value={review.did_not_work.join('\n')} onChange={e => patch({ did_not_work: linesOf(e.target.value) })} /></label>
            </div>
            <label className="block text-sm">{b('eventBooklet.field.reading')}<textarea rows={3} maxLength={1500} className={field} value={review.reading} onChange={e => patch({ reading: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">{b('booklet.bio.discovery')}<textarea rows={2} maxLength={1000} className={field} value={review.discovery} onChange={e => patch({ discovery: e.target.value })} /></label>
                <label className="block text-sm">{b('booklet.bio.keywords')}<input maxLength={200} className={field} value={review.keywords} onChange={e => patch({ keywords: e.target.value })} /></label>
            </div>
            <label className="block text-sm">{b('eventBooklet.field.try')}<textarea rows={2} maxLength={1000} className={field} value={review.try_next} onChange={e => patch({ try_next: e.target.value })} /></label>
            <label className="block text-sm">{b('eventBooklet.field.howWhen')}<textarea rows={2} maxLength={1000} className={field} value={review.how_when} onChange={e => patch({ how_when: e.target.value })} /></label>
            {nextStep && <div className="flex flex-wrap gap-3">
                <Button type="button" variant="secondary" onClick={() => { setDialogSaved(false); setTarget({ kind: 'create', origin: { kind: 'event', target_id: event.id }, prefill: { title: nextStep } }); }}>{goalText(locale, 'toNewGoal')}</Button>
                <Link className="inline-flex min-h-11 items-center text-indigo-700 underline" href={`/profilo/azioni?new=1&title=${encodeURIComponent(nextStep)}`}>{goalText(locale, 'toNewAction')}</Link>
            </div>}
        </div>
        {target && <GoalDialog target={target} goals={goals} groups={groups} saved={dialogSaved}
            onTarget={next => { setDialogSaved(false); setTarget(next); }} onClose={() => { setTarget(null); setDialogSaved(false); }}
            onReload={reloadGoals}
            onSaved={row => { setGoals(previous => previous.map(g => g.id === row.id ? row : g)); setDialogSaved(true); }}
            onCreated={row => { setGoals(previous => [row, ...previous]); setDialogSaved(true); setTarget(null); }}
            onDeleted={() => { setTarget(null); setDialogSaved(false); }} />}
    </details>;
}
