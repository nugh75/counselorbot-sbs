'use client';

import { useState } from 'react';
import { Loader2, NotebookPen, Share2, ShieldOff } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
        <section className="space-y-5 border-t border-line pt-6" aria-labelledby="privacy-sharing-title">
            <div className="space-y-1">
                <h2 id="privacy-sharing-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
                    <Share2 className="h-5 w-5 text-link" aria-hidden />
                    {t('privacy.sharing.title')}
                </h2>
                <p className="max-w-3xl text-sm text-ink-body">{t('privacy.sharing.intro')}</p>
                <StatusBadge>
                    <NotebookPen className="h-3.5 w-3.5" aria-hidden />
                    {t('privacy.sharing.onlyNotebook')}
                </StatusBadge>
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-ink-body">{t('privacy.sharing.empty')}</p>
            ) : (
                <ul>
                    {rows.map((row) => (
                        <li key={row.target || `${row.groupId}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 first:border-t-0">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink">{row.groupName}</p>
                                <p className="text-xs text-ink-muted">
                                    {t('privacy.sharing.teacher')}: {row.teacherUsername || t('privacy.sharing.unknownTeacher')}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="danger"
                                onClick={() => void revoke(row.target, row.groupId, row.teacherUsername)}
                                disabled={!canEdit || choicesLoading || busy !== null || !row.teacherUsername}
                            >
                                {busy === row.target ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
                                {busy === row.target ? t('privacy.sharing.revoking') : t('privacy.sharing.revoke')}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="border-t border-line pt-4">
                <h3 className="text-sm font-semibold text-ink">{t('privacy.sharing.manageTitle')}</h3>
                <p className="mt-1 text-xs text-ink-muted">{t('privacy.sharing.manageIntro')}</p>
                {groups.length === 0 ? (
                    <p className="mt-3 text-sm text-ink-body">{t('privacy.sharing.noClasses')}</p>
                ) : (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <Field label={t('privacy.sharing.class')} className="flex-1">
                            <Select
                                value={groupId}
                                onChange={(event) => setGroupId(event.target.value)}
                                disabled={formDisabled}
                            >
                                <option value="">—</option>
                                {groups.map((group) => (
                                    <option key={group.group_id} value={group.group_id}>{group.name}</option>
                                ))}
                            </Select>
                        </Field>
                        <Field label={t('privacy.sharing.teacherUsername')} className="flex-1">
                            <Input
                                value={teacher}
                                onChange={(event) => setTeacher(event.target.value)}
                                disabled={formDisabled}
                                placeholder={t('privacy.sharing.teacherPlaceholder')}
                                autoComplete="off"
                                spellCheck={false}
                                maxLength={255}
                            />
                        </Field>
                        <Button
                            type="button"
                            className="shrink-0"
                            onClick={() => void grant()}
                            disabled={formDisabled || !groupId || !teacher.trim()}
                        >
                            {busy === 'grant' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            {busy === 'grant' ? t('privacy.sharing.granting') : t('privacy.sharing.grant')}
                        </Button>
                    </div>
                )}
                {!canGrant && groups.length > 0 && (
                    <p className="mt-2 text-xs font-medium text-warning-ink">
                        {!purpose?.active || purpose?.legal_basis === 'undefined'
                            ? t('privacy.sharing.inactive')
                            : t('privacy.sharing.documentMissing')}
                    </p>
                )}
                {feedback && (
                    <p
                        role={feedback.kind === 'error' ? 'alert' : 'status'}
                        className={`mt-3 text-sm font-medium ${feedback.kind === 'error' ? 'text-danger-ink' : 'text-success-ink'}`}
                    >
                        {t(feedback.key)}
                    </p>
                )}
            </div>
        </section>
    );
}
