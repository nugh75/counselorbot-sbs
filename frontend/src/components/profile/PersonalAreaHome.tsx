'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { PersonalAIConnections } from '@/components/profile/PersonalAIConnections';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaDescription, personalAreaName, personalAreaText } from '@/lib/i18n-personal-area';
import { forumText } from '@/lib/i18n-forum';
import { personalAreaGroups, personalAreaImages, personalResumeItems, type ResumeAssignment } from '@/lib/personal-area';
import type { PersonalGoal } from '@/lib/goals';
import { enabledResumeItems, personalSlugEnabled, type UserAccess } from '@/lib/personal-tool-access';
import { usePersonalToolAccess } from '@/lib/use-personal-tool-access';
import { Button } from '@/components/ui/Button';
import { ClassPathHeroList } from '@/components/profile/ClassPathHeroList';
import { parseStudentClassPaths, selectCurrentClassPath, type StudentClassPath } from '@/lib/class-paths';
import { classPathText } from '@/lib/i18n-class-paths';
import { LOCAL_RESUME_HREF, resumeHref, useResumeEntries } from '@/lib/use-resume-entries';
import { resumeLabel } from '@/lib/resume-label';
import { ResumeLoadError } from '@/components/layout/ResumeLoadError';

function PersonalResume({ access }: { access: UserAccess | null }) {
    const { lang, tf, t } = useI18n();
    const resume = useResumeEntries();
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

    const items = enabledResumeItems(personalResumeItems(goals, assignments), access);
    const frozen = resume.frozen.filter(row => !row.practice_notebook_id);
    const local = resume.localResume && !resume.frozen.some(row => row.session_id === resume.localResume?.sessionId)
        ? resume.localResume : null;
    if (!loading && !failed && !items.length && !frozen.length && !local && !resume.error && !resume.loading) return null;
    return <section aria-labelledby="personal-resume-title" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <h2 id="personal-resume-title" className="font-bold text-slate-900">{l('resume')}</h2>
        <ResumeLoadError entries={resume} />
        {loading && <p role="status" className="min-h-11 py-3 text-sm text-slate-600">{l('loading')}</p>}
        {failed && <div role="alert" className="flex flex-wrap items-center gap-x-3 text-sm text-slate-700">
            <p>{l('error')}{items.length > 0 && <> {l('stale')}</>}</p>
            <Button variant="ghost" disabled={loading} onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>{l('retry')}</Button>
        </div>}
        {(items.length > 0 || frozen.length > 0 || local) && <ul className="mt-1 divide-y divide-indigo-200">
            {frozen.map(row => <li key={`session-${row.session_id}`}>
                <a href={resumeHref(row)} className="flex min-h-11 items-center gap-3 rounded-md py-2 text-sm text-indigo-700">
                    <span className="min-w-0 flex-1 break-words font-semibold">{resumeLabel(row.questionnaire_type, row.label, tf)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </a>
            </li>)}
            {local && <li>
                <a href={LOCAL_RESUME_HREF} className="flex min-h-11 items-center gap-3 rounded-md py-2 text-sm text-indigo-700">
                    <span className="min-w-0 flex-1 break-words font-semibold">{t('header.resume')} · {resumeLabel(local.instrument, null, tf)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </a>
            </li>}
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
    const [unreadTotal, setUnreadTotal] = useState(0);
    const [paths, setPaths] = useState<StudentClassPath[]>([]);
    const access = usePersonalToolAccess();
    const groups = personalAreaGroups
        .map(group => ({ id: group.id, slugs: group.slugs.filter(slug => personalSlugEnabled(access, slug)) }))
        .filter(group => group.slugs.length > 0);

    const loadPaths = useCallback(async () => {
        try {
            const res = await apiFetch('/api/user/paths');
            if (res.ok) {
                const data = await res.json();
                setPaths(parseStudentClassPaths(data));
            }
        } catch {
            // Ignore network failure
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void apiFetch('/api/user/paths', { signal: controller.signal }).then(async response => {
            if (!response.ok) return;
            const data: unknown = await response.json();
            if (!controller.signal.aborted) setPaths(parseStudentClassPaths(data));
        }).catch(() => {});
        return () => controller.abort();
    }, []);

    const currentPath = useMemo(() => selectCurrentClassPath(paths), [paths]);

    useEffect(() => {
        let active = true;
        void apiFetch('/api/user/forum/unread').then(async res => {
            if (!res.ok) return;
            const data: unknown = await res.json();
            if (active && data && typeof data === 'object' && typeof (data as { total?: unknown }).total === 'number') {
                setUnreadTotal((data as { total: number }).total);
            }
        }).catch(() => {});
        return () => { active = false; };
    }, []);

    return (
        <div className="space-y-6" data-personal-area-home>
            {currentPath && (
                <section aria-labelledby="profile-class-path-title">
                    <h2 id="profile-class-path-title" className="sr-only">
                        {classPathText(lang, 'yourClassPath')}
                    </h2>
                    <ClassPathHeroList paths={paths} onReload={loadPaths} />
                </section>
            )}

            <PersonalResume access={access} />

            <div
                id="personal-catalog-section"
                className="space-y-6"
            >
                {groups.map(group => <section key={group.id} aria-labelledby={`personal-group-${group.id}`}>
                    <h2 id={`personal-group-${group.id}`} className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{personalAreaText(lang, group.id)}</h2>
                    <nav aria-labelledby={`personal-group-${group.id}`} className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                        {group.slugs.map(slug => <Link key={slug} href={`/profilo/${slug}`} aria-labelledby={`personal-link-${slug}`} aria-describedby={`personal-description-${slug}`}
                            className="group flex min-h-24 items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50 sm:gap-4">
                            <Image src={personalAreaImages[slug]} alt="" width={72} height={72} sizes="(min-width: 768px) 72px, 64px" className="h-16 w-16 shrink-0 rounded-md object-contain md:h-18 md:w-18" />
                            <span className="min-w-0 flex-1">
                                <span id={`personal-link-${slug}`} className="flex items-center gap-2 font-bold text-slate-900 group-hover:text-indigo-700">
                                    <span>{personalAreaName(lang, slug)}</span>
                                    {slug === 'classi' && unreadTotal > 0 && (
                                        <span
                                            className="inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-ochre-600 px-1.5 text-xs font-semibold text-white"
                                            aria-label={forumText(lang, 'unreadBadge').replace('{count}', String(unreadTotal))}
                                        >
                                            {unreadTotal}
                                            <span className="sr-only"> {forumText(lang, 'unreadBadge').replace('{count}', String(unreadTotal))}</span>
                                        </span>
                                    )}
                                </span>
                                <span id={`personal-description-${slug}`} className="mt-1 block text-sm leading-relaxed text-slate-600">{personalAreaDescription(lang, slug)}</span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                        </Link>)}
                    </nav>
                </section>)}
                <PersonalAIConnections area="profilo" />
            </div>
        </div>
    );
}
