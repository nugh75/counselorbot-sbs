'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classSettingsText, type classSettingsTexts } from '@/lib/i18n-class-settings';
import { fillTemplate, invitationMailto, type GroupInvitation } from '@/lib/class-invitations';

type TextKey = keyof typeof classSettingsTexts;

// #836: the teacher adds a student by email. The student signs in or signs up
// through ai4auth with that email (own password) and is enrolled on arrival.
export function ClassEmailInvitations({ groupId, groupName, webLink }: { groupId: number; groupName: string; webLink: string }) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const base = `/api/admin/groups/${groupId}/invitations`;

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(base);
            if (res.ok) setInvitations(await res.json());
        } catch {
            // The list stays as it was; actions report their own errors.
        }
    }, [base]);

    useEffect(() => { void load(); }, [load]);

    const run = async (action: () => Promise<Response>, onOk?: () => void) => {
        setBusy(true);
        setError('');
        try {
            const res = await action();
            if (res.status === 409) setError(l('invitationDuplicate'));
            else if (!res.ok) setError(l('invitationError'));
            else onOk?.();
            await load();
        } catch {
            setError(l('invitationError'));
        } finally {
            setBusy(false);
        }
    };

    const add = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || !email.trim()) return;
        void run(() => apiFetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
        }), () => setEmail(''));
    };

    const mailto = (to: string) => invitationMailto(
        to,
        fillTemplate(l('invitationMailSubject'), { class: groupName }),
        fillTemplate(l('invitationMailBody'), { email: to, link: webLink }),
    );

    return (
        <div className="space-y-3 border-t border-line pt-4">
            <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Mail className="h-4 w-4 text-link" aria-hidden />
                    {l('addStudentByEmail')}
                </h3>
                <p className="mt-1 text-xs text-ink-muted">{l('addStudentEmailHint')}</p>
            </div>
            <form onSubmit={add} className="flex gap-2">
                <label htmlFor={`invite-email-${groupId}`} className="sr-only">{l('studentEmail')}</label>
                <input
                    id={`invite-email-${groupId}`}
                    type="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder={l('studentEmail')}
                    className="min-h-[44px] flex-1 rounded-control border border-line-strong bg-surface px-4 text-sm text-ink-body"
                />
                <Button type="submit" variant="secondary" disabled={busy} className="shrink-0">
                    {l('addStudent')}
                </Button>
            </form>
            {error && <p role="alert" className="text-xs text-warning">{error}</p>}
            <div>
                <h4 className="text-xs font-semibold text-ink-body">{l('pendingInvitations')}</h4>
                {invitations.length === 0 ? (
                    <p className="mt-1 text-xs text-ink-muted">{l('noPendingInvitations')}</p>
                ) : (
                    <ul className="mt-2 divide-y divide-line rounded-card border border-line">
                        {invitations.map(invitation => (
                            <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-ink">{invitation.email}</p>
                                    <p className="text-xs text-ink-muted">
                                        {invitation.sent_at
                                            ? `${l('invitationSent')} ${new Date(invitation.sent_at).toLocaleDateString(lang)}`
                                            : l('invitationNotSent')}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {webLink && (
                                        <a
                                            href={mailto(invitation.email)}
                                            onClick={() => void run(() => apiFetch(`${base}/${invitation.id}/sent`, { method: 'POST' }))}
                                            className="inline-flex min-h-[36px] items-center gap-1 rounded-control border border-line-strong px-3 text-xs font-semibold text-link hover:bg-brand-soft"
                                        >
                                            <Send className="h-3.5 w-3.5" aria-hidden />
                                            {invitation.sent_at ? l('resendInvitation') : l('sendInvitation')}
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void run(() => apiFetch(`${base}/${invitation.id}`, { method: 'DELETE' }))}
                                        aria-label={`${l('cancelInvitation')}: ${invitation.email}`}
                                        className="inline-flex min-h-[36px] items-center gap-1 rounded-control px-3 text-xs text-ink-muted hover:text-ink"
                                    >
                                        <X className="h-3.5 w-3.5" aria-hidden />
                                        {l('cancelInvitation')}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
