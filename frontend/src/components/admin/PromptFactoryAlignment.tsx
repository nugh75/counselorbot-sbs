'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { lineDiff } from '@/lib/prompt-health';
import { cn } from '@/lib/utils';
import type { PromptHealthPath } from './PromptCompare';
import { usePromptName } from './PromptHealthLabels';

interface PlanItem {
    scope: 'config' | 'guided_step';
    key: string;
}

interface DiffPlanItem extends PlanItem {
    before: string;
    after: string;
    status?: 'factory_update' | 'customised';
}

interface PreservedItem extends PlanItem {
    reason: 'personalised' | 'different_instrument';
    before?: string | null;
    after?: string | null;
    status?: 'customised' | null;
}

interface AlignmentPlan {
    review_hash: string;
    changes: DiffPlanItem[];
    preserved: PreservedItem[];
}

const ALIGNMENT_ERRORS = {
    load: 'admin.promptAlignment.loadError',
    apply: 'admin.promptAlignment.applyError',
    conflict: 'admin.promptAlignment.conflict',
};

export interface FactoryAlignmentResult {
    updated: number;
    config_values: Record<string, string>;
    step_prompts: Record<string, string>;
}

const itemKey = (item: PlanItem) => `${item.scope}:${item.key}`;

function AlignmentDiff({ before, after }: { before: string; after: string }) {
    const { t } = useI18n();
    const lines = useMemo(() => lineDiff(before, after), [before, after]);
    return <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-control border border-line bg-surface-sunken p-2 font-mono text-xs text-ink">
        {lines.map((line, index) => <div key={index} className={cn(
            line.type === 'del' && 'bg-danger-soft text-danger-ink line-through',
            line.type === 'add' && 'bg-success-soft text-success-ink',
        )}>
            <span aria-hidden="true">{line.type === 'del' ? '− ' : line.type === 'add' ? '+ ' : '  '}</span>
            <span className="sr-only">
                {line.type === 'del' ? t('admin.promptHealth.compare.removed') : line.type === 'add' ? t('admin.promptHealth.compare.added') : ''}
            </span>
            {line.text || ' '}
        </div>)}
    </pre>;
}

function SelectableDiffList({ items, selected, onToggle, onSelectAll, onSelectNone, badgeClass, statusKey, promptName }: {
    items: DiffPlanItem[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
    badgeClass: string;
    statusKey: string;
    promptName: (id: string) => string;
}) {
    const { t } = useI18n();
    return <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>{t('admin.promptAlignment.selectAll')}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onSelectNone}>{t('admin.promptAlignment.selectNone')}</Button>
        </div>
        <ul className="space-y-2">
            {items.map(item => {
                const id = itemKey(item);
                const label = promptName(id);
                return <li key={id} className="space-y-2 rounded-card border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex min-h-control cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                            <input
                                type="checkbox"
                                checked={selected.has(id)}
                                onChange={() => onToggle(id)}
                                className="h-4 w-4 rounded-control border-line-strong text-brand focus:ring-brand"
                            />
                            <span className="break-words">{label}</span>
                        </label>
                        {label !== item.key && <code className="font-mono text-xs text-ink-muted">{item.key}</code>}
                        <span className={cn('rounded-full border px-2 py-1 text-2xs font-semibold', badgeClass)}>
                            {t(statusKey)}
                        </span>
                    </div>
                    <details>
                        <summary className="cursor-pointer text-xs font-semibold text-ink-muted">{t('admin.promptAlignment.diff')}</summary>
                        <div className="mt-2 space-y-2">
                            <AlignmentDiff before={item.before} after={item.after} />
                            <div className="grid gap-4 md:grid-cols-2">
                                {(['before', 'after'] as const).map(side => <div key={side} className="min-w-0 space-y-1">
                                    <h6 className="text-xs font-semibold text-ink-body">{t(`admin.promptAlignment.${side}`)}</h6>
                                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-control bg-surface-sunken p-2 font-mono text-xs text-ink">{item[side]}</pre>
                                </div>)}
                            </div>
                        </div>
                    </details>
                </li>;
            })}
        </ul>
    </div>;
}

/**
 * Azione multipla «Allinea prompt di fabbrica» dentro Salute dei prompt (#775).
 * Elenca gli aggiornamenti di fabbrica (selezionabili singolarmente o tutti)
 * e, in un elenco separato, i prompt personalizzati (non selezionati di default,
 * richiedono scelta esplicita). Ogni modifica applicata entra nello storico.
 */
export function PromptFactoryAlignment({ paths = [], onApplied }: {
    paths?: PromptHealthPath[];
    onApplied?: (result: FactoryAlignmentResult) => void;
}) {
    const { t } = useI18n();
    const promptName = usePromptName(paths);
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [plan, setPlan] = useState<AlignmentPlan | null>(null);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [stale, setStale] = useState(false);
    const [applied, setApplied] = useState<number | null>(null);
    const inFlight = useRef(false);
    const mounted = useRef(true);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    const start = (operation: 'preview' | 'apply') => {
        inFlight.current = true;
        controller.current = new AbortController();
        setBusy(operation);
        setError(null);
    };
    const finish = () => {
        inFlight.current = false;
        if (mounted.current) setBusy(null);
    };

    const loadPreview = async () => {
        if (inFlight.current) return;
        setOpen(true);
        setPlan(null);
        setApplied(null);
        setStale(false);
        start('preview');
        try {
            const response = await apiFetch('/api/admin/prompt-factory-alignment/preview', {
                signal: controller.current?.signal,
            });
            if (!response.ok) throw new Error('preview');
            const next: AlignmentPlan = await response.json();
            if (mounted.current) {
                setPlan(next);
                // Factory updates are pre-selected; customised prompts stay unchecked until explicitly selected.
                setSelected(new Set(next.changes.map(itemKey)));
            }
        } catch {
            if (mounted.current) setError(ALIGNMENT_ERRORS.load);
        } finally {
            finish();
        }
    };

    const customisedItems = useMemo<DiffPlanItem[]>(() => (plan?.preserved ?? [])
        .filter((item): item is PreservedItem & { before: string; after: string } =>
            item.reason === 'personalised' && typeof item.before === 'string' && typeof item.after === 'string')
        .map(item => ({ scope: item.scope, key: item.key, before: item.before, after: item.after, status: 'customised' })),
    [plan]);

    const otherPreserved = useMemo(() => (plan?.preserved ?? [])
        .filter(item => item.reason !== 'personalised'), [plan]);

    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const selectGroup = (items: PlanItem[], checked: boolean) => setSelected(current => {
        const next = new Set(current);
        for (const item of items) {
            if (checked) next.add(itemKey(item));
            else next.delete(itemKey(item));
        }
        return next;
    });

    const selectedItems = useMemo<PlanItem[]>(() => {
        if (!plan) return [];
        const all = [...plan.changes, ...customisedItems];
        return all.filter(item => selected.has(itemKey(item))).map(({ scope, key }) => ({ scope, key }));
    }, [plan, customisedItems, selected]);

    const apply = async () => {
        if (!plan || !selectedItems.length || stale || inFlight.current) return;
        start('apply');
        try {
            const response = await apiFetch('/api/admin/prompt-factory-alignment/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ review_hash: plan.review_hash, selected: selectedItems }),
                signal: controller.current?.signal,
            });
            if (!mounted.current) return;
            if (!response.ok) {
                setError(response.status === 409 ? ALIGNMENT_ERRORS.conflict : ALIGNMENT_ERRORS.apply);
                setStale(true);
                return;
            }
            const result: FactoryAlignmentResult = await response.json();
            if (mounted.current) {
                onApplied?.(result);
                setApplied(result.updated);
                setPlan(null);
                setSelected(new Set());
            }
        } catch {
            if (mounted.current) {
                setError(ALIGNMENT_ERRORS.apply);
                setStale(true);
            }
        } finally {
            finish();
        }
    };

    const hasAnyDiff = (plan?.changes.length ?? 0) > 0 || customisedItems.length > 0;

    return (
        <div className="space-y-4 print:hidden">
            <Button type="button" variant="secondary" disabled={!!busy}
                aria-expanded={open} aria-controls={panelId} onClick={loadPreview}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {t('admin.promptAlignment.action')}
            </Button>
            {open && <section id={panelId} aria-label={t('admin.promptAlignment.title')}
                aria-busy={!!busy} className="space-y-4 rounded-card border border-line bg-surface p-4">
                <h3 className="text-base font-semibold text-ink">{t('admin.promptAlignment.title')}</h3>
                <p className="text-sm text-ink-muted">{t('admin.promptAlignment.help')}</p>
                {busy && <p role="status" className="text-sm text-ink-muted">{t(`admin.promptAlignment.${busy === 'preview' ? 'loading' : 'applying'}`)}</p>}
                {error && <Callout variant="danger">{t(error)}</Callout>}
                {applied !== null && <Callout variant="success">{t('admin.promptAlignment.success', { count: applied })}</Callout>}
                {plan && <>
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-ink">{t('admin.promptAlignment.changed', { count: plan.changes.length })}</h4>
                        {!plan.changes.length
                            ? <p role="status" className="text-sm text-ink-muted">{t('admin.promptAlignment.empty')}</p>
                            : <SelectableDiffList
                                items={plan.changes}
                                selected={selected}
                                onToggle={toggle}
                                onSelectAll={() => selectGroup(plan.changes, true)}
                                onSelectNone={() => selectGroup(plan.changes, false)}
                                badgeClass="border-warning-line bg-warning-soft text-warning-ink"
                                statusKey="admin.promptAlignment.status.factory_update"
                                promptName={promptName}
                            />}
                    </div>

                    {customisedItems.length > 0 && <div className="space-y-2 border-t border-line pt-4">
                        <h4 className="text-sm font-semibold text-ink">{t('admin.promptAlignment.customisedTitle', { count: customisedItems.length })}</h4>
                        <p className="text-sm text-ink-muted">{t('admin.promptAlignment.customisedHelp')}</p>
                        <SelectableDiffList
                            items={customisedItems}
                            selected={selected}
                            onToggle={toggle}
                            onSelectAll={() => selectGroup(customisedItems, true)}
                            onSelectNone={() => selectGroup(customisedItems, false)}
                            badgeClass="border-brand-line bg-brand-soft text-link"
                            statusKey="admin.promptAlignment.status.customised"
                            promptName={promptName}
                        />
                    </div>}

                    {otherPreserved.length > 0 && <div className="space-y-2 border-t border-line pt-4">
                        <h4 className="text-sm font-semibold text-ink">{t('admin.promptAlignment.otherPreserved', { count: otherPreserved.length })}</h4>
                        <ul className="space-y-1 text-sm text-ink-muted">
                            {otherPreserved.map(item => <li key={itemKey(item)} className="break-words">
                                <span className="font-semibold">{promptName(itemKey(item))}</span>
                                {' — '}{t(`admin.promptAlignment.${item.reason}`)}
                            </li>)}
                        </ul>
                    </div>}

                    {hasAnyDiff && <div className="space-y-2 border-t border-line pt-4">
                        <p className="text-sm text-ink-muted">
                            {selectedItems.length > 0 ? t('admin.promptAlignment.review') : t('admin.promptAlignment.noneSelected')}
                        </p>
                        <Button type="button" disabled={!!busy || stale || selectedItems.length === 0} onClick={apply}>
                            {t('admin.promptAlignment.applySelected', { count: selectedItems.length })}
                        </Button>
                    </div>}
                </>}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={!!busy} onClick={loadPreview}>{t('admin.promptAlignment.reload')}</Button>
                    <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setOpen(false)}>{t('admin.promptAlignment.close')}</Button>
                </div>
            </section>}
        </div>
    );
}
