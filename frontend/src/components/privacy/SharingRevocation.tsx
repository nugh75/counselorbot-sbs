'use client';

import { useState } from 'react';
import { Loader2, NotebookPen, Share2, ShieldOff } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import {
    canRecordNewChoice,
    privacyErrorKey,
    sharingRows,
    type PrivacyChoice,
    type PrivacyDocument,
    type PrivacyGroup,
    type PrivacyPurpose,
} from '@/lib/privacy';

type Feedback = { kind: 'ok' | 'error'; key: string };

async function errorKey(response: Response): Promise<string> {
    let detail: unknown = null;
    try {
        const payload = await response.json() as { detail?: unknown };
        detail = payload?.detail ?? null;
    } catch {
        // Keep the generic message for a non-JSON failure.
    }
    return privacyErrorKey(response.status, detail);
}

export function SharingRevocation({ choices, groups, purpose, document, canEdit, choicesLoading, onChanged }: {
    choices: PrivacyChoice[];
    groups: PrivacyGroup[];
    purpose: PrivacyPurpose | null;
    document: PrivacyDocument | null;
    canEdit: boolean;
    choicesLoading: boolean;
    onChanged: () => Promise<void> | void;
}) {
    const { t } = useI18n();
    const [groupId, setGroupId] = useState('');
    const [teacher, setTeacher] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const rows = sharingRows(choices, groups);
    const canGrant = canEdit && canRecordNewChoice(purpose, document);
    const formDisabled = !canGrant || choicesLoading || busy !== null || groups.length === 0;

    const revoke = async (target: string, group: number, teacherUsername: string | null) => {
        if (!teacherUsername) {
            setFeedback({ kind: 'error', key: 'privacy.sharing.unknownTeacher' });
            return;
        }
        setBusy(target);
        setFeedback(null);
        try {
            const response = await apiFetch('/api/privacy/choices/teacher_sharing/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teacher_username: teacherUsername, group_id: group }),
            });
            if (!response.ok) {
                setFeedback({ kind: 'error', key: await errorKey(response) });
                return;
            }
            setFeedback({ kind: 'ok', key: 'privacy.sharing.revoked' });
            await onChanged();
        } catch {
            setFeedback({ kind: 'error', key: 'privacy.sharing.error' });
        } finally {
            setBusy(null);
        }
    };

    const grant = async () => {
        const selectedGroup = Number(groupId);
        const teacherUsername = teacher.trim();
        if (!selectedGroup || !teacherUsername) {
            setFeedback({ kind: 'error', key: 'privacy.sharing.needTeacher' });
            return;
        }
        if (rows.some((row) => row.groupId === selectedGroup && (row.teacherUsername || '').toLowerCase() === teacherUsername.toLowerCase())) {
            setFeedback({ kind: 'error', key: 'privacy.sharing.alreadyActive' });
            return;
        }
        if (!document) {
            setFeedback({ kind: 'error', key: 'privacy.sharing.documentMissing' });
            return;
        }
        setBusy('grant');
        setFeedback(null);
        try {
            const response = await apiFetch('/api/privacy/choices/teacher_sharing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_id: document.id,
                    granted: true,
                    teacher_username: teacherUsername,
                    group_id: selectedGroup,
                }),
            });
            if (!response.ok) {
                setFeedback({ kind: 'error', key: await errorKey(response) });
                return;
            }
            setTeacher('');
            setFeedback({ kind: 'ok', key: 'privacy.sharing.granted' });
            await onChanged();
        } catch {
            setFeedback({ kind: 'error', key: 'privacy.sharing.error' });
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="glass-panel space-y-5 p-5" aria-labelledby="privacy-sharing-title">
            <div className="space-y-1">
                <h2 id="privacy-sharing-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <Share2 className="h-5 w-5 text-indigo-600" aria-hidden />
                    {t('privacy.sharing.title')}
                </h2>
                <p className="max-w-3xl text-sm text-slate-600">{t('privacy.sharing.intro')}</p>
                <p className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <NotebookPen className="h-3.5 w-3.5" aria-hidden />
                    {t('privacy.sharing.onlyNotebook')}
                </p>
            </div>

            {rows.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{t('privacy.sharing.empty')}</p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((row) => (
                        <li key={row.target || `${row.groupId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{row.groupName}</p>
                                <p className="text-xs text-slate-600">
                                    {t('privacy.sharing.teacher')}: {row.teacherUsername || t('privacy.sharing.unknownTeacher')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void revoke(row.target, row.groupId, row.teacherUsername)}
                                disabled={!canEdit || choicesLoading || busy !== null || !row.teacherUsername}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900"
                            >
                                {busy === row.target ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
                                {busy === row.target ? t('privacy.sharing.revoking') : t('privacy.sharing.revoke')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="text-sm font-bold text-slate-900">{t('privacy.sharing.manageTitle')}</h3>
                <p className="mt-1 text-xs text-slate-600">{t('privacy.sharing.manageIntro')}</p>
                {groups.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-700">{t('privacy.sharing.noClasses')}</p>
                ) : (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                            <span className="mb-1 block">{t('privacy.sharing.class')}</span>
                            <select
                                value={groupId}
                                onChange={(event) => setGroupId(event.target.value)}
                                disabled={formDisabled}
                                className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            >
                                <option value="">—</option>
                                {groups.map((group) => (
                                    <option key={group.group_id} value={group.group_id}>{group.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                            <span className="mb-1 block">{t('privacy.sharing.teacherUsername')}</span>
                            <input
                                value={teacher}
                                onChange={(event) => setTeacher(event.target.value)}
                                disabled={formDisabled}
                                placeholder={t('privacy.sharing.teacherPlaceholder')}
                                autoComplete="off"
                                spellCheck={false}
                                maxLength={255}
                                className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => void grant()}
                            disabled={formDisabled || !groupId || !teacher.trim()}
                            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                        >
                            {busy === 'grant' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            {busy === 'grant' ? t('privacy.sharing.granting') : t('privacy.sharing.grant')}
                        </button>
                    </div>
                )}
                {!canGrant && groups.length > 0 && (
                    <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                        {!purpose?.active || purpose?.legal_basis === 'undefined'
                            ? t('privacy.sharing.inactive')
                            : t('privacy.sharing.documentMissing')}
                    </p>
                )}
                {feedback && (
                    <p
                        role={feedback.kind === 'error' ? 'alert' : 'status'}
                        className={`mt-3 text-sm font-medium ${feedback.kind === 'error' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}
                    >
                        {t(feedback.key)}
                    </p>
                )}
            </div>
        </section>
    );
}
