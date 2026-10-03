'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

interface PlanItem {
    scope: 'config' | 'guided_step';
    key: string;
}

interface AlignmentPlan {
    review_hash: string;
    changes: (PlanItem & { before: string; after: string })[];
    preserved: (PlanItem & { reason: 'personalised' | 'different_instrument' })[];
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

export function PromptFactoryAlignment({ disabled, stepLabels, onApplied, onBusyChange }: {
    disabled: boolean;
    stepLabels: Record<string, string>;
    onApplied: (result: FactoryAlignmentResult) => void;
    onBusyChange: (busy: boolean) => void;
}) {
    const { t } = useI18n();
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [plan, setPlan] = useState<AlignmentPlan | null>(null);
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
            onBusyChange(false);
        };
    }, [onBusyChange]);

    const start = (operation: 'preview' | 'apply') => {
        inFlight.current = true;
        controller.current = new AbortController();
        setBusy(operation);
        setError(null);
        onBusyChange(true);
    };
    const finish = () => {
        inFlight.current = false;
        if (mounted.current) {
            setBusy(null);
            onBusyChange(false);
        }
    };

    const loadPreview = async () => {
        if (disabled || inFlight.current) return;
        setOpen(true);
        setPlan(null);
        setApplied(null);
        setStale(false);
        start('preview');
        try {
            const response = await fetch('/api/admin/prompt-factory-alignment/preview', {
                credentials: 'include', signal: controller.current?.signal,
            });
            if (!response.ok) throw new Error('preview');
            const next: AlignmentPlan = await response.json();
            if (mounted.current) setPlan(next);
        } catch {
            if (mounted.current) setError(ALIGNMENT_ERRORS.load);
        } finally {
            finish();
        }
    };

    const apply = async () => {
        if (!plan?.changes.length || disabled || stale || inFlight.current) return;
        start('apply');
        try {
            const response = await fetch('/api/admin/prompt-factory-alignment/apply', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ review_hash: plan.review_hash }),
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
                onApplied(result);
                setApplied(result.updated);
                setPlan(null);
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

    const itemLabel = (item: PlanItem) => {
        if (item.scope === 'guided_step') return stepLabels[item.key] || item.key;
        const key = `admin.config.label.${item.key}`;
        const label = t(key);
        return label === key ? item.key : label;
    };

    return (
        <div className="space-y-3 print:hidden">
            <Button type="button" variant="secondary" disabled={disabled || !!busy}
                aria-expanded={open} aria-controls={panelId} onClick={loadPreview}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {t('admin.promptAlignment.action')}
            </Button>
            {disabled && <p className="text-sm text-slate-600" role="status">{t('admin.promptAlignment.drafts')}</p>}
            {open && <section id={panelId} aria-label={t('admin.promptAlignment.title')}
                aria-busy={!!busy} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="font-semibold text-slate-900">{t('admin.promptAlignment.title')}</h4>
                <p className="text-sm text-slate-600">{t('admin.promptAlignment.help')}</p>
                {busy && <p role="status" className="text-sm text-slate-600">{t(`admin.promptAlignment.${busy === 'preview' ? 'loading' : 'applying'}`)}</p>}
                {error && <Callout variant="danger">{t(error)}</Callout>}
                {applied !== null && <p role="status" className="text-sm font-semibold text-indigo-700">{t('admin.promptAlignment.success', { count: applied })}</p>}
                {plan && <>
                    <p className="text-sm font-semibold text-slate-800">{t('admin.promptAlignment.changed', { count: plan.changes.length })}</p>
                    {!plan.changes.length && <p role="status" className="text-sm text-slate-600">{t('admin.promptAlignment.empty')}</p>}
                    {plan.changes.map(item => <details key={`${item.scope}/${item.key}`} className="rounded-lg border border-slate-200 p-3">
                        <summary className="cursor-pointer break-words text-sm font-semibold text-slate-800">
                            {itemLabel(item)}
                            {itemLabel(item) !== item.key && <code className="ml-2 font-mono text-xs font-normal text-slate-600">{item.key}</code>}
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {(['before', 'after'] as const).map(side => <div key={side} className="min-w-0 space-y-2">
                                <h5 className="text-sm font-semibold text-slate-700">{t(`admin.promptAlignment.${side}`)}</h5>
                                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-800">{item[side]}</pre>
                            </div>)}
                        </div>
                    </details>)}
                    <div className="space-y-2">
                        <h5 className="text-sm font-semibold text-slate-800">{t('admin.promptAlignment.preserved', { count: plan.preserved.length })}</h5>
                        {plan.preserved.length > 0 && <ul className="space-y-1 text-sm text-slate-600">
                            {plan.preserved.map(item => <li key={`${item.scope}/${item.key}`} className="break-words">
                                <span className="font-medium">{itemLabel(item)}</span>
                                {itemLabel(item) !== item.key && <code className="ml-2 font-mono text-xs">{item.key}</code>}
                                {' — '}{t(`admin.promptAlignment.${item.reason}`)}
                            </li>)}
                        </ul>}
                    </div>
                    {plan.changes.length > 0 && <>
                        <p className="text-sm text-slate-600">{t('admin.promptAlignment.review')}</p>
                        <Button type="button" disabled={disabled || !!busy || stale} onClick={apply}>
                            {t('admin.promptAlignment.confirm')}
                        </Button>
                    </>}
                </>}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={disabled || !!busy} onClick={loadPreview}>{t('admin.promptAlignment.reload')}</Button>
                    <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setOpen(false)}>{t('admin.promptAlignment.close')}</Button>
                </div>
            </section>}
        </div>
    );
}
