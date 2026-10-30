'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TeacherDevicesPanel } from '@/components/teacher/TeacherDevicesPanel';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { localPairingText, type LocalPairingTextKey } from '@/lib/i18n-local-pairing';

export function ClassPairingSection({ groupId }: { groupId: number }) {
    const { lang } = useI18n();
    const l = (key: LocalPairingTextKey, vars?: Record<string, string | number>) => localPairingText(lang, key, vars);
    const [requiresApproval, setRequiresApproval] = useState(true);
    const [maxUses, setMaxUses] = useState('');
    const [link, setLink] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [copied, setCopied] = useState(false);
    const hasPublicOrigin = /^https:\/\//.test(link);
    const invalidMaxUses = maxUses !== '' && (!Number.isInteger(Number(maxUses)) || Number(maxUses) < 1);

    const generate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || invalidMaxUses) return;
        setBusy(true);
        setError(false);
        try {
            const response = await apiFetch(`/api/local-auth/classes/${groupId}/pairing-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requires_approval: requiresApproval,
                    max_uses: maxUses ? Number(maxUses) : null,
                }),
            });
            if (!response.ok) throw new Error('pairing code failed');
            const payload = await response.json() as { link: string; expires_at: string };
            setLink(payload.link);
            setExpiresAt(payload.expires_at);
            setCopied(false);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    const copyLink = async () => {
        if (!link || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Il campo resta selezionabile anche senza permesso degli appunti.
        }
    };

    return (
        <Card>
            <section aria-labelledby="class-pairing-heading" className="space-y-6">
                <div className="border-b border-line pb-4">
                    <h2 id="class-pairing-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
                        <Link2 className="h-5 w-5 text-link" aria-hidden />
                        {l('classPairingTitle')}
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">{l('classPairingHint')}</p>
                </div>

                <form onSubmit={event => void generate(event)} className="space-y-4">
                    <label className="flex min-h-control items-center gap-4 text-sm text-ink-body">
                        <input
                            type="checkbox"
                            checked={requiresApproval}
                            onChange={event => setRequiresApproval(event.target.checked)}
                            disabled={busy}
                            className="h-4 w-4 rounded-xs border-line-strong text-link"
                        />
                        {l('requiresApproval')}
                    </label>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <label htmlFor={`pairing-max-uses-${groupId}`} className="min-w-0 flex-1 text-xs font-semibold text-ink-body">
                            {l('maxUses')}
                            <input
                                id={`pairing-max-uses-${groupId}`}
                                type="number"
                                min={1}
                                step={1}
                                value={maxUses}
                                onChange={event => setMaxUses(event.target.value)}
                                placeholder={l('maxUsesPlaceholder')}
                                disabled={busy}
                                className="mt-1 min-h-control w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink"
                            />
                        </label>
                        <Button type="submit" variant="accent" disabled={busy || invalidMaxUses}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            {l(busy ? 'generateBusy' : 'generateLink')}
                        </Button>
                    </div>
                </form>

                {error && <Callout variant="danger">{l('actionError')}</Callout>}
                {link && !hasPublicOrigin && <Callout variant="warning">{l('tunnelMissing')}</Callout>}
                {link && hasPublicOrigin && (
                    <div className="space-y-2 rounded-card border border-brand-line bg-brand-soft/50 p-4">
                        <label htmlFor={`pairing-link-${groupId}`} className="text-xs font-semibold text-ink">
                            {l('pairingLink')}
                        </label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                id={`pairing-link-${groupId}`}
                                readOnly
                                value={link}
                                onFocus={event => event.target.select()}
                                className="min-h-control min-w-0 flex-1 rounded-control border border-brand-line bg-surface px-4 font-mono text-xs text-ink-body"
                            />
                            <Button type="button" variant="secondary" onClick={() => void copyLink()}>
                                {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                                {l(copied ? 'copied' : 'copyLink')}
                            </Button>
                        </div>
                        <p className="text-xs text-ink-muted">
                            <time dateTime={expiresAt}>{l('expiresAt', { date: new Date(expiresAt).toLocaleString(lang) })}</time>
                        </p>
                    </div>
                )}

                <TeacherDevicesPanel groupId={groupId} />
                <Link href="/docente/dispositivi" className="inline-flex min-h-control items-center gap-2 text-sm font-semibold text-link hover:underline">
                    {l('openDevices')}<ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
            </section>
        </Card>
    );
}
