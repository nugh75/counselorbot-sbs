'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Lock, AlertCircle, ArrowRight, Play, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { pathPublicationText } from '@/lib/i18n-path-publication';
import { apiFetch } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { classPathText, type PathTextKey } from '@/lib/i18n-class-paths';
import {
    lockedStepUnlockNumber,
    planStepHref,
    type StudentClassPath,
    type StudentClassPathStep,
} from '@/lib/class-paths';
import { plannedDayLocation, plannedDayText } from '@/lib/class-path-schedule';
import { resolveClassPathToolName } from '@/lib/class-paths-tool-names';
import { typedStepTargetLabel } from '@/lib/i18n-administration-steps';
import { pathAssignmentText } from '@/lib/i18n-path-assignments';
import { pathForumText } from '@/lib/i18n-path-forum';
import { forumStepNotice } from '@/lib/path-forum';
import { classMeetingText } from '@/lib/i18n-class-meetings';
import { stepKindText } from '@/lib/i18n-step-kinds';
import type { ForumDiscussionLink } from '@/lib/forum';
import type { ClassMeeting } from '@/lib/class-meetings';
import { ForumDiscussionLinks } from '@/components/forum/ForumDiscussionLinks';
import { MeetingDetails } from './MeetingDetails';

interface Props {
    path: StudentClassPath;
    onReload?: () => Promise<void> | void;
    /** With several plans each card folds to its header and progress. */
    collapsible?: boolean;
    defaultOpen?: boolean;
    /** The student's forum links and meetings, loaded once by the list. */
    discussionLinks?: ForumDiscussionLink[];
    meetings?: ClassMeeting[] | null;
    onMeetingsChanged?: () => Promise<void> | void;
}

export function ClassPathHeroCard({ path, onReload, collapsible = false, defaultOpen = true, discussionLinks = [], meetings = null, onMeetingsChanged }: Props) {
    const { lang } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const [actionStepId, setActionStepId] = useState<number | null>(null);
    const [open, setOpen] = useState(defaultOpen);
    const stepsId = useId();
    const expanded = !collapsible || open;

    const progressPercent = path.total > 0 ? Math.min(100, Math.round((path.done / path.total) * 100)) : 0;
    const progressLabel = l('progressCount')
        .replace('{done}', String(path.done))
        .replace('{total}', String(path.total));

    const handleToggleDone = async (step: StudentClassPathStep) => {
        if (actionStepId !== null) return;
        setActionStepId(step.id);
        const isDone = step.state === 'done';
        const method = isDone ? 'DELETE' : 'POST';

        try {
            const res = await apiFetch(`/api/user/paths/${path.id}/steps/${step.id}/done`, {
                method,
            });
            if (res.ok) {
                toast.success(isDone ? l('markUndone') : l('completed'));
                if (onReload) await onReload();
            } else if (res.status === 422) {
                toast.error(l('notAvailable'));
            } else {
                toast.error(l('genericError'));
            }
        } catch {
            toast.error(l('genericError'));
        } finally {
            setActionStepId(null);
        }
    };

    return (
        <Card
            data-testid="class-path-hero-card"
            className="space-y-6 border-indigo-200 shadow-sm dark:border-indigo-800"
        >
            {/* Header: Class label, Mode, Title, Progress */}
            <div className={`space-y-3 ${expanded ? 'border-b border-slate-200/80 pb-4 dark:border-slate-800' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {`${l('yourClassPath')} · ${path.group_name}`}
                    </span>
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            path.mode === 'strict'
                                ? 'border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                    >
                        {path.mode === 'strict' ? l('strictBadge') : l('recommendedBadge')}
                    </span>
                </div>

                <div>
                    <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                        {collapsible ? (
                            <button
                                type="button"
                                onClick={() => setOpen(value => !value)}
                                aria-expanded={open}
                                aria-controls={open ? stepsId : undefined}
                                className="group flex min-h-11 w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                            >
                                <ChevronRight
                                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? 'rotate-90' : ''}`}
                                    aria-hidden
                                />
                                <span className="group-hover:text-indigo-700 dark:group-hover:text-indigo-400">{path.title}</span>
                            </button>
                        ) : path.title}
                    </h2>
                    {expanded && path.description && (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{path.description}</p>
                    )}
                </div>

                <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                        <span>{progressLabel}</span>
                        <span>{`${progressPercent}%`}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                            role="progressbar"
                            aria-valuenow={path.done}
                            aria-valuemin={0}
                            aria-valuemax={path.total}
                            aria-label={progressLabel}
                        />
                    </div>
                </div>
            </div>

            {/* Steps List */}
            {expanded && <div id={stepsId} className="space-y-3">
                {path.steps.map((step, index) => {
                    const stepNumber = index + 1;
                    const isCurrent = step.id === path.next_step_id;
                    const isDone = step.state === 'done';
                    const isLocked = step.state === 'locked';
                    const isUnavailable = step.state === 'unavailable';
                    const toolDisplayName = typedStepTargetLabel(lang, step) ?? resolveClassPathToolName(step.tool_key, lang);
                    const titleDisplay = step.title ? step.title : toolDisplayName;
                    const isActionBusy = actionStepId === step.id;
                    const planned = plannedDayText(step, lang);
                    const plannedLocation = plannedDayLocation(step);

                    const containerClasses = isCurrent
                        ? 'border-indigo-300 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-200 dark:border-indigo-800 dark:bg-indigo-950/30 dark:ring-indigo-900'
                        : isDone
                        ? 'border-slate-200 bg-white hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900'
                        : isUnavailable
                        ? 'border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-800 dark:bg-slate-900'
                        : isLocked
                        ? 'border-dashed border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-800 dark:bg-slate-900'
                        : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';

                    return (
                        <div
                            key={step.id}
                            id={`class-step-${step.id}`}
                            className={`rounded-xl border p-4 transition-colors ${containerClasses}`}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                {/* Left side: indicator, titles */}
                                <div className="flex min-w-0 items-start gap-3">
                                    <div className="mt-0.5 flex shrink-0 items-center justify-center">
                                        {isCurrent ? (
                                            <span
                                                className="flex h-7 w-7 items-center justify-center rounded-full bg-ochre-600 text-xs font-bold text-white shadow-xs"
                                                aria-label={l('current')}
                                            >
                                                <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                                            </span>
                                        ) : isDone ? (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                                                <CheckCircle2 className="h-4 w-4" aria-hidden />
                                            </span>
                                        ) : isLocked ? (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                <Lock className="h-4 w-4" aria-hidden />
                                            </span>
                                        ) : isUnavailable ? (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                                <AlertCircle className="h-4 w-4" aria-hidden />
                                            </span>
                                        ) : (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                                {stepNumber}
                                            </span>
                                        )}
                                    </div>

                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                {`[${stepNumber}]`}
                                            </span>
                                            <h3
                                                className={`text-base font-semibold ${
                                                    isCurrent
                                                        ? 'text-indigo-900 dark:text-indigo-200'
                                                        : 'text-slate-800 dark:text-slate-100'
                                                }`}
                                            >
                                                {titleDisplay}
                                            </h3>

                                            {isCurrent && (
                                                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                                                    {l('current')}
                                                </span>
                                            )}
                                            {isDone && (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                    {l('completed')}
                                                </span>
                                            )}
                                            {isUnavailable && (
                                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                    {l('notAvailable')}
                                                </span>
                                            )}
                                        </div>
                                        {isUnavailable && (
                                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{pathPublicationText(lang, 'studentUnavailable')}</p>
                                        )}

                                        {step.title && step.title !== toolDisplayName && (
                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                {toolDisplayName}
                                            </p>
                                        )}

                                        {step.instructions && (
                                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                                {step.instructions}
                                            </p>
                                        )}
                                        {step.step_type === 'assignment' && !isUnavailable && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{pathAssignmentText(lang, 'studentRule')}</p>
                                        )}
                                        {step.step_type === 'forum' && !isUnavailable && (() => {
                                            const notice = forumStepNotice(step.forum_state, isDone);
                                            return (<>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{pathForumText(lang, 'studentRule')}</p>
                                                {notice && <p role="status" className="text-xs font-medium text-slate-700 dark:text-slate-300">{pathForumText(lang, `notice_${notice}`)}</p>}
                                            </>);
                                        })()}
                                        {step.step_type === 'meeting' && step.follows_step_id != null && (() => {
                                            const chatIndex = path.steps.findIndex(row => row.id === step.follows_step_id);
                                            return chatIndex >= 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{`${stepKindText(lang, 'followsChat')} [${chatIndex + 1}]`}</p>;
                                        })()}
                                        {step.step_type === 'meeting' && step.meeting_summary && !isUnavailable && (() => {
                                            // The student's own view of the meeting carries slots and booking (#176).
                                            const meeting = meetings?.find(row => row.id === step.meeting_id) ?? step.meeting_summary;
                                            return (<>
                                                <MeetingDetails lang={lang} meeting={meeting} attended={isDone}
                                                    onChanged={async () => { await Promise.all([onReload?.(), onMeetingsChanged?.()]); }} />
                                                {/* The rule matters once it can be followed: started, not yet marked. */}
                                                {!isDone && meeting.status === 'scheduled' && meeting.kind === 'group' && meeting.starts_at
                                                    && new Date(meeting.starts_at).getTime() <= Date.now()
                                                    && <p className="text-xs text-slate-500 dark:text-slate-400">{classMeetingText(lang, 'studentRule')}</p>}
                                            </>);
                                        })()}
                                        <ForumDiscussionLinks links={discussionLinks} kind="path_step" targetId={step.id} />

                                        {isLocked && (
                                            <p className="text-xs italic text-slate-500 dark:text-slate-400">
                                                {l('unlocksAfter').replace(
                                                    '{n}',
                                                    String(lockedStepUnlockNumber(path) ?? stepNumber - 1)
                                                )}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                            {planned && (
                                                <span>
                                                    {l('plannedOn').replace('{date}', planned)}
                                                    {plannedLocation ? ` · ${plannedLocation}` : ''}
                                                </span>
                                            )}
                                            {step.due_date && (
                                                <span>{l('dueOn').replace('{date}', step.due_date)}</span>
                                            )}
                                            {isDone && step.source && (
                                                <span>
                                                    {step.source === 'teacher'
                                                        ? l('sourceTeacher')
                                                        : step.source === 'automatic'
                                                        ? l('sourceAutomatic')
                                                        : l('sourceStudent')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right side: actions */}
                                <div className="flex flex-wrap items-center gap-2 pt-2 sm:shrink-0 sm:justify-end sm:pt-0">
                                    {step.start_href && !isLocked && !isUnavailable && (
                                        <Link href={planStepHref(step.start_href)}>
                                            <Button
                                                variant={isCurrent ? 'accent' : 'secondary'}
                                                size="sm"
                                            >
                                                {isDone ? l('reopen') : l('start')}
                                                <ArrowRight className="h-4 w-4" aria-hidden />
                                            </Button>
                                        </Link>
                                    )}

                                    {step.can_self_mark && !isUnavailable && !isLocked && (
                                        <Button
                                            variant={isDone ? 'ghost' : 'secondary'}
                                            size="sm"
                                            disabled={isActionBusy}
                                            onClick={() => void handleToggleDone(step)}
                                        >
                                            {isDone ? l('markUndone') : l('markDone')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>}
        </Card>
    );
}
