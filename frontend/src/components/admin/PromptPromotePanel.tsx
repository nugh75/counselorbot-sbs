'use client';

import { useId, useState } from 'react';
import { GitPullRequest } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { apiFetch } from '@/lib/auth';
import { canPromoteToFactory, type MaintainerPromoteInfo } from '@/lib/prompt-health';
import { useI18n } from '@/lib/i18n-context';

export interface PromptPromoteCardLike {
    id: string;
    differs_from_factory: boolean;
    maintainer_promote?: MaintainerPromoteInfo;
}

interface PromoteResponse {
    prompt_id: string;
    pr_url: string;
    pr_number: number;
    branch: string;
    file_path: string;
}

/** Azione maintainer (#777): apre una PR GitHub per promuovere il testo attuale a fabbrica. */
export function PromptPromotePanel({ card, dirty = false }: { card: PromptPromoteCardLike; dirty?: boolean }) {
    const { t } = useI18n();
    const noteId = useId();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<PromoteResponse | null>(null);
    const [error, setError] = useState(false);

    if (!card.maintainer_promote?.enabled || !card.differs_from_factory) {
        return null;
    }

    if (!canPromoteToFactory(card)) {
        return <p className="text-xs text-ink-muted">{t('admin.promptHealth.promote.unsupported')}</p>;
    }

    const submit = async () => {
        if (dirty) return;
        setBusy(true);
        setError(false);
        try {
            const response = await apiFetch('/api/admin/prompt-health/promote-factory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt_id: card.id,
                    note: note.trim(),
                }),
            });
            if (!response.ok) throw new Error('promote');
            const payload: PromoteResponse = await response.json();
            setResult(payload);
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
                <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                {t('admin.promptHealth.promote.action')}
            </Button>
        </div>

        {open && <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-3 text-sm">
            {card.maintainer_promote.file_path && <p className="text-xs text-ink-muted">
                {t('admin.promptHealth.promote.targetFile', { file: card.maintainer_promote.file_path })}
            </p>}
            {dirty && <Callout variant="warning">{t('admin.promptHealth.promote.saveFirst')}</Callout>}
            <div>
                <label htmlFor={noteId} className="block text-xs font-semibold text-ink-body">
                    {t('admin.promptHealth.promote.noteLabel')}
                </label>
                <textarea
                    id={noteId}
                    rows={2}
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    placeholder={t('admin.promptHealth.promote.notePlaceholder')}
                    className="mt-1 w-full rounded-control border border-line bg-surface p-2 text-xs text-ink-body"
                />
            </div>
            <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy || dirty} onClick={() => { void submit(); }}>
                    {busy ? t('admin.promptHealth.promote.submitting') : t('admin.promptHealth.promote.confirm')}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
                    {t('admin.promptHealth.level.cancel')}
                </Button>
            </div>
        </div>}

        {result && <Callout variant="success">
            <span>{t('admin.promptHealth.promote.success', { number: result.pr_number })} </span>
            <a href={result.pr_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                {result.pr_url}
            </a>
        </Callout>}
        {error && <Callout variant="danger">{t('admin.promptHealth.promote.error')}</Callout>}
    </div>;
}
