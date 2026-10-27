'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { classPathText } from '@/lib/i18n-class-paths';
import { orderClassPaths, type StudentClassPath } from '@/lib/class-paths';
import { parseForumDiscussionLinks } from '@/lib/forum';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { ClassPathHeroCard } from '@/components/profile/ClassPathHeroCard';
import { useStudentMeetings } from './MeetingDetails';
import { useResumeEntries } from '@/lib/use-resume-entries';
import { latestPausedByTool } from '@/lib/catalog-status';

// Every published plan of the student: the priority one open, the others folded.
// A forum link to a step (#class-step-N) opens the plan holding it.
export function ClassPathHeroList({ paths, onReload, showAllLink = true }: {
    paths: StudentClassPath[];
    onReload?: () => Promise<void> | void;
    showAllLink?: boolean;
}) {
    const { lang } = useI18n();
    const discussions = useTeacherResource('/api/user/forum/links', parseForumDiscussionLinks);
    const meetings = useStudentMeetings();
    const resume = useResumeEntries();
    const paused = latestPausedByTool(resume.frozen.filter(row => !row.practice_notebook_id));
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
                    onReload={onReload}
                    collapsible={ordered.length > 1}
                    defaultOpen={index === 0 || path.steps.some(step => hash === `#class-step-${step.id}`)}
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
