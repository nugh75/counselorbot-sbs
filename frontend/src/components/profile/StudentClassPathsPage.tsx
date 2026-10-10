'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Lock, AlertCircle, ArrowRight, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { pathPublicationText } from '@/lib/i18n-path-publication';
import { apiFetch } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { classPathText, type PathTextKey } from '@/lib/i18n-class-paths';
import { lockedStepUnlockNumber, parseStudentClassPaths, type StudentClassPath, type StudentClassPathStep } from '@/lib/class-paths';
import { resolveClassPathToolName } from '@/lib/class-paths-tool-names';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { parseForumDiscussionLinks } from '@/lib/forum';
import { ForumDiscussionLinks } from '@/components/forum/ForumDiscussionLinks';
import { MeetingDetails } from './MeetingDetails';
import { classMeetingText } from '@/lib/i18n-class-meetings';
import { typedStepTargetLabel } from '@/lib/i18n-administration-steps';
import { pathAssignmentText } from '@/lib/i18n-path-assignments';
import { pathForumText } from '@/lib/i18n-path-forum';
import { forumStepNotice } from '@/lib/path-forum';

export function StudentClassPathsPage() {
    const { lang } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const discussions = useTeacherResource('/api/user/forum/links', parseForumDiscussionLinks);

    const [paths, setPaths] = useState<StudentClassPath[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [actionStepId, setActionStepId] = useState<number | null>(null);

    const loadPaths = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await apiFetch('/api/user/paths');
            if (!res.ok) throw new Error('Failed to load student paths');
            const data = await res.json();
            setPaths(parseStudentClassPaths(data));
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadPaths();
    }, [loadPaths]);

    const handleToggleDone = async (pathId: number, step: StudentClassPathStep) => {
        if (actionStepId !== null) return;
        setActionStepId(step.id);
        const isDone = step.state === 'done';
        const method = isDone ? 'DELETE' : 'POST';

        try {
            const res = await apiFetch(`/api/user/paths/${pathId}/steps/${step.id}/done`, {
                method,
            });
            if (res.ok) {
                toast.success(isDone ? l('markUndone') : l('completed'));
                await loadPaths();
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

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-36 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }

    if (error) {
        return (
            <Callout variant="danger">
                <p>{l('loadError')}</p>
                <Button variant="secondary" onClick={() => void loadPaths()}>
                    {l('reload')}
                </Button>
            </Callout>
        );
    }

    if (paths.length === 0) {
        return (
            <Card className="py-12 text-center">
                <p className="text-sm text-slate-500">{l('studentPathsEmpty')}</p>
            </Card>
        );
    }

    return (
        <div className="space-y-8">
            {paths.map(path => {
                const progressPercent = path.total > 0 ? Math.min(100, Math.round((path.done / path.total) * 100)) : 0;
                const progressLabel = l('progressCount')
                    .replace('{done}', String(path.done))
                    .replace('{total}', String(path.total));

                return (
                    <Card key={path.id} className="space-y-6 border border-slate-200 shadow-xs">
                        {/* Header: Class, title, progress bar */}
                        <div className="space-y-3 border-b border-slate-100 pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                                    {path.group_name}
                                </span>
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                        path.mode === 'strict'
                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                            : 'bg-slate-100 text-slate-600'
                                    }`}
                                >
                                    {path.mode === 'strict' ? l('strictBadge') : l('recommendedBadge')}
                                </span>
                            </div>

                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-slate-900">{path.title}</h2>
                                {path.description && (
                                    <p className="mt-1 text-sm text-slate-600">{path.description}</p>
                                )}
                            </div>

                            <div className="space-y-1.5 pt-1">
                                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                                    <span>{progressLabel}</span>
                                    <span>{`${progressPercent}%`}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
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
                        <div className="space-y-3">
                            {path.steps.map((step, index) => {
                                const stepNumber = index + 1;
                                const isCurrent = step.id === path.next_step_id;
                                const isDone = step.state === 'done';
                                const isLocked = step.state === 'locked';
                                const isUnavailable = step.state === 'unavailable';
                                const toolDisplayName = typedStepTargetLabel(lang, step) ?? resolveClassPathToolName(step.tool_key, lang);
                                const titleDisplay = step.title ? step.title : toolDisplayName;
                                const isActionBusy = actionStepId === step.id;

                                // State-based styles matching ASCII §8.3 & Design Rules
                                // The current step is a petrol card; ochre stays on its play icon and badge only
                                const containerClasses = isCurrent
                                    ? 'border-indigo-600 bg-white shadow-xs'
                                    : isDone
                                    ? 'border-slate-200 bg-white hover:bg-slate-50/50'
                                    : isUnavailable
                                    ? 'border-slate-200 bg-slate-50/60 opacity-60'
                                    : isLocked
                                    ? 'border-dashed border-slate-200 bg-slate-50/60 opacity-60'
                                    : 'border-slate-200 bg-white';

                                return (
                                    <div
                                        key={step.id}
                                        id={`class-step-${step.id}`}
                                        className={`rounded-xl border p-4 transition-colors ${containerClasses}`}
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            {/* Left side: Icon, number, titles */}
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div className="mt-0.5 shrink-0 flex items-center justify-center">
                                                    {isCurrent ? (
                                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ochre-600 font-bold text-xs text-white">
                                                            <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                                                        </span>
                                                    ) : isDone ? (
                                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                                                        </span>
                                                    ) : isLocked ? (
                                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                                            <Lock className="h-4 w-4" aria-hidden />
                                                        </span>
                                                    ) : isUnavailable ? (
                                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                                            <AlertCircle className="h-4 w-4" aria-hidden />
                                                        </span>
                                                    ) : (
                                                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 font-semibold text-xs">
                                                            {stepNumber}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {/* The number appears once: here only when the marker shows an icon. */}
                                                        {(isDone || isLocked || isUnavailable) && <span className="text-xs font-semibold text-slate-500">
                                                            {`[${stepNumber}]`}
                                                        </span>}
                                                        <h3 className={`text-base font-semibold ${isCurrent ? 'text-indigo-900' : 'text-slate-800'}`}>
                                                            {titleDisplay}
                                                        </h3>

                                                        {isCurrent && (
                                                            <span className="rounded-full bg-ochre-200/80 px-2.5 py-0.5 text-xs font-bold text-ochre-800">
                                                                {l('current')}
                                                            </span>
                                                        )}
                                                        {isDone && (
                                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                                                {l('completed')}
                                                            </span>
                                                        )}
                                                        {isUnavailable && (
                                                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                                {l('notAvailable')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isUnavailable && (
                                                        <p className="mt-1 text-xs text-slate-600">{pathPublicationText(lang, 'studentUnavailable')}</p>
                                                    )}

                                                    {step.title && step.title !== toolDisplayName && (
                                                        <p className="text-xs font-medium text-slate-500">
                                                            {toolDisplayName}
                                                        </p>
                                                    )}

                                                    {step.instructions && (
                                                        <p className="text-sm text-slate-600">
                                                            {step.instructions}
                                                        </p>
                                                    )}
                                                    {step.step_type === 'assignment' && !isUnavailable && (
                                                        <p className="text-xs text-slate-500">{pathAssignmentText(lang, 'studentRule')}</p>
                                                    )}
                                                    {step.step_type === 'forum' && !isUnavailable && (() => {
                                                        const notice = forumStepNotice(step.forum_state, isDone);
                                                        return (<>
                                                            <p className="text-xs text-slate-500">{pathForumText(lang, 'studentRule')}</p>
                                                            {notice && <p role="status" className="text-xs font-medium text-slate-700">{pathForumText(lang, `notice_${notice}`)}</p>}
                                                        </>);
                                                    })()}
                                                    {step.step_type === 'meeting' && step.meeting_summary && !isUnavailable && (<>
                                                        <MeetingDetails lang={lang} meeting={step.meeting_summary} attended={isDone} onChanged={loadPaths} />
                                                        {/* The rule matters once it can be followed: started, not yet marked. */}
                                                        {!isDone && step.meeting_summary.status === 'scheduled' && new Date(step.meeting_summary.starts_at).getTime() <= Date.now()
                                                            && <p className="text-xs text-slate-500">{classMeetingText(lang, 'studentRule')}</p>}
                                                    </>)}
                                                    <ForumDiscussionLinks links={discussions.forbidden || discussions.failed ? [] : discussions.data?.links || []}
                                                        kind="path_step" targetId={step.id} />

                                                    {isLocked && (
                                                        <p className="text-xs italic text-slate-500">
                                                            {l('unlocksAfter').replace('{n}', String(lockedStepUnlockNumber(path) ?? stepNumber - 1))}
                                                        </p>
                                                    )}

                                                    <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-slate-500">
                                                        {step.due_date && (
                                                            <span>{l('dueOn').replace('{date}', step.due_date)}</span>
                                                        )}
                                                        {isDone && step.source && (
                                                            <span>
                                                                {step.source === 'teacher' ? l('sourceTeacher') : step.source === 'automatic' ? l('sourceAutomatic') : l('sourceStudent')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right side: Actions */}
                                            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 sm:shrink-0 sm:justify-end">
                                                {/* Start button */}
                                                {step.start_href && !isLocked && !isUnavailable && (
                                                    <Link href={step.start_href}>
                                                        <Button
                                                            variant={isCurrent ? 'accent' : 'secondary'}
                                                            size="md"
                                                        >
                                                            {isDone ? l('reopen') : l('start')}
                                                            <ArrowRight className="h-4 w-4" aria-hidden />
                                                        </Button>
                                                    </Link>
                                                )}

                                                {/* Self-marking action */}
                                                {step.can_self_mark && !isUnavailable && !isLocked && (
                                                    <Button
                                                        variant={isDone ? 'ghost' : 'secondary'}
                                                        size="md"
                                                        disabled={isActionBusy}
                                                        onClick={() => void handleToggleDone(path.id, step)}
                                                    >
                                                        {isDone ? l('markUndone') : l('markDone')}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
