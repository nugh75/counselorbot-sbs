'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Columns3, RefreshCw, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { PromptFactoryAlignment } from '@/components/admin/PromptFactoryAlignment';
import { PromptFactoryProposals } from '@/components/admin/PromptFactoryProposals';
import { PromptHealthLlm } from '@/components/admin/PromptHealthLlm';
import { PromptHistory } from '@/components/admin/PromptHistory';
import { PromptUsagePanel } from '@/components/admin/PromptUsagePanel';
import {
    PromptCompare, loadPromptCard, postJson,
    type PromptCard, type PromptHealthPath, type PromptHealthStep,
} from '@/components/admin/PromptCompare';
import {
    cellStatus, hasCodeSource, mergeFindings, promptOwnershipStatus, promptScopeAndKey, visibleSurfaces,
    type PromptCellStatus, type PromptHealthFinding, type PromptHealthRun, type PromptOwnershipStatus,
} from '@/lib/prompt-health';
import { cn } from '@/lib/utils';
import { FindingCard } from './PromptHealthFinding';
import { PromptHealthHistory } from './PromptHealthHistory';
import { usePromptName, useSurfaceName } from './PromptHealthLabels';

const STATUS: Record<PromptCellStatus, { icon: typeof CheckCircle2; className: string }> = {
    ok: { icon: CheckCircle2, className: 'border-success-line bg-success-soft text-success-ink' },
    warning: { icon: AlertTriangle, className: 'border-warning-line bg-warning-soft text-warning-ink' },
    error: { icon: XCircle, className: 'border-danger-line bg-danger-soft text-danger-ink' },
    unused: { icon: CircleSlash, className: 'border-line bg-surface-sunken text-ink-muted' },
};

const OWNERSHIP_BADGE: Record<PromptOwnershipStatus, string> = {
    factory: 'border-success-line bg-success-soft text-success-ink',
    customised: 'border-brand-line bg-brand-soft text-link',
    factory_update: 'border-warning-line bg-warning-soft text-warning-ink',
    code: 'border-info-line bg-info-soft text-info-ink',
};

type CompareRequest = { prompts: string[]; focus: string | null; propose: boolean; key: number };
type OpenCompare = (prompts: string[], focus: string | null, propose?: boolean) => void;

function OwnershipBadge({ status }: { status: PromptOwnershipStatus }) {
    const { t } = useI18n();
    return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold', OWNERSHIP_BADGE[status])}>
        {t(`admin.promptHealth.ownership.${status}`)}
    </span>;
}

/** Scheda di un prompt: stato rispetto alla fabbrica, cronologia versioni, dove arriva, avvisi aperti. */
function PromptCardView({ id, paths, onCompare, onChanged, onClose }: {
    id: string;
    paths: PromptHealthPath[];
    onCompare: OpenCompare;
    onChanged: () => void;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const titleId = useId();
    const name = usePromptName(paths);
    const surfaceName = useSurfaceName(paths);
    const [card, setCard] = useState<PromptCard | null>(null);
    const [error, setError] = useState(false);
    // Il genitore usa `key={id}`: ogni prompt monta una scheda nuova.
    const reload = useCallback(() => {
        loadPromptCard(id).then(next => { setCard(next); setError(false); }).catch(() => setError(true));
    }, [id]);
    useEffect(() => { reload(); }, [reload]);
    const where = card?.surfaces ? visibleSurfaces(card.surfaces.map(surfaceName), 6) : null;
    const ownership = card ? promptOwnershipStatus(card) : null;
    const historyTarget = promptScopeAndKey(id);
    return <Card as="section" id="prompt-health-card" aria-labelledby={titleId} className="scroll-mt-4 space-y-3">
        <div className="flex flex-wrap items-start gap-2">
            <h3 id={titleId} className="min-w-0 flex-1 break-words text-base font-semibold text-ink-strong">{name(id)}</h3>
            <Button type="button" variant="ghost" onClick={onClose}>{t('admin.promptHealth.close')}</Button>
        </div>
        {error && <Callout variant="danger">{t('admin.promptHealth.compare.loadError')}</Callout>}
        {card && <>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="font-semibold text-ink-body">{t('admin.promptHealth.card.state')}</dt>
                <dd>{ownership && <OwnershipBadge status={ownership} />}</dd>
                {card.consumer && <><dt className="font-semibold text-ink-body">{t('admin.promptHealth.card.consumer')}</dt><dd className="break-words font-mono text-xs text-ink-muted">{card.consumer}</dd></>}
                <dt className="font-semibold text-ink-body">{t('admin.promptHealth.card.arrives')}</dt>
                <dd className="break-words text-ink-muted">{where
                    ? <>{where.shown.join('; ')}{where.hidden > 0 ? ` ${t('admin.promptHealth.more', { count: where.hidden })}` : ''}</>
                    : t('admin.promptHealth.card.everywhere')}</dd>
            </dl>
            {card.editable && <Button type="button" variant="secondary" onClick={() => onCompare([id], null)}>
                <Columns3 className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.card.openEditor')}
            </Button>}
            {card.editable && historyTarget && <PromptHistory
                scope={historyTarget.scope}
                targetKey={historyTarget.key}
                currentValue={card.text ?? ''}
                onRestored={() => { reload(); onChanged(); }}
            />}
            {card.findings.length === 0
                ? <Callout variant="success">{t('admin.promptHealth.card.noFindings')}</Callout>
                : <ul className="space-y-2">{card.findings.map(finding => <FindingCard key={finding.id} finding={finding} paths={paths} onCompare={onCompare} onChanged={onChanged} />)}</ul>}
        </>}
    </Card>;
}

/** Mappa percorsi × passi con lo stato di ogni passo. */
function PathMap({ paths, findings, selected, onSelect }: {
    paths: PromptHealthPath[];
    findings: PromptHealthFinding[];
    selected: string | null;
    onSelect: (step: PromptHealthStep) => void;
}) {
    const { t, lang } = useI18n();
    return <div className="space-y-3">
        <ul className="flex flex-wrap gap-3 text-xs text-ink-muted" aria-label={t('admin.promptHealth.map.legend')}>
            {(Object.keys(STATUS) as PromptCellStatus[]).map(status => {
                const Icon = STATUS[status].icon;
                return <li key={status} className="inline-flex items-center gap-1"><Icon className="h-4 w-4" aria-hidden="true" />{t(`admin.promptHealth.status.${status}`)}</li>;
            })}
        </ul>
        {paths.map(path => <div key={path.instrument} className="space-y-1">
            <h3 className="text-sm font-semibold text-ink-strong">{path.instrument}</h3>
            <ul className="flex flex-wrap gap-2">
                {path.steps.map(step => {
                    const status = cellStatus(step, findings);
                    const { icon: Icon, className } = STATUS[status];
                    return <li key={step.id}>
                        <button type="button" onClick={() => onSelect(step)} aria-pressed={selected === step.id}
                            className={cn('inline-flex min-h-control items-center gap-1 rounded-control border px-3 text-xs font-semibold', className,
                                selected === step.id && 'ring-2 ring-brand')}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            <span>{step.label_i18n?.[lang] || step.label}</span>
                            <span className="sr-only">: {t(`admin.promptHealth.status.${status}`)}</span>
                        </button>
                    </li>;
                })}
            </ul>
        </div>)}
    </div>;
}

/** Elenco completo dei prompt salvati nel database con stato rispetto alla fabbrica (#775). */
function PromptStatusCatalog({ statuses, paths, selectedId, onOpen }: {
    statuses: Record<string, PromptOwnershipStatus>;
    paths: PromptHealthPath[];
    selectedId: string | null;
    onOpen: (id: string) => void;
}) {
    const { t } = useI18n();
    const name = usePromptName(paths);
    const searchId = useId();
    const [statusFilter, setStatusFilter] = useState<'all' | 'factory_update' | 'customised' | 'factory'>('all');
    const [query, setQuery] = useState('');

    const entries = useMemo(() => Object.entries(statuses)
        .map(([id, status]) => ({ id, status, label: name(id) }))
        .sort((a, b) => a.label.localeCompare(b.label)), [statuses, name]);

    const counts = useMemo(() => ({
        all: entries.length,
        factory: entries.filter(e => e.status === 'factory').length,
        customised: entries.filter(e => e.status === 'customised').length,
        factory_update: entries.filter(e => e.status === 'factory_update').length,
    }), [entries]);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return entries.filter(item =>
            (statusFilter === 'all' || item.status === statusFilter)
            && (!needle || item.label.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)),
        );
    }, [entries, statusFilter, query]);

    return <div className="space-y-3">
        <p className="text-sm text-ink-muted">{t('admin.promptHealth.catalog.help')}</p>
        <p className="text-sm text-ink-body">
            {t('admin.promptHealth.catalog.summary', {
                factory: counts.factory,
                customised: counts.customised,
                updates: counts.factory_update,
            })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={statusFilter === 'all' ? 'primary' : 'secondary'}
                aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
                {t('admin.promptHealth.catalog.filterAll', { count: counts.all })}
            </Button>
            {(['factory_update', 'customised', 'factory'] as const).map(status => (
                <Button key={status} type="button" size="sm" variant={statusFilter === status ? 'primary' : 'secondary'}
                    aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>
                    {t(`admin.promptHealth.ownership.${status}`)} ({counts[status]})
                </Button>
            ))}
        </div>
        <div>
            <label htmlFor={searchId} className="sr-only">{t('admin.promptHealth.catalog.search')}</label>
            <input
                id={searchId}
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t('admin.promptHealth.catalog.search')}
                className="min-h-control w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-body sm:max-w-sm"
            />
        </div>
        {visible.length === 0
            ? <Callout variant="info">{t('admin.promptHealth.catalog.empty')}</Callout>
            : <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {visible.map(item => <li key={item.id}>
                    <button
                        type="button"
                        onClick={() => onOpen(item.id)}
                        aria-pressed={selectedId === item.id}
                        className={cn(
                            'flex min-h-control w-full flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2 text-left text-sm transition-colors hover:bg-surface-sunken',
                            selectedId === item.id && 'ring-2 ring-brand',
                        )}
                    >
                        <span className="min-w-0 flex-1 break-words font-semibold text-ink-strong">
                            {item.label}
                            <code className="ml-2 font-mono text-xs font-normal text-ink-muted">{item.id}</code>
                        </span>
                        <OwnershipBadge status={item.status} />
                    </button>
                </li>)}
            </ul>}
    </div>;
}

async function fetchHealth(): Promise<{
    run: PromptHealthRun | null;
    pendingProposals: number;
    paths: PromptHealthPath[];
    promptStatuses: Record<string, PromptOwnershipStatus>;
    llm: PromptHealthFinding[];
}> {
    const [health, map, llm] = await Promise.all([apiFetch('/api/admin/prompt-health'), apiFetch('/api/admin/prompt-health/map'),
        apiFetch('/api/admin/prompt-health/llm')]);
    if (!health.ok || !map.ok) throw new Error('load');
    // Le contraddizioni del modello (#763) vengono dalla memoria: nessuna chiamata qui.
    const llmFindings: PromptHealthFinding[] = llm.ok ? (await llm.json()).findings : [];
    const [healthPayload, mapPayload] = await Promise.all([health.json(), map.json()]);
    return {
        run: healthPayload.run,
        pendingProposals: typeof healthPayload.pending_proposals === 'number' ? healthPayload.pending_proposals : 0,
        paths: mapPayload.paths,
        promptStatuses: mapPayload.prompt_statuses ?? {},
        llm: llmFindings,
    };
}

/** Pagina «Salute dei prompt» (#761, #775, #776): problemi, stato prompt, proposte e allineamento di fabbrica, confronto. */
export function PromptHealthPage() {
    const { t, lang } = useI18n();
    const [run, setRun] = useState<PromptHealthRun | null>(null);
    const [pendingProposals, setPendingProposals] = useState(0);
    const [proposalsVersion, setProposalsVersion] = useState(0);
    const [paths, setPaths] = useState<PromptHealthPath[]>([]);
    const [promptStatuses, setPromptStatuses] = useState<Record<string, PromptOwnershipStatus>>({});
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [step, setStep] = useState<PromptHealthStep | null>(null);
    const [cardId, setCardId] = useState<string | null>(null);
    const [compare, setCompare] = useState<CompareRequest | null>(null);
    const [llmFindings, setLlmFindings] = useState<PromptHealthFinding[]>([]);
    const [showAcked, setShowAcked] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [filter, setFilter] = useState<'all' | 'code' | 'prompts'>('all');
    const name = usePromptName(paths);

    const load = useCallback(() => fetchHealth().then(state => {
        setRun(state.run);
        setPendingProposals(state.pendingProposals);
        setPaths(state.paths);
        setPromptStatuses(state.promptStatuses);
        setLlmFindings(state.llm);
        setProposalsVersion(v => v + 1);
        setError(false);
    }).catch(() => setError(true)), []);
    useEffect(() => {
        fetchHealth().then(state => {
            setRun(state.run);
            setPendingProposals(state.pendingProposals);
            setPaths(state.paths);
            setPromptStatuses(state.promptStatuses);
            setLlmFindings(state.llm);
        }).catch(() => setError(true));
    }, []);

    const runNow = async () => {
        setBusy(true);
        try {
            setRun((await postJson<{ run: PromptHealthRun }>('/api/admin/prompt-health/run', {})).run);
            setError(false);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    const openCompare = useCallback<OpenCompare>((prompts, focus, propose = false) => {
        setCompare(current => ({ prompts, focus, propose, key: (current?.key ?? 0) + 1 }));
        window.requestAnimationFrame(() => document.getElementById('prompt-health-compare')?.scrollIntoView({ block: 'start' }));
    }, []);

    const openCard = useCallback((id: string) => {
        setCardId(id);
        window.requestAnimationFrame(() => document.getElementById('prompt-health-card')?.scrollIntoView({ block: 'start' }));
    }, []);

    const findings = useMemo(() => {
        const rank = { high: 0, medium: 1, low: 2 };
        return mergeFindings(run?.findings ?? [], llmFindings).sort((a, b) => rank[a.severity] - rank[b.severity]);
    }, [run, llmFindings]);
    const llmOpen = llmFindings.filter(finding => !finding.ack).length;
    const open = findings.filter(finding => !finding.ack);
    const acked = findings.filter(finding => finding.ack);
    const codeCount = open.filter(hasCodeSource).length;
    const visible = open.filter(finding => filter === 'all' || (filter === 'code' ? hasCodeSource(finding) : !hasCodeSource(finding)));
    const knownPrompts = useMemo(() => [...new Set([
        ...Object.keys(promptStatuses),
        ...paths.flatMap(path => path.steps.flatMap(item => item.prompts)),
        ...findings.flatMap(finding => finding.editable ?? []),
    ])].sort(), [promptStatuses, paths, findings]);

    return <div className="space-y-6">
        <Card as="section" aria-labelledby="prompt-health-title" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <h2 id="prompt-health-title" className="text-xl font-semibold text-ink-strong">{t('admin.promptHealth.page.title')}</h2>
                {pendingProposals > 0 && (
                    <a
                        href="#prompt-factory-proposals"
                        className="inline-flex items-center rounded-full border border-warning-line bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-ink hover:underline"
                    >
                        {t('admin.promptProposals.badge', { count: pendingProposals })}
                    </a>
                )}
            </div>
            <p className="text-sm text-ink-muted">{t('admin.promptHealth.page.help')}</p>
            {run && <p className="text-sm text-ink-body">
                {t('admin.promptHealth.overview.open', { count: open.length })}
                {` · ${t('admin.promptHealth.overview.code', { count: codeCount })}`}
                {acked.length > 0 && ` · ${t('admin.promptHealth.ack.count', { count: acked.length })}`}
                {run.created_at && ` · ${t('admin.promptHealth.checkedAt', { date: new Date(run.created_at).toLocaleString(lang) })}`}
            </p>}
            {error && <Callout variant="danger">{t('admin.promptHealth.loadError')}</Callout>}
            {!error && !run && <Callout variant="info">{t('admin.promptHealth.never')}</Callout>}
            {run && !run.current && <Callout variant="warning">{t('admin.promptHealth.stale')}</Callout>}
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={runNow}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />{busy ? t('admin.promptHealth.running') : t('admin.promptHealth.overview.checkRules')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => openCompare([], null)}>
                    <Columns3 className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.compare.title')}
                </Button>
            </div>
            <PromptFactoryAlignment paths={paths} onApplied={() => { void load(); }} />
        </Card>

        <PromptFactoryProposals
            paths={paths}
            refreshKey={proposalsVersion}
            onChanged={() => { void load(); }}
            onCountChange={setPendingProposals}
        />

        <Card as="section" aria-labelledby="prompt-health-findings" className="space-y-3">
            <h2 id="prompt-health-findings" className="text-lg font-semibold text-ink-strong">{t('admin.promptHealth.findings.title')}</h2>
            <p className="text-sm text-ink-muted">{t('admin.promptHealth.overview.help')}</p>
            <div role="group" className="flex flex-wrap gap-2" aria-label={t('admin.promptHealth.filter.label')}>
                {(['all', 'code', 'prompts'] as const).map(value => <Button key={value} type="button" variant={filter === value ? 'primary' : 'secondary'}
                    size="sm" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(`admin.promptHealth.filter.${value}`)}</Button>)}
            </div>
            {llmOpen > 0 && <p className="text-sm text-ink-body">{t('admin.promptHealth.llm.found', { count: llmOpen })}</p>}
            {run && open.length === 0 && <Callout variant="success">{t('admin.promptHealth.empty')}</Callout>}
            {visible.length > 0 && <ul className="space-y-2">{visible.map(finding => <FindingCard key={finding.id} finding={finding} paths={paths} group="prompt-health-open" onCompare={openCompare} onChanged={load} />)}</ul>}
            {open.length > 0 && visible.length === 0 && <Callout variant="info">{t('admin.promptHealth.filter.empty')}</Callout>}
            {acked.length > 0 && <div className="space-y-2">
                <Button type="button" variant="ghost" aria-expanded={showAcked} onClick={() => setShowAcked(value => !value)}>
                    {t('admin.promptHealth.ack.count', { count: acked.length })}
                </Button>
                {showAcked && <ul className="space-y-2">{acked.map(finding => <FindingCard key={finding.id} finding={finding} paths={paths} onCompare={openCompare} onChanged={load} />)}</ul>}
            </div>}
        </Card>

        {cardId && <PromptCardView key={cardId} id={cardId} paths={paths} onCompare={openCompare} onChanged={load} onClose={() => setCardId(null)} />}

        {compare && <div id="prompt-health-compare" className="scroll-mt-4">
            <PromptCompare key={compare.key} initial={compare.prompts} focus={compare.focus} propose={compare.propose}
                llmFindings={llmFindings} paths={paths} knownPrompts={knownPrompts}
                onClose={() => setCompare(null)} onChanged={load} />
        </div>}

        <details className="rounded-card border border-line bg-surface p-6">
            <summary className="cursor-pointer text-lg font-semibold text-ink-strong">{t('admin.promptHealth.catalog.title')}</summary>
            <div className="mt-4">
                <PromptStatusCatalog statuses={promptStatuses} paths={paths} selectedId={cardId} onOpen={openCard} />
            </div>
        </details>

        <details className="rounded-card border border-line bg-surface p-6">
            <summary className="cursor-pointer text-lg font-semibold text-ink-strong">{t('admin.promptHealth.map.title')}</summary>
            <div className="mt-4 space-y-3">
                <p className="text-sm text-ink-muted">{t('admin.promptHealth.map.help')}</p>
                <PathMap paths={paths} findings={findings} selected={step?.id ?? null} onSelect={setStep} />
                {step && <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-4">
                    <p className="text-sm font-semibold text-ink-body">{t('admin.promptHealth.map.stepPrompts', { step: step.label_i18n?.[lang] || step.label })}</p>
                    <ul className="flex flex-wrap gap-2">
                        {step.prompts.map(id => <li key={id}>
                            <Button type="button" variant="secondary" size="sm" onClick={() => openCard(id)} aria-pressed={cardId === id}>
                                <span>{name(id)}</span>
                                {promptStatuses[id] && <OwnershipBadge status={promptStatuses[id]} />}
                            </Button>
                        </li>)}
                    </ul>
                </div>}
            </div>
        </details>

        <details className="rounded-card border border-line bg-surface p-6" onToggle={event => setShowHistory(event.currentTarget.open)}>
            <summary className="cursor-pointer text-lg font-semibold text-ink-strong">{t('admin.promptHealth.history.title')}</summary>
            {showHistory && <div className="mt-4"><PromptHealthHistory /></div>}
        </details>
        <details className="rounded-card border border-line bg-surface p-6">
            <summary className="cursor-pointer text-lg font-semibold text-ink-strong">{t('admin.promptHealth.llm.title')}</summary>
            <div className="mt-4"><PromptHealthLlm onFindings={setLlmFindings} /></div>
        </details>
        <details className="rounded-card border border-line bg-surface p-6">
            <summary className="cursor-pointer text-lg font-semibold text-ink-strong">{t('admin.promptUsage.title')}</summary>
            <div className="mt-4"><PromptUsagePanel onOpen={openCard} /></div>
        </details>
    </div>;
}
