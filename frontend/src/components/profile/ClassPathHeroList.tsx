'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { classPathText } from '@/lib/i18n-class-paths';
import { orderClassPaths, type StudentClassPath } from '@/lib/class-paths';
import { parseForumDiscussionLinks } from '@/lib/forum';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { ClassPathHeroCard } from '@/components/profile/ClassPathHeroCard';
import { useStudentMeetings } from './MeetingDetails';
import { useResumeEntries } from '@/lib/use-resume-entries';
import { getIdentity } from '@/lib/auth';
import { latestAdministrationDraft } from '@/lib/administration-entry';

// Every published plan of the student: the priority one open, the others folded.
// A forum link to a step (#class-step-N) opens the plan holding it.
// With `collapsed` every plan starts folded, even when there is only one.
export function ClassPathHeroList({ paths, onReload, showAllLink = true, collapsed = false }: {
    paths: StudentClassPath[];
    onReload?: () => Promise<void> | void;
    showAllLink?: boolean;
    collapsed?: boolean;
}) {
    const { lang } = useI18n();
    const discussions = useTeacherResource('/api/user/forum/links', parseForumDiscussionLinks);
    const meetings = useStudentMeetings();
    const resume = useResumeEntries();
    const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        let active = true;
        void getIdentity().then(identity => {
            if (!identity?.username || !active) return;
            const next = new Map<string, string>();
            try {
                for (const path of paths) for (const step of path.steps) {
                    if (step.step_type !== 'questionnaire_administration') continue;
                    const draft = latestAdministrationDraft(sessionStorage, identity.username, path.id, step.id);
                    if (draft !== null) next.set(`${path.id}:${step.id}`, draft);
                }
            } catch { /* The server-backed steps still work if storage is unavailable. */ }
            if (active) setDrafts(next);
        });
        return () => { active = false; };
    }, [paths]);
    const paused = new Map(resume.frozen.filter(row => !row.practice_notebook_id && row.path_id && row.path_step_id)
        .map(row => [`${row.path_id}:${row.path_step_id}`, row] as const).reverse());
    const ordered = orderClassPaths(paths);
    const hash = typeof window === 'undefined' ? '' : window.location.hash;
    return (
        <div data-testid="class-path-hero-list" className="space-y-3">
            {resume.error && <button type="button" className="min-h-11 text-sm text-indigo-700 underline" onClick={resume.retry}>
                {classPathText(lang, 'reload')}
            </button>}
            {ordered.map((path, index) => (
                <ClassPathHeroCard
                    key={path.id}
                    path={path}
                    pausedChats={paused}
                    drafts={drafts}
                    onReload={onReload}
                    collapsible={collapsed || ordered.length > 1}
                    defaultOpen={path.steps.some(step => hash === `#class-step-${step.id}`) || (!collapsed && index === 0)}
                    discussionLinks={discussions.forbidden || discussions.failed ? [] : discussions.data?.links || []}
                    meetings={meetings.meetings}
                    onMeetingsChanged={meetings.load}
                />
            ))}
            {showAllLink && (
                <div className="flex items-center justify-end">
                    <Link
                        href="/profilo/piani-operativi"
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-indigo-700 transition-colors hover:text-indigo-900 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                        <span>
                            {ordered.length > 1
                                ? `${classPathText(lang, 'seeAllClassPaths')} (${ordered.length})`
                                : classPathText(lang, 'seeAllClassPaths')}
                        </span>
                        <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                </div>
            )}
        </div>
    );
}
