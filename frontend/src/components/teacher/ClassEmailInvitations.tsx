'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classSettingsText, type classSettingsTexts } from '@/lib/i18n-class-settings';
import { fillTemplate, invitationMailto, type GroupInvitation } from '@/lib/class-invitations';

type TextKey = keyof typeof classSettingsTexts;

// #836: the teacher adds a student by email. The student signs in or signs up
// through ai4auth with that email (own password) and is enrolled on arrival.
// Two blocks share one state: the add form sits with the real students, the
// pending list is its own block below them (#838).
export function useClassInvitations(groupId: number, groupName: string, webLink: string) {
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

    useEffect(() => {
        let active = true;
        apiFetch(base)
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (active && data) setInvitations(data); })
            .catch(() => undefined);
        return () => { active = false; };
    }, [base]);

    const mailto = (to: string) => invitationMailto(
        to,
        fillTemplate(l('invitationMailSubject'), { class: groupName }),
        fillTemplate(l('invitationMailBody'), { email: to, link: webLink }),
    );

    const run = async (action: () => Promise<Response>, onOk?: (res: Response) => void | Promise<void>) => {
        setBusy(true);
        setError('');
        try {
            const res = await action();
            if (res.status === 409) setError(l('invitationDuplicate'));
            else if (!res.ok) setError(l('invitationError'));
            else await onOk?.(res);
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
        }), async res => {
            setEmail('');
            if (!webLink) return; // no web link: the teacher sends it from the pending list
            const invitation: GroupInvitation = await res.json();
            window.location.assign(mailto(invitation.email)); // #846: open the mail client right away
            await apiFetch(`${base}/${invitation.id}/sent`, { method: 'POST' });
        });
    };

    return { invitations, email, setEmail, busy, error, base, add, run, mailto };
}

type ClassInvitations = ReturnType<typeof useClassInvitations>;

export function ClassAddStudent({ groupId, state }: { groupId: number; state: ClassInvitations }) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const { email, setEmail, busy, error, add } = state;
    return (
        <div className="space-y-3">
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
        </div>
    );
}

export function ClassPendingInvitations({ webLink, state }: { webLink: string; state: ClassInvitations }) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const { invitations, busy, base, run, mailto } = state;
    return (
        <Card as="section" aria-labelledby="class-pending-invitations-heading" className="space-y-3 border-role-teacher-line bg-role-teacher-soft [--ink-muted:var(--role-teacher-muted)]">
            <h2 id="class-pending-invitations-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
                <Send className="h-5 w-5 text-link" aria-hidden />
                {l('pendingInvitations')}
            </h2>
            <div>
                {invitations.length === 0 ? (
                    <p className="text-xs text-ink-muted">{l('noPendingInvitations')}</p>
                ) : (
                    <ul className="divide-y divide-line rounded-card border border-line">
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
                                            className="inline-flex min-h-[36px] items-center gap-1 rounded-control border border-line-strong px-3 text-xs font-semibold text-link hover:bg-surface/60"
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
        </Card>
    );
}
