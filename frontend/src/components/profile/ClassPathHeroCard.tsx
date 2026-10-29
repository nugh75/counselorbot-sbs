'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activityReturnHref, withActivityReturn, withActivityOptions } from '@/lib/path-activity';
import { chatPreferenceLabel, isEssentialInstrument } from '@/lib/chat-preferences';
import { pathActivityText } from '@/lib/i18n-path-activity';
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
import { pathAssignmentText } from '@/lib/i18n-path-assignments';
import { pathForumText } from '@/lib/i18n-path-forum';
import { forumStepNotice } from '@/lib/path-forum';
import { classMeetingText } from '@/lib/i18n-class-meetings';
import type { ForumDiscussionLink } from '@/lib/forum';
import type { ClassMeeting } from '@/lib/class-meetings';
import { ForumDiscussionLinks } from '@/components/forum/ForumDiscussionLinks';
import { MeetingDetails } from './MeetingDetails';
import { resolveStepPresentation } from '@/lib/class-path-presentation';
import type { FrozenSessionSummary } from '@/lib/frozen-session';
import { resumeHref } from '@/lib/use-resume-entries';

interface Props {
    path: StudentClassPath;
    pausedChats?: Map<string, FrozenSessionSummary>;
    drafts?: Map<string, string>;
    onReload?: () => Promise<void> | void;
    /** With several plans each card folds to its header and progress. */
    collapsible?: boolean;
    defaultOpen?: boolean;
    /** The student's forum links and meetings, loaded once by the list. */
    discussionLinks?: ForumDiscussionLink[];
    meetings?: ClassMeeting[] | null;
    onMeetingsChanged?: () => Promise<void> | void;
}

export function ClassPathHeroCard({ path, pausedChats, drafts, onReload, collapsible = false, defaultOpen = true, discussionLinks = [], meetings = null, onMeetingsChanged }: Props) {
    const { lang, t } = useI18n();
    const pathname = usePathname();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const [actionStepId, setActionStepId] = useState<number | null>(null);
    const [open, setOpen] = useState(defaultOpen);
    const [selectedResults, setSelectedResults] = useState<Record<number, string>>({});
    const [selectedPaths, setSelectedPaths] = useState<Record<number, string>>({});
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
            {/* Header: class, title and independent progress. */}
            <div className={`space-y-3 ${expanded ? 'border-b border-slate-200/80 pb-4 dark:border-slate-800' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {`${l('yourClassPath')} · ${path.group_name}`}
                    </span>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-300">{t('piano.builder.independentSteps')}</p>
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
                    const presentation = resolveStepPresentation(lang, step, {toolName: key => resolveClassPathToolName(key, lang)});
                    const titleDisplay = presentation.title;
                    const isActionBusy = actionStepId === step.id;
                    const planned = plannedDayText(step, lang);
                    const plannedLocation = plannedDayLocation(step);
                    // Standalone chats share the instrument's saved activity. Analysis
                    // and administration pages resolve their exact bound session themselves.
                    const paused = step.start_href?.startsWith('/?start=') && step.tool_key
                        ? pausedChats?.get(`${path.id}:${step.id}`) : undefined;
                    const draft = drafts?.get(`${path.id}:${step.id}`);
                    const inProgress = step.activity ? step.activity.current?.state === 'in_progress'
                        : Boolean(paused) || draft !== undefined || step.attempt_state === 'in_progress';
                    const returnTo = activityReturnHref(pathname, step.id);
                    const canRepeat = step.step_type === 'guided_chat' || step.step_type === 'guided_results_chat'
                        || step.step_type === 'questionnaire_administration' || step.step_type === 'assignment' || Boolean(step.start_href?.startsWith('/?start='));
                    const [redoPath, redoHash] = (step.start_href || '').split('#', 2);
                    const redoHref = step.start_href && (step.step_type === 'guided_results_chat' || step.step_type === 'questionnaire_administration' || step.step_type === 'assignment')
                        ? `${redoPath}${redoPath.includes('?') ? '&' : '?'}attempt=new${redoHash ? `#${redoHash}` : ''}` : step.start_href;
                    const resumeStepHref = draft && step.start_href ? `${step.start_href}${step.start_href.includes('?') ? '&' : '?'}attempt=${draft}` : step.start_href;

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
                                                aria-label={l(inProgress ? 'current' : 'next')}
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
                                                    {isDone && inProgress ? pathActivityText(lang, 'newInProgress') : l(inProgress ? 'current' : 'next')}
                                                </span>
                                            )}
                                            {isDone && (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                    {l('completed')}
                                                </span>
                                            )}
                                            {inProgress && !isCurrent && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                                                {pathActivityText(lang, isDone ? 'newInProgress' : 'inProgress')}
                                            </span>}
                                            {isUnavailable && (
                                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                    {l('notAvailable')}
                                                </span>
                                            )}
                                        </div>
                                        {isUnavailable && (
                                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{pathPublicationText(lang, 'studentUnavailable')}</p>
                                        )}

                                        {presentation.titleSource === 'override' && presentation.title !== presentation.derivedTitle && (
                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                {presentation.derivedTitle}
                                            </p>
                                        )}

                                        {presentation.note && (
                                            <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                                                {presentation.note}
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
                                        {step.step_type === 'meeting' && step.meeting_summary && !isUnavailable && (() => {
                                            // The student's own view of the meeting carries slots and booking (#176).
                                            const meeting = meetings?.find(row => row.id === step.meeting_id) ?? step.meeting_summary;
                                            return (<>
                                                <MeetingDetails lang={lang} meeting={meeting} attended={isDone}
                                                    onChanged={async () => { await Promise.all([onReload?.(), onMeetingsChanged?.()]); }} />
                                                {/* The rule matters once it can be followed: started, not yet marked. */}
                                                {!isDone && meeting.status === 'scheduled' && meeting.kind === 'group' && meeting.attendance_mode !== 'teacher' && meeting.starts_at
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
                                            {presentation.showDueDate && presentation.dueDate && (
                                                <span>{l('dueOn').replace('{date}', presentation.dueDate)}</span>
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
                                <div className="flex flex-wrap items-center gap-2 pt-2 sm:max-w-md sm:shrink-0 sm:justify-end sm:pt-0">
                                    {step.activity && !isLocked && !isUnavailable && <>
                                        {['chat', 'analysis'].includes(step.activity.kind) && isEssentialInstrument(step.activity.instrument_code || '') && <details className="basis-full text-sm">
                                            <summary className="cursor-pointer py-2 text-slate-600">{pathActivityText(lang, step.activity.current ? 'newPathOptions' : 'pathOptions')}</summary>
                                            <label className="block">{chatPreferenceLabel(lang, 'choosePath')}
                                                <select className="mt-1 rounded-md border border-slate-300 p-2" value={selectedPaths[step.id] || 'complete'}
                                                    onChange={event => setSelectedPaths(current => ({...current, [step.id]: event.target.value}))}>
                                                    {(['complete', 'essential'] as const).map(mode => <option key={mode} value={mode}>{chatPreferenceLabel(lang, mode)}</option>)}
                                                </select>
                                            </label>
                                        </details>}
                                        {(step.activity.choices?.length ?? 0) > 1 && <label className="basis-full text-sm">
                                            {pathActivityText(lang, 'chooseResult')}
                                            <select value={selectedResults[step.id] || ''}
                                                onChange={event => setSelectedResults(current => ({...current, [step.id]: event.target.value}))}
                                                className="mt-1 block w-full rounded-md border border-slate-300 p-2">
                                                <option value="">{pathActivityText(lang, 'chooseResult')}</option>
                                                {step.activity.choices!.map(result => <option key={result.id} value={result.id}>{new Date(result.submitted_at).toLocaleString(lang)} · {result.locale.toUpperCase()}</option>)}
                                            </select>
                                        </label>}
                                        {step.activity.primary && <Link href={withActivityReturn(withActivityOptions(step.activity.primary.href,
                                            selectedResults[step.id], step.activity.primary.label === 'start' ? selectedPaths[step.id] : undefined), returnTo)}
                                            aria-disabled={(step.activity.choices?.length ?? 0) > 1 && !selectedResults[step.id]}
                                            onClick={event => { if ((step.activity?.choices?.length ?? 0) > 1 && !selectedResults[step.id]) event.preventDefault(); }}
                                            className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${isCurrent ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                                            {pathActivityText(lang, step.activity.primary.label)}<ArrowRight className="h-4 w-4" aria-hidden />
                                        </Link>}
                                        {step.activity.repeat && <Link href={withActivityReturn(withActivityOptions(step.activity.repeat.href, undefined, selectedPaths[step.id]), returnTo)}
                                            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                            {pathActivityText(lang, step.activity.repeat.label)}
                                        </Link>}
                                        {step.activity.attempts.length > 0 && <details className="basis-full text-sm sm:ml-auto">
                                            <summary className="cursor-pointer py-2 font-medium text-indigo-700">{pathActivityText(lang, 'history')} ({step.activity.attempts.length})</summary>
                                            <ul className="space-y-2">{step.activity.attempts.map(attempt => <li key={attempt.session_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-2">
                                                <span>{attempt.started_at ? new Date(attempt.started_at).toLocaleString(lang) : ''} · {pathActivityText(lang, attempt.state === 'completed' ? 'completed' : 'inProgress')}</span>
                                                <Link className="inline-flex min-h-11 items-center px-2 font-semibold text-indigo-700 underline" href={withActivityReturn(attempt.href, returnTo)}>
                                                    {pathActivityText(lang, attempt.state === 'completed' ? 'review' : 'resume')}
                                                </Link>
                                            </li>)}</ul>
                                        </details>}
                                    </>}
                                    {!step.activity && paused && !isLocked && !isUnavailable && <a
                                        href={planStepHref(resumeHref(paused), path.id, step.id)}
                                        className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                                    >{l('resume')}</a>}
                                    {!step.activity && step.start_href && !isLocked && !isUnavailable && (
                                        <Link href={planStepHref(!inProgress && isDone && canRepeat ? redoHref! : resumeStepHref!, path.id, step.id)}>
                                            <Button
                                                variant={isCurrent ? 'accent' : 'secondary'}
                                                size="sm"
                                            >
                                                {inProgress && !paused ? l('resume') : canRepeat && (isDone || paused) ? l('redo') : isDone ? l('reopen') : l('start')}
                                                <ArrowRight className="h-4 w-4" aria-hidden />
                                            </Button>
                                        </Link>
                                    )}
                                    {!step.activity && inProgress && !paused && canRepeat && redoHref && !isLocked && !isUnavailable && (
                                        <Link href={planStepHref(redoHref, path.id, step.id)}><Button variant="secondary" size="sm">{l('redo')}</Button></Link>
                                    )}

                                    {step.can_self_mark && step.step_type === 'forum' && !isUnavailable && !isLocked && (
                                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                                            <input type="checkbox" checked={isDone} disabled={isActionBusy} onChange={() => void handleToggleDone(step)} />
                                            {pathForumText(lang, 'studentDone')}
                                        </label>
                                    )}
                                    {step.can_self_mark && step.step_type !== 'forum' && !isUnavailable && !isLocked && (
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
