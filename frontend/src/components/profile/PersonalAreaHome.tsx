'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaDescription, personalAreaName, personalAreaText } from '@/lib/i18n-personal-area';
import { personalAreaGroups, personalAreaImages, personalResumeItems, type ResumeAssignment } from '@/lib/personal-area';
import type { PersonalGoal } from '@/lib/goals';
import { Button } from '@/components/ui/Button';

function PersonalResume() {
    const { lang } = useI18n();
    const [goals, setGoals] = useState<PersonalGoal[]>([]);
    const [assignments, setAssignments] = useState<ResumeAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const l = (key: Parameters<typeof personalAreaText>[1]) => personalAreaText(lang, key);

    useEffect(() => {
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
        const read = async <T,>(path: string): Promise<T[]> => {
            const response = await apiFetch(`/api/user/${path}`, { signal });
            if (!response.ok) throw new Error(String(response.status));
            const data: unknown = await response.json();
            if (!Array.isArray(data)) throw new Error('Invalid overview response');
            return data as T[];
        };
        void Promise.allSettled([read<PersonalGoal>('goals'), read<ResumeAssignment>('assignments')]).then(([goalResult, assignmentResult]) => {
            if (controller.signal.aborted) return;
            if (goalResult.status === 'fulfilled') setGoals(goalResult.value);
            if (assignmentResult.status === 'fulfilled') setAssignments(assignmentResult.value);
            setFailed(goalResult.status === 'rejected' || assignmentResult.status === 'rejected');
            setLoading(false);
        });
        return () => controller.abort();
    }, [attempt]);

    const items = personalResumeItems(goals, assignments);
    if (!loading && !failed && !items.length) return null;
    return <section aria-labelledby="personal-resume-title" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <h2 id="personal-resume-title" className="font-bold text-slate-900">{l('resume')}</h2>
        {loading && <p role="status" className="min-h-11 py-3 text-sm text-slate-600">{l('loading')}</p>}
        {failed && <div role="alert" className="flex flex-wrap items-center gap-x-3 text-sm text-slate-700">
            <p>{l('error')}{items.length > 0 && <> {l('stale')}</>}</p>
            <Button variant="ghost" disabled={loading} onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>{l('retry')}</Button>
        </div>}
        {items.length > 0 && <ul className="mt-1 divide-y divide-indigo-200">
            {items.map(item => <li key={item.id}>
                <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-md py-2 text-sm text-indigo-700">
                    <span className="min-w-0 flex-1 break-words">
                        <span className="text-slate-600">{l(item.kind)} · </span><span className="font-semibold">{item.title}</span>
                        {item.date && <time dateTime={item.date} className="ml-2 text-slate-600">{new Date(`${item.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}</time>}
                        {item.feedback && <span className="block text-slate-600">{l('feedback')}</span>}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
            </li>)}
        </ul>}
    </section>;
}

export function PersonalAreaHome() {
    const { lang } = useI18n();
    return <div className="space-y-6" data-personal-area-home>
        <PersonalResume />
        {personalAreaGroups.map(group => <section key={group.id} aria-labelledby={`personal-group-${group.id}`}>
            <h2 id={`personal-group-${group.id}`} className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{personalAreaText(lang, group.id)}</h2>
            <nav aria-labelledby={`personal-group-${group.id}`} className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                {group.slugs.map(slug => <Link key={slug} href={`/profilo/${slug}`} aria-labelledby={`personal-link-${slug}`} aria-describedby={`personal-description-${slug}`}
                    className="group flex min-h-24 items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50 sm:gap-4">
                    <Image src={personalAreaImages[slug]} alt="" width={72} height={72} sizes="(min-width: 768px) 72px, 64px" className="h-16 w-16 shrink-0 rounded-md object-contain md:h-18 md:w-18" />
                    <span className="min-w-0 flex-1">
                        <span id={`personal-link-${slug}`} className="block font-bold text-slate-900 group-hover:text-indigo-700">{personalAreaName(lang, slug)}</span>
                        <span id={`personal-description-${slug}`} className="mt-1 block text-sm leading-relaxed text-slate-600">{personalAreaDescription(lang, slug)}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </Link>)}
            </nav>
        </section>)}
    </div>;
}
