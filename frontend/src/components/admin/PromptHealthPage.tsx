'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Columns3, ExternalLink, FileText, Flag, RefreshCw, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { PromptUsagePanel } from '@/components/admin/PromptUsagePanel';
import {
    PromptCompare, SEVERITY_TEXT, loadPromptCard, postJson, useFindingMessage,
    type PromptCard, type PromptHealthPath, type PromptHealthStep,
} from '@/components/admin/PromptCompare';
import {
    cellStatus, codeIssueUrl, compareTargets, promptLabel, visibleSurfaces,
    type PromptCellStatus, type PromptHealthFinding, type PromptHealthRun,
} from '@/lib/prompt-health';
import { cn } from '@/lib/utils';

const STATUS: Record<PromptCellStatus, { icon: typeof CheckCircle2; className: string }> = {
    ok: { icon: CheckCircle2, className: 'border-success-line bg-success-soft text-success-ink' },
    warning: { icon: AlertTriangle, className: 'border-warning-line bg-warning-soft text-warning-ink' },
    error: { icon: XCircle, className: 'border-danger-line bg-danger-soft text-danger-ink' },
    unused: { icon: CircleSlash, className: 'border-line bg-surface-sunken text-ink-muted' },
};

type CompareRequest = { prompts: string[]; focus: string | null; key: number };

/** Azioni su un avviso (#761). Nessuna blocca un salvataggio. */
function FindingActions({ finding, onCompare, onChanged }: {
    finding: PromptHealthFinding;
    onCompare: (prompts: string[], focus: string | null) => void;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const message = useFindingMessage();
    const noteId = useId();
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState('');
    const [restoring, setRestoring] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<'still' | 'gone' | 'error' | null>(null);
    const editable = finding.editable ?? [];
    const factory = new Set(finding.factory ?? []);
    const customised = editable.filter(id => !factory.has(id));
    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        try { await action(); } catch { setResult('error'); } finally { setBusy(false); }
    };
    const mark = () => run(async () => {
        await postJson('/api/admin/prompt-health/acks', { finding_id: finding.id, note });
        setNoteOpen(false);
        onChanged();
    });
    const unmark = () => run(async () => {
        const response = await apiFetch(`/api/admin/prompt-health/acks/${finding.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('ack');
        onChanged();
    });
    const restore = (id: string) => run(async () => {
        setRestoring(null);
        await postJson('/api/admin/prompt-health/restore-factory', { prompt_id: id });
        onChanged();
    });
    const recheck = () => run(async () => {
        const prompts = editable.length ? editable : finding.prompts.filter(id => !id.startsWith('code:'));
        const response = await postJson<{ findings: PromptHealthFinding[] }>('/api/admin/prompt-health/evaluate', { prompt_ids: prompts.slice(0, 3) });
        setResult(response.findings.some(item => item.id === finding.id) ? 'still' : 'gone');
    });

    return <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
            {editable.length > 0 && <Button type="button" variant="secondary" size="sm" onClick={() => onCompare([editable[0]], finding.id)}>
                <FileText className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.open')}
            </Button>}
            {editable.length > 0 && <Button type="button" variant="secondary" size="sm" onClick={() => onCompare(compareTargets(finding), finding.id)}>
                <Columns3 className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.compare')}
            </Button>}
            {customised.map(id => restoring === id
                ? <ConfirmInline key={id} question={t('admin.promptHealth.compare.restoreConfirm')} onConfirm={() => restore(id)} onCancel={() => setRestoring(null)} busy={busy} />
                : <Button key={id} type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setRestoring(id)}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.restore')}{customised.length > 1 ? `: ${promptLabel(id)}` : ''}
                </Button>)}
            {finding.ack
                ? <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={unmark}>
                    <Undo2 className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.unmark')}
                </Button>
                : <Button type="button" variant="secondary" size="sm" aria-expanded={noteOpen} aria-controls={noteId} onClick={() => setNoteOpen(value => !value)}>
                    <Flag className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.mark')}
                </Button>}
            {factory.size > 0 && <a href={codeIssueUrl(finding, message(finding))} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1 rounded-control border border-line bg-surface px-4 py-1 text-xs font-semibold text-ink-body hover:bg-surface-sunken">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.codeIssue')}
                <span className="sr-only">{t('admin.promptHealth.newWindow')}</span>
            </a>}
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={recheck}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.recheck')}
            </Button>
        </div>
        {noteOpen && !finding.ack && <div id={noteId} className="space-y-2">
            <label htmlFor={`${noteId}-note`} className="text-xs font-semibold text-ink-body">{t('admin.promptHealth.ack.note')}</label>
            <textarea id={`${noteId}-note`} value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={2000}
                className="w-full rounded-control border border-line bg-surface p-2 text-sm text-ink-body" />
            <Button type="button" size="sm" disabled={busy} onClick={mark}>{t('admin.promptHealth.ack.save')}</Button>
        </div>}
        <div role="status">
            {result === 'still' && <p className="text-xs text-warning-ink">{t('admin.promptHealth.recheck.still')}</p>}
            {result === 'gone' && <p className="text-xs text-success-ink">{t('admin.promptHealth.recheck.gone')}</p>}
            {result === 'error' && <p className="text-xs text-danger-ink">{t('admin.promptHealth.compare.checkError')}</p>}
        </div>
    </div>;
}

function FindingCard({ finding, onCompare, onChanged }: {
    finding: PromptHealthFinding;
    onCompare: (prompts: string[], focus: string | null) => void;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const message = useFindingMessage();
    const { shown, hidden } = visibleSurfaces(finding.surfaces);
    return <li className="space-y-2 rounded-control border border-line bg-surface p-4">
        <p className="text-sm text-ink-body">
            <span className={cn('font-semibold', SEVERITY_TEXT[finding.severity])}>{t(`admin.promptHealth.severity.${finding.severity}`)}</span>
            {' · '}<span className="font-semibold">{message(finding)}</span>
        </p>
        {finding.sentences.length > 0 && <div className={cn('grid gap-2', finding.sentences.length > 1 && 'md:grid-cols-2')}>
            {finding.sentences.map(sentence => <blockquote key={`${sentence.prompt}:${sentence.text}`}
                className="rounded-control border border-line bg-surface-sunken p-2 text-sm text-ink-body">
                <p className="mb-1 break-words font-mono text-xs text-ink-muted">{promptLabel(sentence.prompt)}</p>
                <p className="break-words underline decoration-danger decoration-wavy underline-offset-4">«{sentence.text}»</p>
            </blockquote>)}
        </div>}
        {finding.sentences.length === 0 && finding.prompts.length > 0 && <p className="break-words font-mono text-xs text-ink-muted">{finding.prompts.map(promptLabel).join(' · ')}</p>}
        {shown.length > 0 && <p className="break-words text-xs text-ink-muted">
            {t('admin.promptHealth.where')}: {shown.join('; ')}{hidden > 0 ? ` ${t('admin.promptHealth.more', { count: hidden })}` : ''}
        </p>}
        <p className="text-xs text-ink-muted"><span className="font-semibold">{t('admin.promptHealth.fix')}:</span> {t(`admin.promptHealth.fix.${finding.code}`)}</p>
        {finding.ack && <p className="text-xs text-ink-muted"><span className="font-semibold">{t('admin.promptHealth.ack.marked')}:</span> {finding.ack.note || '—'}</p>}
        <FindingActions finding={finding} onCompare={onCompare} onChanged={onChanged} />
    </li>;
}

/** Scheda di un prompt: dove arriva, differenza dalla fabbrica, avvisi aperti. */
function PromptCardView({ id, onCompare, onChanged, onClose }: {
    id: string;
    onCompare: (prompts: string[], focus: string | null) => void;
    onChanged: () => void;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const titleId = useId();
    const [card, setCard] = useState<PromptCard | null>(null);
    const [error, setError] = useState(false);
    // Il genitore usa `key={id}`: ogni prompt monta una scheda nuova.
    useEffect(() => { loadPromptCard(id).then(setCard).catch(() => setError(true)); }, [id]);
    const where = card?.surfaces ? visibleSurfaces(card.surfaces, 6) : null;
    return <Card as="section" aria-labelledby={titleId} className="space-y-3">
        <div className="flex flex-wrap items-start gap-2">
            <h3 id={titleId} className="min-w-0 flex-1 break-words font-mono text-base font-semibold text-ink-strong">{promptLabel(id)}</h3>
            <Button type="button" variant="ghost" onClick={onClose}>{t('admin.promptHealth.close')}</Button>
        </div>
        {error && <Callout variant="danger">{t('admin.promptHealth.compare.loadError')}</Callout>}
        {card && <>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="font-semibold text-ink-body">{t('admin.promptHealth.card.state')}</dt>
                <dd className="text-ink-muted">{card.customised ? t('admin.promptHealth.card.customised') : card.differs_from_factory ? t('admin.promptHealth.card.differs') : t('admin.promptHealth.card.factory')}</dd>
                {card.consumer && <><dt className="font-semibold text-ink-body">{t('admin.promptHealth.card.consumer')}</dt><dd className="break-words font-mono text-xs text-ink-muted">{card.consumer}</dd></>}
                <dt className="font-semibold text-ink-body">{t('admin.promptHealth.card.arrives')}</dt>
                <dd className="break-words text-ink-muted">{where
                    ? <>{where.shown.join('; ')}{where.hidden > 0 ? ` ${t('admin.promptHealth.more', { count: where.hidden })}` : ''}</>
                    : t('admin.promptHealth.card.everywhere')}</dd>
            </dl>
            {card.editable && <Button type="button" variant="secondary" onClick={() => onCompare([id], null)}>
                <Columns3 className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.card.openEditor')}
            </Button>}
            {card.findings.length === 0
                ? <Callout variant="success">{t('admin.promptHealth.card.noFindings')}</Callout>
                : <ul className="space-y-2">{card.findings.map(finding => <FindingCard key={finding.id} finding={finding} onCompare={onCompare} onChanged={onChanged} />)}</ul>}
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
    const { t } = useI18n();
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
                            <span className="font-mono">{step.id}</span>
                            <span className="sr-only">: {t(`admin.promptHealth.status.${status}`)}</span>
                        </button>
                    </li>;
                })}
            </ul>
        </div>)}
    </div>;
}

async function fetchHealth(): Promise<{ run: PromptHealthRun | null; paths: PromptHealthPath[] }> {
    const [health, map] = await Promise.all([apiFetch('/api/admin/prompt-health'), apiFetch('/api/admin/prompt-health/map')]);
    if (!health.ok || !map.ok) throw new Error('load');
    return { run: (await health.json()).run, paths: (await map.json()).paths };
}

/** Pagina «Salute dei prompt» (#761): mappa, schede, avvisi con azioni, confronto. */
export function PromptHealthPage() {
    const { t, lang } = useI18n();
    const [run, setRun] = useState<PromptHealthRun | null>(null);
    const [paths, setPaths] = useState<PromptHealthPath[]>([]);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [step, setStep] = useState<PromptHealthStep | null>(null);
    const [cardId, setCardId] = useState<string | null>(null);
    const [compare, setCompare] = useState<CompareRequest | null>(null);
    const [showAcked, setShowAcked] = useState(false);

    const load = useCallback(() => fetchHealth().then(state => {
        setRun(state.run);
        setPaths(state.paths);
        setError(false);
    }).catch(() => setError(true)), []);
    useEffect(() => {
        fetchHealth().then(state => { setRun(state.run); setPaths(state.paths); }).catch(() => setError(true));
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

    const openCompare = useCallback((prompts: string[], focus: string | null) => {
        setCompare(current => ({ prompts, focus, key: (current?.key ?? 0) + 1 }));
        window.requestAnimationFrame(() => document.getElementById('prompt-health-compare')?.scrollIntoView({ block: 'start' }));
    }, []);

    const findings = useMemo(() => run?.findings ?? [], [run]);
    const open = findings.filter(finding => !finding.ack);
    const acked = findings.filter(finding => finding.ack);
    const knownPrompts = useMemo(() => [...new Set([
        ...paths.flatMap(path => path.steps.flatMap(item => item.prompts)),
        ...findings.flatMap(finding => finding.editable ?? []),
    ])].sort(), [paths, findings]);

    return <div className="space-y-6">
        <Card as="section" aria-labelledby="prompt-health-title" className="space-y-3">
            <h2 id="prompt-health-title" className="text-xl font-semibold text-ink-strong">{t('admin.promptHealth.page.title')}</h2>
            <p className="text-sm text-ink-muted">{t('admin.promptHealth.page.help')}</p>
            {run && <p className="text-sm text-ink-body">
                {t('admin.promptHealth.count', { count: run.counts.total ?? 0 })}
                {(run.counts.acknowledged ?? 0) > 0 && ` · ${t('admin.promptHealth.ack.count', { count: run.counts.acknowledged ?? 0 })}`}
                {run.created_at && ` · ${t('admin.promptHealth.checkedAt', { date: new Date(run.created_at).toLocaleString(lang) })}`}
            </p>}
            {error && <Callout variant="danger">{t('admin.promptHealth.loadError')}</Callout>}
            {!error && !run && <Callout variant="info">{t('admin.promptHealth.never')}</Callout>}
            {run && !run.current && <Callout variant="warning">{t('admin.promptHealth.stale')}</Callout>}
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={runNow}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />{busy ? t('admin.promptHealth.running') : t('admin.promptHealth.run')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => openCompare([], null)}>
                    <Columns3 className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.compare.title')}
                </Button>
            </div>
        </Card>

        <Card as="section" aria-labelledby="prompt-health-map" className="space-y-3">
            <h2 id="prompt-health-map" className="text-lg font-semibold text-ink-strong">{t('admin.promptHealth.map.title')}</h2>
            <p className="text-sm text-ink-muted">{t('admin.promptHealth.map.help')}</p>
            <PathMap paths={paths} findings={findings} selected={step?.id ?? null} onSelect={setStep} />
            {step && <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-4">
                <p className="text-sm font-semibold text-ink-body">{t('admin.promptHealth.map.stepPrompts', { step: step.label })}</p>
                <ul className="flex flex-wrap gap-2">
                    {step.prompts.map(id => <li key={id}>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setCardId(id)} aria-pressed={cardId === id}>
                            <span className="font-mono">{promptLabel(id)}</span>
                        </Button>
                    </li>)}
                </ul>
            </div>}
        </Card>

        <PromptUsagePanel onOpen={setCardId} />

        {cardId && <PromptCardView key={cardId} id={cardId} onCompare={openCompare} onChanged={load} onClose={() => setCardId(null)} />}

        {compare && <div id="prompt-health-compare" className="scroll-mt-4">
            <PromptCompare key={compare.key} initial={compare.prompts} focus={compare.focus} paths={paths} knownPrompts={knownPrompts}
                onClose={() => setCompare(null)} onChanged={load} />
        </div>}

        <Card as="section" aria-labelledby="prompt-health-findings" className="space-y-3">
            <h2 id="prompt-health-findings" className="text-lg font-semibold text-ink-strong">{t('admin.promptHealth.findings.title')}</h2>
            {run && open.length === 0 && <Callout variant="success">{t('admin.promptHealth.empty')}</Callout>}
            {open.length > 0 && <ul className="space-y-2">{open.map(finding => <FindingCard key={finding.id} finding={finding} onCompare={openCompare} onChanged={load} />)}</ul>}
            {acked.length > 0 && <div className="space-y-2">
                <Button type="button" variant="ghost" aria-expanded={showAcked} onClick={() => setShowAcked(value => !value)}>
                    {t('admin.promptHealth.ack.count', { count: acked.length })}
                </Button>
                {showAcked && <ul className="space-y-2">{acked.map(finding => <FindingCard key={finding.id} finding={finding} onCompare={openCompare} onChanged={load} />)}</ul>}
            </div>}
        </Card>
    </div>;
}
