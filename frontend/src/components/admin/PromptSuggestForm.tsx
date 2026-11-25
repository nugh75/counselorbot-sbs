'use client';

import { useId, useState } from 'react';
import { Send } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { canSuggestPrompt, type SuggestionChannel } from '@/lib/prompt-health';

export interface PromptSuggestCardLike {
    id: string;
    editable?: boolean;
    differs_from_factory: boolean;
    suggestion_channels?: SuggestionChannel[];
}

interface SuggestResponse {
    prompt_id: string;
    channel: SuggestionChannel;
    issue_url?: string;
    issue_number?: number;
    recipient?: string;
}

/** Azione (#779): «Suggerisci al progetto» verso il maintainer via email o GitHub issue. */
export function PromptSuggestForm({ card, dirty = false }: { card: PromptSuggestCardLike; dirty?: boolean }) {
    const { t } = useI18n();
    const reasonId = useId();
    const channelId = useId();
    const channels = card.suggestion_channels ?? [];
    const [open, setOpen] = useState(false);
    const [channel, setChannel] = useState<SuggestionChannel>(() => channels[0] ?? 'email');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<SuggestResponse | null>(null);
    const [error, setError] = useState(false);

    if (!canSuggestPrompt(card)) {
        return null;
    }

    const activeChannel = channels.includes(channel) ? channel : channels[0];

    const submit = async () => {
        if (dirty || !reason.trim() || !activeChannel) return;
        setBusy(true);
        setError(false);
        try {
            const response = await apiFetch('/api/admin/prompt-health/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt_id: card.id,
                    reason: reason.trim(),
                    channel: activeChannel,
                }),
            });
            if (!response.ok) throw new Error('suggest');
            const payload: SuggestResponse = await response.json();
            setResult(payload);
            setReason('');
            setOpen(false);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    return <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => { setOpen(value => !value); setError(false); }}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {t('admin.promptHealth.suggest.action')}
            </Button>
        </div>

        {open && channels.length === 0 && (
            <Callout variant="info">{t('admin.promptHealth.suggest.notConfigured')}</Callout>
        )}

        {open && channels.length > 0 && <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-3 text-sm">
            <p className="text-xs text-ink-muted">{t('admin.promptHealth.suggest.reminder')}</p>
            {dirty && <Callout variant="warning">{t('admin.promptHealth.suggest.saveFirst')}</Callout>}
            {channels.length > 1 && <div>
                <label htmlFor={channelId} className="block text-xs font-semibold text-ink-body">
                    {t('admin.promptHealth.suggest.channelLabel')}
                </label>
                <select
                    id={channelId}
                    value={activeChannel}
                    onChange={event => setChannel(event.target.value as SuggestionChannel)}
                    className="mt-1 min-h-control rounded-control border border-line bg-surface px-2 text-xs text-ink-body"
                >
                    {channels.map(ch => (
                        <option key={ch} value={ch}>{t(`admin.promptHealth.suggest.channel.${ch}`)}</option>
                    ))}
                </select>
            </div>}
            <div>
                <label htmlFor={reasonId} className="block text-xs font-semibold text-ink-body">
                    {t('admin.promptHealth.suggest.reasonLabel')}
                </label>
                <textarea
                    id={reasonId}
                    rows={3}
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    placeholder={t('admin.promptHealth.suggest.reasonPlaceholder')}
                    className="mt-1 w-full rounded-control border border-line bg-surface p-2 text-xs text-ink-body"
                />
            </div>
            <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy || dirty || !reason.trim()} onClick={() => { void submit(); }}>
                    {busy ? t('admin.promptHealth.suggest.submitting') : t('admin.promptHealth.suggest.confirm')}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
                    {t('admin.promptHealth.level.cancel')}
                </Button>
            </div>
        </div>}

        {result && <Callout variant="success">
            {result.channel === 'github' && result.issue_url
                ? <>
                    <span>{t('admin.promptHealth.suggest.successGithub', { number: result.issue_number ?? '' })} </span>
                    <a href={result.issue_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                        {result.issue_url}
                    </a>
                </>
                : <span>{t('admin.promptHealth.suggest.successEmail')}</span>}
        </Callout>}
        {error && <Callout variant="danger">{t('admin.promptHealth.suggest.error')}</Callout>}
    </div>;
}
