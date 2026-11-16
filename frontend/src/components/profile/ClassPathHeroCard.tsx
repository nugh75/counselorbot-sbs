'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activityReturnHref, withActivityReturn, withActivityOptions } from '@/lib/path-activity';
import { chatPreferenceLabel, isEssentialInstrument } from '@/lib/chat-preferences';
import { pathActivityText } from '@/lib/i18n-path-activity';
import { Check, Lock, AlertCircle, ArrowRight, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { pathPublicationText } from '@/lib/i18n-path-publication';
import { apiFetch } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { Button, buttonClasses } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { classPathText, type PathTextKey } from '@/lib/i18n-class-paths';
import {
    lockedStepUnlockNumber,
    planStepHref,
    type StudentClassPath,
    type StudentClassPathStep,
} from '@/lib/class-paths';
import { dueHint, formatPlanDay, plannedDayLocation, plannedDayText } from '@/lib/class-path-schedule';
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
    /** With several plans, or a finished one, the card folds to its header and progress. */
    collapsible?: boolean;
    defaultOpen?: boolean;
    /** The student's forum links and meetings, loaded once by the list. */
    discussionLinks?: ForumDiscussionLink[];
    meetings?: ClassMeeting[] | null;
    onMeetingsChanged?: () => Promise<void> | void;
    /** Student home: header and the «To do now» block only; the rows live on the plans page. */
    nextOnly?: boolean;
}

type StepStatus = 'todo' | 'unfinished' | 'done' | 'unavailable';
interface StepAction { href: string; label: string; anchor?: boolean }

const STATUS_KEY: Record<StepStatus, PathTextKey> = {
    todo: 'statusTodo', unfinished: 'statusUnfinished', done: 'statusDone', unavailable: 'statusUnavailable',
};
const STATUS_TEXT: Record<StepStatus, string> = {
    todo: 'text-ink-muted', unfinished: 'font-semibold text-ochre-700', done: 'font-medium text-indigo-700', unavailable: 'text-ink-muted',
};

/** «Review» says what it shows: the saved results or the conversation. */
function actionLabel(lang: string, kind: string, label: string): string {
    if (label === 'review' && kind === 'questionnaire') return pathActivityText(lang, 'seeResults');
    if (label === 'review' && (kind === 'chat' || kind === 'analysis')) return pathActivityText(lang, 'rereadConversation');
    return pathActivityText(lang, label);
}

export function ClassPathHeroCard({ path, pausedChats, drafts, onReload, collapsible = false, defaultOpen = true, discussionLinks = [], meetings = null, onMeetingsChanged, nextOnly = false }: Props) {
    const { lang } = useI18n();
    const pathname = usePathname();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const pa = (key: string) => pathActivityText(lang, key);
    const [actionStepId, setActionStepId] = useState<number | null>(null);
    const [open, setOpen] = useState(defaultOpen);
    const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());
    const [selectedResults, setSelectedResults] = useState<Record<number, string>>({});
    const [selectedPaths, setSelectedPaths] = useState<Record<number, string>>({});
    const stepsId = useId();
    const expanded = !collapsible || open;
    const finished = path.total > 0 && path.done >= path.total;

    // A link back to a step (#class-step-N, also the return from an activity) opens its details.
    useEffect(() => {
        const sync = () => {
            const match = /^#class-step-(\d+)$/.exec(window.location.hash);
            if (match) setOpenSteps(current => new Set(current).add(Number(match[1])));
        };
        queueMicrotask(sync);
        window.addEventListener('hashchange', sync);
        return () => window.removeEventListener('hashchange', sync);
    }, []);

    const toggleStep = (id: number, force?: boolean) => setOpenSteps(current => {
        const next = new Set(current);
        if (force ?? !next.has(id)) next.add(id); else next.delete(id);
        return next;
    });

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
                toast.success(isDone ? l('markUndone') : l('statusDone'));
                if (onReload) await onReload();
            } else if (res.status === 422) {
                toast.error(l('statusUnavailable'));
            } else {
                toast.error(l('genericError'));
            }
        } catch {
            toast.error(l('genericError'));
        } finally {
            setActionStepId(null);
        }
    };

    // Everything a step row, its details and the «To do now» block need.
    const views = path.steps.map((step, index) => {
        const isDone = step.state === 'done';
        const isLocked = step.state === 'locked';
        const isUnavailable = step.state === 'unavailable';
        const blocked = isLocked || isUnavailable;
        const presentation = resolveStepPresentation(lang, step, {toolName: key => resolveClassPathToolName(key, lang), student: true});
        // Standalone chats share the instrument's saved activity. Analysis
        // and administration pages resolve their exact bound session themselves.
        const paused = step.start_href?.startsWith('/?start=') && step.tool_key
            ? pausedChats?.get(`${path.id}:${step.id}`) : undefined;
        const draft = drafts?.get(`${path.id}:${step.id}`);
        const inProgress = step.activity ? step.activity.current?.state === 'in_progress'
            : Boolean(paused) || draft !== undefined || step.attempt_state === 'in_progress';
        const status: StepStatus = blocked ? 'unavailable' : isDone ? 'done' : inProgress ? 'unfinished' : 'todo';
        const returnTo = activityReturnHref(pathname, step.id);
        const needsChoice = (step.activity?.choices?.length ?? 0) > 1 && !selectedResults[step.id];

        let primary: StepAction | null = null;
        let repeat: StepAction | null = null;
        if (!blocked && step.activity) {
            const activity = step.activity;
            if (activity.primary) primary = {
                href: withActivityReturn(withActivityOptions(activity.primary.href, selectedResults[step.id],
                    activity.primary.label === 'start' ? selectedPaths[step.id] : undefined), returnTo),
                label: actionLabel(lang, activity.kind, activity.primary.label),
            };
            if (activity.repeat) repeat = {
                href: withActivityReturn(withActivityOptions(activity.repeat.href, undefined, selectedPaths[step.id]), returnTo),
                label: pa(activity.repeat.label),
            };
        } else if (!blocked) {
            const canRepeat = step.step_type === 'guided_chat' || step.step_type === 'guided_results_chat'
                || step.step_type === 'questionnaire_administration' || step.step_type === 'assignment' || Boolean(step.start_href?.startsWith('/?start='));
            const [redoPath, redoHash] = (step.start_href || '').split('#', 2);
            const redoHref = step.start_href && (step.step_type === 'guided_results_chat' || step.step_type === 'questionnaire_administration' || step.step_type === 'assignment')
                ? `${redoPath}${redoPath.includes('?') ? '&' : '?'}attempt=new${redoHash ? `#${redoHash}` : ''}` : step.start_href;
            const resumeStepHref = draft && step.start_href ? `${step.start_href}${step.start_href.includes('?') ? '&' : '?'}attempt=${draft}` : step.start_href;
            const planHref = (href: string) => planStepHref(href, path.id, step.id);
            if (paused) {
                primary = {href: planHref(resumeHref(paused)), label: pa('resume'), anchor: true};
                if (resumeStepHref) repeat = {href: planHref(resumeStepHref), label: pa('anotherAttempt')};
            } else if (step.start_href && inProgress) {
                primary = {href: planHref(resumeStepHref!), label: pa('resume')};
                if (canRepeat && redoHref) repeat = {href: planHref(redoHref), label: pa('anotherAttempt')};
            } else if (step.start_href && isDone && canRepeat) {
                primary = {href: planHref(redoHref!), label: pa('anotherAttempt')};
            } else if (step.start_href) {
                primary = {href: planHref(resumeStepHref!), label: pa(isDone ? 'open' : 'start')};
            }
        }
        return {step, number: index + 1, isDone, isLocked, isUnavailable, blocked, presentation, inProgress, status, needsChoice, primary, repeat};
    });
    type StepView = (typeof views)[number];
    const nextView = finished ? undefined : views.find(view => view.step.id === path.next_step_id && !view.blocked);

    const actionLink = (action: StepAction, className: string, content: ReactNode) => action.anchor
        ? <a href={action.href} className={className}>{content}</a>
        : <Link href={action.href} className={className}>{content}</Link>;

    // Path options and the result choice come before the step's main action.
    const renderOptions = ({step}: StepView) => {
        const activity = step.activity;
        if (!activity || step.state === 'locked' || step.state === 'unavailable') return null;
        return <>
            {['chat', 'analysis'].includes(activity.kind) && isEssentialInstrument(activity.instrument_code || '') && <details className="group text-sm">
                <summary className="flex min-h-control cursor-pointer list-none items-center gap-2 text-ink-muted [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
                    {pa(activity.current ? 'newPathOptions' : 'pathOptions')}
                </summary>
                <label className="block">{chatPreferenceLabel(lang, 'choosePath')}
                    <select className="mt-1 min-h-control rounded-control border border-line-strong bg-surface p-2" value={selectedPaths[step.id] || 'complete'}
                        onChange={event => setSelectedPaths(current => ({...current, [step.id]: event.target.value}))}>
                        {(['complete', 'essential'] as const).map(mode => <option key={mode} value={mode}>{chatPreferenceLabel(lang, mode)}</option>)}
                    </select>
                </label>
            </details>}
            {(activity.choices?.length ?? 0) > 1 && <label className="block text-sm">
                {pa('chooseResult')}
                <select value={selectedResults[step.id] || ''}
                    onChange={event => setSelectedResults(current => ({...current, [step.id]: event.target.value}))}
                    className="mt-1 block min-h-control w-full rounded-control border border-line-strong bg-surface p-2">
                    <option value="" disabled>—</option>
                    {activity.choices!.map(result => <option key={result.id} value={result.id}>{new Date(result.submitted_at).toLocaleString(lang, {dateStyle: 'medium', timeStyle: 'short'})} · {result.locale.toUpperCase()}</option>)}
                </select>
            </label>}
        </>;
    };

    const renderSelfMark = ({step, isDone, blocked}: StepView) => {
        if (!step.can_self_mark || blocked) return null;
        if (step.step_type === 'forum') return (
            <label className="inline-flex min-h-control cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={isDone} disabled={actionStepId === step.id} onChange={() => void handleToggleDone(step)} />
                {pathForumText(lang, 'studentDone')}
            </label>
        );
        return (
            <Button variant={isDone ? 'ghost' : 'secondary'} disabled={actionStepId === step.id} onClick={() => void handleToggleDone(step)}>
                {isDone ? l('markUndone') : l('markDone')}
            </Button>
        );
    };

    const renderDetails = (view: StepView) => {
        const {step, presentation, isDone, isLocked, isUnavailable, blocked, inProgress, number} = view;
        // One date per step: the deadline, else the planned day; nothing once done.
        const dueDay = !isDone && presentation.showDueDate ? presentation.dueDate : null;
        const planned = !isDone && !dueDay ? plannedDayText(step, lang) : null;
        const plannedLocation = !isDone ? plannedDayLocation(step) : null;
        const hint = dueHint(dueDay);
        const returnTo = activityReturnHref(pathname, step.id);
        const isNext = view === nextView;
        const previous = step.activity?.attempts.filter(attempt => attempt.session_id !== step.activity?.current?.session_id) ?? [];
        return <div className="space-y-2 pb-1 pl-9">
            {isUnavailable && <p className="text-sm text-ink-body">{pathPublicationText(lang, 'studentUnavailable')}</p>}
            {isLocked && <p className="text-sm text-ink-body">
                {l('unlocksAfter').replace('{n}', String(lockedStepUnlockNumber(path) ?? number - 1))}
            </p>}
            {presentation.titleSource === 'override' && presentation.title !== presentation.derivedTitle && (
                <p className="text-sm text-ink-muted">{presentation.derivedTitle}</p>
            )}
            {presentation.note && <p className="whitespace-pre-wrap text-sm text-ink-body">{presentation.note}</p>}
            {step.step_type === 'assignment' && !isUnavailable && (
                <p className="text-sm text-ink-muted">{pathAssignmentText(lang, 'studentRule')}</p>
            )}
            {step.step_type === 'forum' && !isUnavailable && (() => {
                const notice = forumStepNotice(step.forum_state, isDone);
                return (<>
                    <p className="text-sm text-ink-muted">{pathForumText(lang, 'studentRule')}</p>
                    {notice && <p role="status" className="text-sm font-semibold text-ink-body">{pathForumText(lang, `notice_${notice}`)}</p>}
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
                        && <p className="text-sm text-ink-muted">{classMeetingText(lang, 'studentRule')}</p>}
                </>);
            })()}
            <ForumDiscussionLinks links={discussionLinks} kind="path_step" targetId={step.id} />
            {isDone && inProgress && <p className="text-sm text-ink-body">{pa('restarted')}</p>}

            {(planned || plannedLocation || dueDay || (isDone && step.source && step.source !== 'automatic')) && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                    {planned && <span>{l('plannedOn').replace('{date}', planned)}</span>}
                    {plannedLocation && <span>{l('placeLabel').replace('{place}', plannedLocation)}</span>}
                    {dueDay && <span>{l('dueOn').replace('{date}', formatPlanDay(dueDay, lang))}</span>}
                    {hint && <span className={hint.kind === 'late' ? 'inline-flex items-center gap-1 font-semibold text-danger-ink' : 'font-semibold text-ink-body'}>
                        {hint.kind === 'late' && <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                        {hint.kind === 'late' ? l('dueLate') : hint.kind === 'today' ? l('dueToday')
                            : hint.days === 1 ? l('dueTomorrow') : l('dueInDays').replace('{n}', String(hint.days))}
                    </span>}
                    {isDone && step.source === 'teacher' && <span>{l('markedByTeacher')}</span>}
                    {isDone && step.source === 'student' && <span>{l('markedByYou')}</span>}
                </p>
            )}

            {!isNext && renderOptions(view)}
            {view.repeat && actionLink(view.repeat, 'inline-flex min-h-control items-center text-sm font-semibold text-link underline', view.repeat.label)}
            {!blocked && previous.length > 0 && <details className="group text-sm">
                <summary className="flex min-h-control cursor-pointer list-none items-center gap-2 font-semibold text-link [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
                    {`${pa('history')} (${previous.length})`}
                </summary>
                <ul className="divide-y divide-line">{previous.map(attempt => <li key={attempt.session_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{attempt.started_at ? new Date(attempt.started_at).toLocaleString(lang, {dateStyle: 'medium', timeStyle: 'short'}) : ''} · {l(attempt.state === 'completed' ? 'statusDone' : 'statusUnfinished')}</span>
                    <Link className="inline-flex min-h-control items-center px-2 font-semibold text-link underline" href={withActivityReturn(attempt.href, returnTo)}>
                        {attempt.state === 'completed' ? actionLabel(lang, step.activity!.kind, 'review') : pa('resume')}
                    </Link>
                </li>)}</ul>
            </details>}
            {!isNext && renderSelfMark(view)}
        </div>;
    };

    return (
        <Card
            as="section"
            variant="flat"
            data-testid="class-path-hero-card"
            className="space-y-6"
        >
            {/* Header: who assigned it, title and progress. */}
            <div className={`space-y-3 ${expanded && !nextOnly ? 'border-b border-line/80 pb-4' : ''}`}>
                <p className="text-sm text-ink-muted">{l('assignedEyebrow').replace('{name}', path.group_name)}</p>
                <div>
                    <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                        {collapsible ? (
                            <button
                                type="button"
                                onClick={() => setOpen(value => !value)}
                                aria-expanded={open}
                                aria-controls={open ? stepsId : undefined}
                                className="group flex min-h-control w-full items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <ChevronRight
                                    className={`h-5 w-5 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`}
                                    aria-hidden
                                />
                                <span className="group-hover:text-link">{path.title}</span>
                            </button>
                        ) : path.title}
                    </h2>
                    {expanded && !nextOnly && path.description && (
                        <p className="mt-1 text-sm text-ink-muted">{path.description}</p>
                    )}
                    {expanded && !nextOnly && !finished && <p className="mt-1 text-sm text-ink-muted">{l('studentIntro')}</p>}
                </div>

                {finished ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-success-ink" data-plan-complete>
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        {l('planComplete')}
                    </p>
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-ink-muted">{progressLabel}</p>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                            <div
                                className="h-full rounded-full bg-brand transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                                role="progressbar"
                                aria-valuenow={path.done}
                                aria-valuemin={0}
                                aria-valuemax={path.total}
                                aria-label={progressLabel}
                            />
                        </div>
                    </div>
                )}
            </div>

            {expanded && <div id={stepsId} className="space-y-6">
                {/* One clear next step with the card's only filled button. */}
                {nextView && (
                    <div data-testid="class-path-do-now" className="space-y-3 border-l-2 border-ochre-600 pl-4">
                        <p className="text-sm font-semibold text-ochre-700">{l('doNow')}</p>
                        <div>
                            <p className="text-base font-semibold text-ink">{nextView.presentation.title}</p>
                            <p className="text-xs text-ink-muted">{l(STATUS_KEY[nextView.status])}</p>
                        </div>
                        {renderOptions(nextView)}
                        <div className="flex flex-wrap items-center gap-2">
                            {nextView.primary ? (nextView.needsChoice
                                ? <Button disabled className="w-full sm:w-auto">{nextView.primary.label}<ArrowRight className="h-4 w-4" aria-hidden /></Button>
                                : actionLink(nextView.primary, buttonClasses('primary', 'md', 'w-full sm:w-auto'),
                                    <>{nextView.primary.label}<ArrowRight className="h-4 w-4" aria-hidden /></>))
                                : nextOnly ? <Link href={`/profilo/piani-operativi#class-step-${nextView.step.id}`} className={buttonClasses('primary', 'md', 'w-full sm:w-auto')}>{l('showDetails')}</Link>
                                : <Button className="w-full sm:w-auto" onClick={() => {
                                    toggleStep(nextView.step.id, true);
                                    requestAnimationFrame(() => document.getElementById(`class-step-${nextView.step.id}`)?.scrollIntoView({block: 'center'}));
                                }}>{l('showDetails')}</Button>}
                            {renderSelfMark(nextView)}
                        </div>
                    </div>
                )}

                {/* Compact rows: status, title and one action; details on demand. */}
                {!nextOnly && <div className="divide-y divide-line">
                    {views.map(view => {
                        const {step, number, status, isDone} = view;
                        const isCurrent = view === nextView;
                        const detailsOpen = openSteps.has(step.id);
                        const detailsId = `${stepsId}-step-${step.id}`;
                        return (
                            <div key={step.id} id={`class-step-${step.id}`} className="py-3">
                                <div className="flex items-start gap-3">
                                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
                                        {isDone ? (
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white">
                                                <Check className="h-3 w-3" />
                                            </span>
                                        ) : view.isLocked ? (
                                            <Lock className="h-4 w-4 text-slate-500" />
                                        ) : view.isUnavailable ? (
                                            <AlertCircle className="h-4 w-4 text-slate-500" />
                                        ) : (
                                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold ${isCurrent ? 'bg-ochre-600 text-white ring-4 ring-ochre-600/15' : 'border border-line-strong text-ink-muted'}`}>
                                                {number}
                                            </span>
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-base font-semibold text-ink">
                                            <button
                                                type="button"
                                                onClick={() => toggleStep(step.id)}
                                                aria-expanded={detailsOpen}
                                                aria-controls={detailsOpen ? detailsId : undefined}
                                                className="group flex min-h-control w-full items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                            >
                                                <span className="sr-only">{`${number}. `}</span>
                                                <span className="min-w-0 group-hover:text-link">{view.presentation.title}</span>
                                                <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${detailsOpen ? 'rotate-90' : ''}`} aria-hidden />
                                            </button>
                                        </h3>
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-step-status>
                                            <span className={STATUS_TEXT[status]}>{l(STATUS_KEY[status])}</span>
                                            {view.primary && <>
                                                <span aria-hidden className="text-ink-muted">·</span>
                                                {view.needsChoice
                                                    ? <button type="button" className="inline-flex min-h-control items-center font-semibold text-link underline" onClick={() => toggleStep(step.id, true)}>{view.primary.label}</button>
                                                    : actionLink(view.primary, 'inline-flex min-h-control items-center font-semibold text-link underline', view.primary.label)}
                                            </>}
                                        </p>
                                    </div>
                                </div>
                                {detailsOpen && <div id={detailsId}>{renderDetails(view)}</div>}
                            </div>
                        );
                    })}
                </div>}
            </div>}
        </Card>
    );
}
