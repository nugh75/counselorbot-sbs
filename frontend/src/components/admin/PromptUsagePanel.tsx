'use client';

import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, FileText, Minus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { promptLabel } from '@/lib/prompt-health';
import {
    USAGE_WINDOWS, sortedDefects, stepLabel, withDefects,
    type PromptUsageReport, type UsageTrend,
} from '@/lib/prompt-usage';

const LIST_LIMIT = 10;

function Trend({ trend, previous }: { trend: UsageTrend; previous: number }) {
    const { t } = useI18n();
    const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
    const tone = trend === 'up' ? 'text-warning-ink' : trend === 'down' ? 'text-success-ink' : 'text-ink-muted';
    return <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {t(`admin.promptUsage.trend.${trend ?? 'new'}`)}
        {trend && <span className="text-ink-muted">({t('admin.promptUsage.previous', { count: previous })})</span>}
    </span>;
}

function DefectChips({ defects }: { defects: Record<string, number> }) {
    const { t } = useI18n();
    return <ul className="flex flex-wrap gap-1">
        {sortedDefects(defects).map(([code, count]) => <li key={code}
            className="rounded-control border border-warning-line bg-warning-soft px-2 py-1 text-xs text-warning-ink">
            {t(`admin.promptUsage.defect.${code}`)}{`: ${count}`}
        </li>)}
    </ul>;
}

/** Uso reale dei prompt (#762): ultimo uso, prompt attesi mai usati, difetti con trend. Solo avvisi. */
export function PromptUsagePanel({ onOpen }: { onOpen: (id: string) => void }) {
    const { t, lang } = useI18n();
    const [days, setDays] = useState<number>(30);
    const [report, setReport] = useState<PromptUsageReport | null>(null);
    const [error, setError] = useState(false);
    const [showLastUse, setShowLastUse] = useState(false);
    const [allUnused, setAllUnused] = useState(false);

    useEffect(() => {
        let alive = true;
        apiFetch(`/api/admin/prompt-health/usage?days=${days}`)
            .then(response => { if (!response.ok) throw new Error('usage'); return response.json(); })
            .then((data: PromptUsageReport) => { if (alive) { setReport(data); setError(false); } })
            .catch(() => { if (alive) setError(true); });
        return () => { alive = false; };
    }, [days]);

    const date = (iso: string) => new Date(iso).toLocaleDateString(lang);
    const promptRows = report ? withDefects(report.prompts) : [];
    const stepRows = report ? withDefects(report.steps) : [];
    const unused = report?.never_used ?? [];
    const unusedShown = allUnused ? unused : unused.slice(0, LIST_LIMIT);

    return <Card as="section" aria-labelledby="prompt-usage-title" className="space-y-4">
        <h2 id="prompt-usage-title" className="text-lg font-semibold text-ink-strong">{t('admin.promptUsage.title')}</h2>
        <p className="text-sm text-ink-muted">{t('admin.promptUsage.help')}</p>
        <div role="group" aria-label={t('admin.promptUsage.period')} className="flex flex-wrap gap-2">
            {USAGE_WINDOWS.map(value => <Button key={value} type="button" variant={value === days ? 'primary' : 'secondary'}
                aria-pressed={value === days} onClick={() => setDays(value)}>
                {t('admin.promptUsage.days', { days: value })}
            </Button>)}
        </div>
        {error && <Callout variant="danger">{t('admin.promptUsage.loadError')}</Callout>}
        {report && <>
            <p className="text-sm text-ink-body">
                {t('admin.promptUsage.turns', { count: report.turns })}
                {report.tracking_since && ` · ${t('admin.promptUsage.since', { date: date(report.tracking_since) })}`}
                {` · ${t('admin.promptUsage.retention', { days: report.retention_days })}`}
            </p>
            {report.turns === 0 && <Callout variant="info">{t('admin.promptUsage.empty')}</Callout>}
            {report.turns > 0 && report.partial && <Callout variant="info">{t('admin.promptUsage.partial')}</Callout>}

            {report.turns > 0 && <section aria-labelledby="prompt-usage-by-prompt" className="space-y-2">
                <h3 id="prompt-usage-by-prompt" className="text-base font-semibold text-ink-strong">{t('admin.promptUsage.byPrompt')}</h3>
                {promptRows.length === 0
                    ? <Callout variant="success">{t('admin.promptUsage.noDefects')}</Callout>
                    : <ul className="space-y-2">{promptRows.map(row => <li key={row.id} className="space-y-2 rounded-control border border-line bg-surface p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 break-words font-mono text-sm font-semibold text-ink-body">{promptLabel(row.id)}</span>
                            <Trend trend={row.trend} previous={row.previous_total} />
                        </div>
                        <p className="text-xs text-ink-muted">{t('admin.promptUsage.uses', { count: row.uses })}</p>
                        <DefectChips defects={row.defects} />
                        {!row.id.startsWith('code:') && <Button type="button" variant="secondary" onClick={() => onOpen(row.id)}>
                            <FileText className="h-4 w-4" aria-hidden="true" />{t('admin.promptUsage.open')}
                        </Button>}
                    </li>)}</ul>}
            </section>}

            {stepRows.length > 0 && <section aria-labelledby="prompt-usage-by-step" className="space-y-2">
                <h3 id="prompt-usage-by-step" className="text-base font-semibold text-ink-strong">{t('admin.promptUsage.byStep')}</h3>
                <ul className="space-y-2">{stepRows.map(row => <li key={`${row.surface}|${row.instrument}|${row.step}`}
                    className="space-y-2 rounded-control border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 break-words text-sm text-ink-body">
                            <span className="font-semibold">{t(`admin.promptUsage.surface.${row.surface}`)}</span>
                            {stepLabel(row) && <span className="font-mono"> · {stepLabel(row)}</span>}
                        </span>
                        <Trend trend={row.trend} previous={row.previous_total} />
                    </div>
                    <p className="text-xs text-ink-muted">{t('admin.promptUsage.turnsShort', { count: row.turns })}</p>
                    <DefectChips defects={row.defects} />
                </li>)}</ul>
            </section>}

            {report.turns > 0 && <section aria-labelledby="prompt-usage-unused" className="space-y-2">
                <h3 id="prompt-usage-unused" className="text-base font-semibold text-ink-strong">{t('admin.promptUsage.neverUsed')}</h3>
                {unused.length === 0
                    ? <Callout variant="success">{t('admin.promptUsage.allUsed')}</Callout>
                    : <>
                        <Callout variant="warning">{t('admin.promptUsage.neverUsedHelp', { days: report.days })}</Callout>
                        <ul className="flex flex-wrap gap-2">{unusedShown.map(id => <li key={id}>
                            {id.startsWith('code:')
                                ? <span className="inline-flex min-h-control items-center rounded-control border border-line px-3 font-mono text-xs text-ink-muted">{promptLabel(id)}</span>
                                : <Button type="button" variant="secondary" onClick={() => onOpen(id)}><span className="font-mono">{promptLabel(id)}</span></Button>}
                        </li>)}</ul>
                        {unused.length > LIST_LIMIT && !allUnused && <Button type="button" variant="ghost" onClick={() => setAllUnused(true)}>
                            {t('admin.promptUsage.more', { count: unused.length })}
                        </Button>}
                    </>}
            </section>}

            {report.prompts.length > 0 && <div className="space-y-2">
                <Button type="button" variant="ghost" aria-expanded={showLastUse} aria-controls="prompt-usage-last"
                    onClick={() => setShowLastUse(value => !value)}>
                    {showLastUse ? t('admin.promptUsage.hideLastUse') : t('admin.promptUsage.showLastUse')}
                </Button>
                {showLastUse && <dl id="prompt-usage-last" className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[1fr_auto]">
                    {[...report.prompts].sort((a, b) => a.id.localeCompare(b.id)).map(row => <div key={row.id} className="contents">
                        <dt className="break-words font-mono text-xs text-ink-body">{promptLabel(row.id)}</dt>
                        <dd className="text-xs text-ink-muted">{t('admin.promptUsage.lastUse')}: {date(row.last_used)}</dd>
                    </div>)}
                </dl>}
            </div>}
        </>}
    </Card>;
}
