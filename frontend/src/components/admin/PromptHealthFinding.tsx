'use client';

import { useId, useState } from 'react';
import { ClipboardCopy, Columns3, Flag, RefreshCw, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { postJson, SEVERITY_TEXT, useFindingMessage, type PromptHealthPath } from './PromptCompare';
import { canPropose, codeReferenceUrl, compareTargets, findingBrief, hasCodeSource, promptLabel, visibleSurfaces,
    type PromptCodeLocation, type PromptHealthFinding, type PromptHealthSentence } from '@/lib/prompt-health';
import { cn } from '@/lib/utils';
import { usePromptName, useSurfaceName } from './PromptHealthLabels';

type OpenCompare = (prompts: string[], focus: string | null, propose?: boolean) => void;

function SourceLink({ location }: { location: PromptCodeLocation }) {
    const { t } = useI18n();
    const url = codeReferenceUrl(location);
    const label = t('admin.promptHealth.reference.location', { file: location.file, line: location.line });
    return url ? <a href={url} target="_blank" rel="noopener noreferrer" title={t('admin.promptHealth.reference.github')}
        className="block break-all font-mono text-xs text-link underline">{label}<span className="sr-only"> · {t('admin.promptHealth.newWindow')}</span></a>
        : <span className="block break-all font-mono text-xs">{label}</span>;
}

function CodeReferences({ sentence }: { sentence: PromptHealthSentence }) {
    const { t } = useI18n();
    const location = sentence.code_location;
    return <div className="space-y-2 border-t border-line pt-2 text-xs text-ink-body">
        <p className="font-semibold">{t('admin.promptHealth.reference.title')}</p>
        {!location?.matches.length ? <p className="text-ink-muted">{t('admin.promptHealth.reference.unknown')}</p> : <>
            <p className="text-ink-muted">{t(location.status === 'ambiguous' ? 'admin.promptHealth.reference.ambiguous' : 'admin.promptHealth.reference.matched')}</p>
            <ul className="space-y-3">{location.matches.map(reference => <li key={`${reference.file}:${reference.line}:${reference.symbol}`} className="space-y-1">
                <SourceLink location={reference} />
                {reference.symbol && <p className="break-all"><span className="font-semibold">{t('admin.promptHealth.reference.symbol')}:</span> <code>{reference.symbol}</code></p>}
                {reference.definition && <div><p className="font-semibold">{t('admin.promptHealth.reference.definition')}</p><SourceLink location={reference.definition} /></div>}
                {reference.readers.slice(0, 3).map(reader => <div key={`${reader.file}:${reader.line}`} className="space-y-1">
                    <p className="break-all"><span className="font-semibold">{t('admin.promptHealth.reference.usedBy')}:</span> <code>{reader.symbol}</code></p>
                    <SourceLink location={reader} />
                </div>)}
                {reference.readers.length > 3 && <p className="text-ink-muted">{t('admin.promptHealth.reference.more', { count: reference.readers.length - 3 })}</p>}
            </li>)}</ul>
            {location.more > 0 && <p className="text-ink-muted">{t('admin.promptHealth.reference.more', { count: location.more })}</p>}
        </>}
    </div>;
}

function CodeBrief({ finding }: { finding: PromptHealthFinding }) {
    const { t } = useI18n();
    const message = useFindingMessage();
    const [status, setStatus] = useState<'copied' | 'manual' | null>(null);
    const briefId = useId();
    const unknown = finding.sentences.some(sentence => sentence.prompt.startsWith('code:') && !sentence.code_location?.matches.length)
        ? `\n\n${t('admin.promptHealth.brief.unknown')}` : '';
    const brief = `${t('admin.promptHealth.brief.instructions')}\n\n${findingBrief(finding, message(finding), {
        code: t('admin.promptHealth.source.codeBadge'), prompt: t('admin.promptHealth.source.editable'),
    })}${unknown}`;
    const copy = async () => {
        try { await navigator.clipboard.writeText(brief); setStatus('copied'); }
        catch { setStatus('manual'); }
    };
    return <details className="rounded-control border border-line bg-surface-sunken p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-strong">{t('admin.promptHealth.resolve.code')}</summary>
        <div className="mt-3 space-y-2">
            <p className="text-sm text-ink-body">{t(hasCodeSource(finding) ? 'admin.promptHealth.resolve.codePresent' : 'admin.promptHealth.resolve.codeReview')}</p>
            <label htmlFor={briefId} className="block text-xs font-semibold text-ink-body">{t('admin.promptHealth.brief.review')}</label>
            <textarea id={briefId} readOnly value={brief} rows={8} onFocus={event => event.currentTarget.select()}
                className="w-full rounded-control border border-line bg-surface p-2 font-mono text-xs text-ink-body" />
            <Button type="button" variant="secondary" size="sm" onClick={copy}>
                <ClipboardCopy className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.brief.copy')}
            </Button>
            <p role="status" className="text-xs text-ink-muted">{status && t(`admin.promptHealth.brief.${status}`)}</p>
        </div>
    </details>;
}

/** One problem at a time, with evidence and the two possible places to fix it. */
export function FindingCard({ finding, paths, group, onCompare, onChanged }: {
    finding: PromptHealthFinding;
    paths: PromptHealthPath[];
    group?: string;
    onCompare: OpenCompare;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const message = useFindingMessage();
    const name = usePromptName(paths);
    const surfaceName = useSurfaceName(paths);
    const { shown, hidden } = visibleSurfaces(finding.surfaces.map(surfaceName));
    const editable = compareTargets(finding);
    const code = hasCodeSource(finding);
    return <li className="rounded-control border border-line bg-surface p-4">
        <details name={group}>
            <summary className="cursor-pointer space-y-1 text-sm text-ink-body">
                {finding.number && <><span className="font-mono font-semibold text-ink-strong">{t('admin.promptHealth.problem.number', { number: finding.number })}</span>{' · '}</>}
                <span className={cn('font-semibold', SEVERITY_TEXT[finding.severity])}>{t(`admin.promptHealth.severity.${finding.severity}`)}</span>
                {' · '}<span className="font-semibold">{message(finding)}</span>
                <span className="mt-1 block text-xs text-ink-muted">{t(code ? 'admin.promptHealth.resolve.hasCode' : 'admin.promptHealth.resolve.promptsOnly')}</span>
            </summary>
            <div className="mt-4 space-y-4">
                {shown.length > 0 && <p className="break-words text-sm text-ink-muted">
                    <span className="font-semibold">{t('admin.promptHealth.where')}:</span> {shown.join('; ')}{hidden > 0 ? ` ${t('admin.promptHealth.more', { count: hidden })}` : ''}
                </p>}
                {finding.sentences.length > 0 && <div className={cn('grid gap-3', finding.sentences.length > 1 && 'md:grid-cols-2')}>
                    {finding.sentences.map((sentence, index) => <blockquote key={`${sentence.prompt}:${index}`}
                        className="min-w-0 space-y-2 rounded-control border border-line bg-surface-sunken p-3 text-sm text-ink-body">
                        <p className="break-words font-semibold">{name(sentence.prompt)}</p>
                        {sentence.prompt.startsWith('code:')
                            ? <p><span className="inline-block rounded-control border border-info-line bg-info-soft px-2 py-1 text-xs font-bold text-info-ink">{t('admin.promptHealth.source.codeBadge')}</span></p>
                            : <p className="text-xs font-semibold text-ink-muted">{t('admin.promptHealth.source.editable')}</p>}
                        <p className="break-words underline decoration-danger decoration-wavy underline-offset-4">«{sentence.text}»</p>
                        {sentence.prompt.startsWith('code:') && <CodeReferences sentence={sentence} />}
                        {sentence.also_in && sentence.also_in.length > 0 && <p className="break-words text-xs text-ink-muted">
                            <span className="font-semibold">{t('admin.promptHealth.reference.alsoIn')}:</span> {sentence.also_in.map(name).join('; ')}
                        </p>}
                    </blockquote>)}
                </div>}
                <p className="text-sm text-ink-body"><span className="font-semibold">{t('admin.promptHealth.fix')}:</span> {t(`admin.promptHealth.fix.${finding.code}`)}</p>
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-ink-strong">{t('admin.promptHealth.resolve.title')}</h3>
                    {editable.length > 0 ? <>
                        <p className="text-sm text-ink-muted">{t('admin.promptHealth.resolve.promptHelp')}</p>
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" onClick={() => onCompare(editable, finding.id)}>
                                <Columns3 className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.resolve.prompt')}
                            </Button>
                            {canPropose(finding) && <Button type="button" variant="secondary" onClick={() => onCompare(editable, finding.id, true)}>
                                <Sparkles className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.propose')}
                            </Button>}
                        </div>
                    </> : <p className="text-sm text-ink-muted">{t('admin.promptHealth.resolve.noPrompt')}</p>}
                    <CodeBrief finding={finding} />
                </div>
                {finding.ack && <p className="text-sm text-ink-muted"><span className="font-semibold">{t('admin.promptHealth.ack.marked')}:</span> {finding.ack.note || '—'}</p>}
                <details>
                    <summary className="cursor-pointer text-sm font-semibold text-ink-body">{t('admin.promptHealth.resolve.otherActions')}</summary>
                    <div className="mt-2"><FindingActions finding={finding} onChanged={onChanged} /></div>
                </details>
                <details>
                    <summary className="cursor-pointer text-xs font-semibold text-ink-muted">{t('admin.promptHealth.resolve.references')}</summary>
                    <ul className="mt-2 space-y-2 break-words font-mono text-xs text-ink-muted">
                        {finding.prompts.map(id => <li key={id}>{id}
                            {(finding.sources ?? []).filter(source => source.id === id).map(source => <div key={source.id}>
                                {source.consumer && <p>{source.consumer}</p>}{source.factory_source && <p>{source.factory_source}</p>}
                            </div>)}
                            {id === 'code:request' && <p className="font-sans">{t('admin.promptHealth.brief.unknown')}</p>}
                        </li>)}
                    </ul>
                </details>
            </div>
        </details>
    </li>;
}

/** Azioni su un avviso (#761). Nessuna blocca un salvataggio. */
function FindingActions({ finding, onChanged }: {
    finding: PromptHealthFinding;
    onChanged: () => void;
}) {
    const { t } = useI18n();
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
            {/* Le contraddizioni del modello si aggiornano da sole quando cambia una delle frasi. */}
            {editable.length > 0 && finding.code !== 'llm_contradiction' && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={recheck}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.recheck')}
            </Button>}
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
