'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Check, GitMerge, RefreshCw, RotateCcw, X } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import {
    lineDiff,
    type PromptFactoryProposal,
    type PromptFactoryProposalsResponse,
} from '@/lib/prompt-health';
import { cn } from '@/lib/utils';
import type { PromptHealthPath } from './PromptCompare';
import { usePromptName } from './PromptHealthLabels';

function ProposalDiffView({ before, after }: { before: string; after: string }) {
    const { t } = useI18n();
    const lines = useMemo(() => lineDiff(before, after), [before, after]);
    return (
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-control border border-line bg-surface-sunken p-3 font-mono text-xs text-ink">
            {lines.map((line, index) => (
                <div
                    key={index}
                    className={cn(
                        line.type === 'del' && 'bg-danger-soft text-danger-ink line-through',
                        line.type === 'add' && 'bg-success-soft text-success-ink',
                    )}
                >
                    <span aria-hidden="true">
                        {line.type === 'del' ? '− ' : line.type === 'add' ? '+ ' : '  '}
                    </span>
                    <span className="sr-only">
                        {line.type === 'del'
                            ? t('admin.promptHealth.compare.removed')
                            : line.type === 'add'
                                ? t('admin.promptHealth.compare.added')
                                : ''}
                    </span>
                    {line.text || ' '}
                </div>
            ))}
        </pre>
    );
}

/**
 * Elenco delle proposte di aggiornamento di fabbrica (#776) dentro «Salute dei prompt».
 * Per ogni prompt diverso dalla fabbrica consente: Accetta, Ignora o Unisci a mano.
 */
export function PromptFactoryProposals({
    paths = [],
    refreshKey = 0,
    onChanged,
    onCountChange,
}: {
    paths?: PromptHealthPath[];
    refreshKey?: number;
    onChanged?: () => void;
    onCountChange?: (count: number) => void;
}) {
    const { t } = useI18n();
    const titleId = useId();
    const promptName = usePromptName(paths);
    const [data, setData] = useState<PromptFactoryProposalsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [mergingId, setMergingId] = useState<string | null>(null);
    const [mergeDraft, setMergeDraft] = useState('');

    const fetchProposals = useCallback(async () => {
        const res = await apiFetch('/api/admin/prompt-health/proposals', { cache: 'no-store' });
        if (!res.ok) throw new Error('proposals_load');
        return (await res.json()) as PromptFactoryProposalsResponse;
    }, []);

    const reload = useCallback(async () => {
        setError(null);
        try {
            const next = await fetchProposals();
            setData(next);
            onCountChange?.(next.pending_count);
        } catch {
            setError(t('admin.promptProposals.loadError'));
        } finally {
            setLoading(false);
        }
    }, [fetchProposals, onCountChange, t]);

    useEffect(() => {
        let active = true;
        fetchProposals()
            .then((next) => {
                if (!active) return;
                setData(next);
                setError(null);
                setLoading(false);
                onCountChange?.(next.pending_count);
            })
            .catch(() => {
                if (!active) return;
                setError(t('admin.promptProposals.loadError'));
                setLoading(false);
            });
        return () => { active = false; };
    }, [fetchProposals, onCountChange, refreshKey, t]);

    const runAction = async (
        proposal: PromptFactoryProposal,
        endpoint: 'accept' | 'ignore' | 'merge',
        successKey: string,
        extraBody?: Record<string, string>,
    ) => {
        setBusyId(proposal.prompt_id);
        setError(null);
        setNotice(null);
        try {
            const res = await apiFetch(`/api/admin/prompt-health/proposals/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scope: proposal.scope,
                    key: proposal.key,
                    expected_current_hash: proposal.current_hash,
                    expected_factory_hash: proposal.factory_hash,
                    ...(extraBody ?? {}),
                }),
            });
            if (!res.ok) {
                setError(
                    res.status === 409
                        ? t('admin.promptProposals.conflict')
                        : t('admin.promptProposals.actionError'),
                );
                return;
            }
            if (endpoint === 'merge') {
                setMergingId(null);
                setMergeDraft('');
            }
            setNotice(t(successKey, { prompt: promptName(proposal.prompt_id) }));
            await reload();
            onChanged?.();
        } catch {
            setError(t('admin.promptProposals.actionError'));
        } finally {
            setBusyId(null);
        }
    };

    const reopen = async (proposal: PromptFactoryProposal) => {
        setBusyId(proposal.prompt_id);
        setError(null);
        setNotice(null);
        try {
            const res = await apiFetch('/api/admin/prompt-health/proposals/reopen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope: proposal.scope, key: proposal.key }),
            });
            if (!res.ok) {
                setError(t('admin.promptProposals.actionError'));
                return;
            }
            setNotice(t('admin.promptProposals.reopenedSuccess', { prompt: promptName(proposal.prompt_id) }));
            await reload();
        } catch {
            setError(t('admin.promptProposals.actionError'));
        } finally {
            setBusyId(null);
        }
    };

    const pending = data?.proposals ?? [];
    const ignored = data?.ignored ?? [];
    const count = data?.pending_count ?? 0;

    return (
        <Card as="section" id="prompt-factory-proposals" aria-labelledby={titleId} className="scroll-mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 id={titleId} className="text-lg font-semibold text-ink-strong">
                        {t('admin.promptProposals.title')}
                    </h2>
                    <span
                        data-testid="prompt-proposals-counter"
                        className={cn(
                            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                            count > 0
                                ? 'border-warning-line bg-warning-soft text-warning-ink'
                                : 'border-success-line bg-success-soft text-success-ink',
                        )}
                    >
                        {t('admin.promptProposals.badge', { count })}
                    </span>
                </div>
                <Button type="button" variant="secondary" disabled={loading || busyId !== null} onClick={() => { void reload(); }}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t('admin.promptProposals.reload')}
                </Button>
            </div>

            <p className="text-sm text-ink-muted">{t('admin.promptProposals.help')}</p>

            {error && <Callout variant="danger">{error}</Callout>}
            {notice && <Callout variant="success">{notice}</Callout>}

            {loading && <p role="status" className="text-sm text-ink-muted">{t('admin.promptProposals.loading')}</p>}

            {!loading && pending.length === 0 && (
                <Callout variant="info">{t('admin.promptProposals.empty')}</Callout>
            )}

            {pending.length > 0 && (
                <ul className="space-y-4">
                    {pending.map((proposal) => {
                        const label = promptName(proposal.prompt_id);
                        const isBusy = busyId === proposal.prompt_id;
                        const isMerging = mergingId === proposal.prompt_id;
                        return (
                            <li key={proposal.prompt_id} className="space-y-3 rounded-card border border-line bg-surface p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="break-words text-sm font-semibold text-ink-strong">{label}</span>
                                            <span
                                                className={cn(
                                                    'rounded-full border px-2 py-0.5 text-2xs font-semibold',
                                                    proposal.status === 'factory_update'
                                                        ? 'border-warning-line bg-warning-soft text-warning-ink'
                                                        : 'border-brand-line bg-brand-soft text-link',
                                                )}
                                            >
                                                {t(`admin.promptProposals.status.${proposal.status}`)}
                                            </span>
                                        </div>
                                        <code className="block break-all font-mono text-xs text-ink-muted">{proposal.prompt_id}</code>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            disabled={busyId !== null}
                                            onClick={() => { void runAction(proposal, 'accept', 'admin.promptProposals.accepted'); }}
                                        >
                                            <Check className="h-4 w-4" aria-hidden="true" />
                                            {t('admin.promptProposals.accept')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            disabled={busyId !== null}
                                            onClick={() => {
                                                if (isMerging) {
                                                    setMergingId(null);
                                                    setMergeDraft('');
                                                } else {
                                                    setMergingId(proposal.prompt_id);
                                                    setMergeDraft(proposal.current_text);
                                                }
                                            }}
                                        >
                                            <GitMerge className="h-4 w-4" aria-hidden="true" />
                                            {t('admin.promptProposals.merge')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            disabled={busyId !== null}
                                            onClick={() => { void runAction(proposal, 'ignore', 'admin.promptProposals.ignoredSuccess'); }}
                                        >
                                            <X className="h-4 w-4" aria-hidden="true" />
                                            {t('admin.promptProposals.ignore')}
                                        </Button>
                                    </div>
                                </div>

                                <details open>
                                    <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
                                        {t('admin.promptProposals.diff')}
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                        <ProposalDiffView before={proposal.current_text} after={proposal.factory_text} />
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="min-w-0 space-y-1">
                                                <h3 className="text-xs font-semibold text-ink-body">{t('admin.promptProposals.current')}</h3>
                                                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-control bg-surface-sunken p-2 font-mono text-xs text-ink">
                                                    {proposal.current_text}
                                                </pre>
                                            </div>
                                            <div className="min-w-0 space-y-1">
                                                <h3 className="text-xs font-semibold text-ink-body">{t('admin.promptProposals.factory')}</h3>
                                                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-control bg-surface-sunken p-2 font-mono text-xs text-ink">
                                                    {proposal.factory_text}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                </details>

                                {isMerging && (
                                    <div className="space-y-3 border-t border-line pt-3">
                                        <p className="text-xs text-ink-muted">{t('admin.promptProposals.mergeHelp')}</p>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="min-w-0 space-y-1">
                                                <label
                                                    htmlFor={`merge-draft-${proposal.prompt_id}`}
                                                    className="block text-xs font-semibold text-ink-body"
                                                >
                                                    {t('admin.promptProposals.mergeDraftLabel')}
                                                </label>
                                                <textarea
                                                    id={`merge-draft-${proposal.prompt_id}`}
                                                    rows={10}
                                                    value={mergeDraft}
                                                    onChange={(event) => setMergeDraft(event.target.value)}
                                                    className="w-full rounded-control border border-line-strong bg-surface p-3 font-mono text-xs text-ink"
                                                />
                                            </div>
                                            <div className="min-w-0 space-y-1">
                                                <p className="text-xs font-semibold text-ink-body">
                                                    {t('admin.promptProposals.mergeFactoryLabel')}
                                                </p>
                                                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-control border border-line bg-surface-sunken p-3 font-mono text-xs text-ink">
                                                    {proposal.factory_text}
                                                </pre>
                                            </div>
                                        </div>
                                        <details>
                                            <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
                                                {t('admin.promptProposals.mergePreview')}
                                            </summary>
                                            <div className="mt-2">
                                                <ProposalDiffView before={proposal.current_text} after={mergeDraft} />
                                            </div>
                                        </details>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                disabled={isBusy}
                                                onClick={() => {
                                                    void runAction(
                                                        proposal,
                                                        'merge',
                                                        'admin.promptProposals.mergedSuccess',
                                                        { merged_text: mergeDraft },
                                                    );
                                                }}
                                            >
                                                {isBusy ? t('admin.promptProposals.saving') : t('admin.promptProposals.saveMerge')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                disabled={isBusy}
                                                onClick={() => setMergeDraft(proposal.current_text)}
                                            >
                                                {t('admin.promptProposals.useCurrent')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                disabled={isBusy}
                                                onClick={() => setMergeDraft(proposal.factory_text)}
                                            >
                                                {t('admin.promptProposals.useFactory')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                disabled={isBusy}
                                                onClick={() => { setMergingId(null); setMergeDraft(''); }}
                                            >
                                                {t('admin.promptProposals.cancel')}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {ignored.length > 0 && (
                <details className="rounded-control border border-line bg-surface-sunken p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-ink-body">
                        {t('admin.promptProposals.ignoredTitle', { count: ignored.length })}
                    </summary>
                    <p className="mt-2 text-xs text-ink-muted">{t('admin.promptProposals.ignoredHelp')}</p>
                    <ul className="mt-3 space-y-2">
                        {ignored.map((proposal) => (
                            <li
                                key={proposal.prompt_id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2"
                            >
                                <div className="min-w-0 flex-1">
                                    <span className="block break-words text-sm font-semibold text-ink-strong">
                                        {promptName(proposal.prompt_id)}
                                    </span>
                                    <code className="block break-all font-mono text-xs text-ink-muted">{proposal.prompt_id}</code>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={busyId !== null}
                                    onClick={() => { void reopen(proposal); }}
                                >
                                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                    {t('admin.promptProposals.reopen')}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </Card>
    );
}
