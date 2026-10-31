'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import {
    PROMPT_SAVED_EVENT, messageParams, promptLabel, topSeverity, visibleSurfaces,
    type PromptHealthFinding, type PromptHealthRun, type PromptHealthSeverity,
} from '@/lib/prompt-health';

const SEVERITY_CLASS: Record<PromptHealthSeverity, string> = {
    high: 'border-danger-line bg-danger-soft text-danger-ink',
    medium: 'border-warning-line bg-warning-soft text-warning-ink',
    low: 'border-info-line bg-info-soft text-info-ink',
};

/** Avvisa il pannello che un prompt è stato salvato: mostra i suoi avvisi nuovi. Mai bloccante. */
export async function notifyPromptSaved(promptId: string | null): Promise<void> {
    if (!promptId || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(PROMPT_SAVED_EVENT, { detail: { promptId, state: 'checking' } }));
    try {
        const response = await apiFetch('/api/admin/prompt-health/check-prompt', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt_id: promptId }),
        });
        const findings: PromptHealthFinding[] = response.ok ? (await response.json()).new : [];
        window.dispatchEvent(new CustomEvent(PROMPT_SAVED_EVENT, { detail: { promptId, state: 'done', findings } }));
    } catch {
        window.dispatchEvent(new CustomEvent(PROMPT_SAVED_EVENT, { detail: { promptId, state: 'done', findings: [] } }));
    }
}

function SeverityBadge({ severity }: { severity: PromptHealthSeverity }) {
    const { t } = useI18n();
    return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[severity]}`}>
        {t(`admin.promptHealth.severity.${severity}`)}
    </span>;
}

function FindingItem({ finding }: { finding: PromptHealthFinding }) {
    const { t } = useI18n();
    const params = messageParams(finding.params);
    if (params.field) params.field = t(`admin.promptHealth.field.${params.field}`);
    const { shown, hidden } = visibleSurfaces(finding.surfaces);
    return <li className="space-y-2 rounded-control border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start gap-2">
            <SeverityBadge severity={finding.severity} />
            <p className="min-w-0 flex-1 text-sm font-semibold text-ink-body">{t(`admin.promptHealth.code.${finding.code}`, params)}</p>
        </div>
        {finding.prompts.length > 0 && <p className="break-words font-mono text-xs text-ink-muted">{finding.prompts.map(promptLabel).join(' · ')}</p>}
        {finding.sentences.length > 0 && <div className={`grid gap-2 ${finding.sentences.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {finding.sentences.map(sentence => <blockquote key={`${sentence.prompt}:${sentence.text}`}
                className="rounded-control border border-line bg-surface-sunken p-2 text-sm text-ink-body">
                <p className="mb-1 break-words font-mono text-xs text-ink-muted">{promptLabel(sentence.prompt)}</p>
                <p className="break-words">«{sentence.text}»</p>
            </blockquote>)}
        </div>}
        {shown.length > 0 && <p className="break-words text-xs text-ink-muted">
            {t('admin.promptHealth.where')}: {shown.join('; ')}{hidden > 0 ? ` ${t('admin.promptHealth.more', { count: hidden })}` : ''}
        </p>}
        <p className="text-xs text-ink-muted"><span className="font-semibold">{t('admin.promptHealth.fix')}:</span> {t(`admin.promptHealth.fix.${finding.code}`)}</p>
    </li>;
}

/** Elenco degli avvisi sui prompt con contatore (#760). Solo in Amministrazione, solo avvisi. */
export function PromptHealthPanel() {
    const { t, lang } = useI18n();
    const panelId = useId();
    const [run, setRun] = useState<PromptHealthRun | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [saved, setSaved] = useState<{ promptId: string; state: 'checking' | 'done'; findings?: PromptHealthFinding[] } | null>(null);

    const load = useCallback(async () => {
        try {
            const response = await apiFetch('/api/admin/prompt-health');
            if (!response.ok) throw new Error('load');
            setRun((await response.json()).run);
            setError(false);
        } catch {
            setError(true);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        const onSaved = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            setSaved(detail);
            if (detail.state === 'done') void load();
        };
        window.addEventListener(PROMPT_SAVED_EVENT, onSaved);
        return () => window.removeEventListener(PROMPT_SAVED_EVENT, onSaved);
    }, [load]);

    const runNow = async () => {
        setBusy(true);
        try {
            const response = await apiFetch('/api/admin/prompt-health/run', { method: 'POST' });
            if (!response.ok) throw new Error('run');
            setRun((await response.json()).run);
            setError(false);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    const counts = run?.counts ?? {};
    const severity = topSeverity(counts);
    const total = counts.total ?? 0;

    return <div className="space-y-4 print:hidden">
        <Button type="button" variant="secondary" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            {t('admin.promptHealth.action')}
            {run && <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${severity ? SEVERITY_CLASS[severity] : 'border-success-line bg-success-soft text-success-ink'}`}>
                {t('admin.promptHealth.count', { count: total })}
            </span>}
        </Button>

        {saved && <div role="status">
            {saved.state === 'checking' && <Callout variant="info">{t('admin.promptHealth.saved.checking')}</Callout>}
            {saved.state === 'done' && (saved.findings?.length
                ? <Callout variant="warning" title={`${t('admin.promptHealth.saved.title')}: ${promptLabel(saved.promptId)}`}>
                    <ul className="space-y-2">{saved.findings.map(finding => <FindingItem key={finding.id} finding={finding} />)}</ul>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSaved(null)}>{t('admin.promptHealth.close')}</Button>
                </Callout>
                : <Callout variant="success">{t('admin.promptHealth.saved.none')}</Callout>)}
        </div>}

        {open && <Card as="section" id={panelId} aria-labelledby={`${panelId}-title`} className="space-y-4">
            <div className="space-y-1">
                <h2 id={`${panelId}-title`} className="text-lg font-semibold text-ink-strong">{t('admin.promptHealth.title')}</h2>
                <p className="text-sm text-ink-muted">{t('admin.promptHealth.help')}</p>
                {run?.created_at && <p className="text-xs text-ink-muted">
                    {t('admin.promptHealth.checkedAt', { date: new Date(run.created_at).toLocaleString(lang) })}
                </p>}
            </div>
            {error && <Callout variant="danger">{t('admin.promptHealth.loadError')}</Callout>}
            {!error && !run && <Callout variant="info">{t('admin.promptHealth.never')}</Callout>}
            {run && !run.current && <Callout variant="warning">{t('admin.promptHealth.stale')}</Callout>}
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={runNow}>
                    {busy ? t('admin.promptHealth.running') : t('admin.promptHealth.run')}
                </Button>
                {/* Caricamento completo: la scheda attiva si legge dall'URL solo all'avvio. */}
                <a href="/admin?tab=promptHealth" className="inline-flex min-h-control items-center rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-body hover:bg-surface-sunken">
                    {t('admin.promptHealth.page.open')}
                </a>
            </div>
            {run && (run.findings.length === 0
                ? <Callout variant="success">{t('admin.promptHealth.empty')}</Callout>
                : <ul className="space-y-2">{run.findings.map(finding => <FindingItem key={finding.id} finding={finding} />)}</ul>)}
        </Card>}
    </div>;
}
