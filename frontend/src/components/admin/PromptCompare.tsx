'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, GitCompare, Plus, RefreshCw, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import {
    canPropose, findingRanges, highlightSegments, lineDiff, mergeFindings, messageParams, otherSentence, promptLabel,
    type PromptHealthFinding, type PromptHealthProposal, type PromptHealthRange,
} from '@/lib/prompt-health';
import { cn } from '@/lib/utils';

export interface PromptHealthStep { id: string; label: string; prompts: string[]; surfaces: string[] }
export interface PromptHealthPath { instrument: string; steps: PromptHealthStep[] }

export interface PromptCard {
    id: string;
    text: string | null;
    factory: string | null;
    editable: boolean;
    differs_from_factory: boolean;
    customised: boolean;
    consumer: string | null;
    app_surfaces: string[];
    surfaces: string[] | null;
    findings: PromptHealthFinding[];
}

export async function loadPromptCard(id: string): Promise<PromptCard> {
    const response = await apiFetch(`/api/admin/prompt-health/prompt?id=${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error('card');
    return response.json();
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!response.ok) throw new Error(path);
    return response.json();
}

export const SEVERITY_TEXT: Record<string, string> = { high: 'text-danger-ink', medium: 'text-warning-ink', low: 'text-info-ink' };

/** Messaggio di un avviso con i parametri tradotti. */
export function useFindingMessage() {
    const { t } = useI18n();
    return useCallback((finding: PromptHealthFinding) => {
        const params = messageParams(finding.params);
        if (params.field) params.field = t(`admin.promptHealth.field.${params.field}`);
        return t(`admin.promptHealth.code.${finding.code}`, params);
    }, [t]);
}

const EDITOR_TEXT = 'whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6';

/**
 * Textarea con i passaggi in conflitto evidenziati dietro il testo: sfondo rosso
 * e sottolineatura ondulata (il colore non è l'unico segnale), numerati
 * nell'elenco collegato con `aria-describedby`.
 */
function HighlightedEditor({ value, onChange, ranges, describedBy, label, onCaret, textareaRef }: {
    value: string;
    onChange: (value: string) => void;
    ranges: PromptHealthRange[];
    describedBy: string;
    label: string;
    onCaret: (position: number) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
    const backdrop = useRef<HTMLDivElement>(null);
    const segments = useMemo(() => highlightSegments(value, ranges), [value, ranges]);
    const syncScroll = () => {
        if (backdrop.current && textareaRef.current) backdrop.current.scrollTop = textareaRef.current.scrollTop;
    };
    const caret = () => onCaret(textareaRef.current?.selectionStart ?? 0);
    return <div className="relative h-80 overflow-hidden rounded-control border border-line bg-surface focus-within:ring-2 focus-within:ring-brand">
        <div ref={backdrop} aria-hidden="true" className={cn(EDITOR_TEXT, 'absolute inset-0 overflow-hidden text-transparent')}>
            {segments.map((segment, index) => segment.numbers.length
                ? <mark key={index} className="rounded-sm bg-danger-soft text-transparent underline decoration-danger decoration-wavy decoration-2 underline-offset-4">{segment.text}</mark>
                : <span key={index}>{segment.text}</span>)}
            {'\n'}
        </div>
        <textarea ref={textareaRef} value={value} aria-label={label} aria-describedby={describedBy} spellCheck={false}
            onChange={event => onChange(event.target.value)} onScroll={syncScroll} onSelect={caret} onClick={caret} onKeyUp={caret}
            className={cn(EDITOR_TEXT, 'relative h-full w-full resize-none bg-transparent text-ink-body caret-ink-strong outline-none')} />
    </div>;
}

function DiffView({ before, after, title }: { before: string; after: string; title?: string }) {
    const { t } = useI18n();
    const lines = useMemo(() => lineDiff(before, after), [before, after]);
    return <div className="space-y-1">
        <p className="text-xs font-semibold text-ink-muted">{title ?? t('admin.promptHealth.compare.diffTitle')}</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-surface-sunken p-2 text-xs leading-relaxed text-ink-body">
            {lines.map((line, index) => <div key={index} className={cn(line.type === 'del' && 'bg-danger-soft text-danger-ink line-through',
                line.type === 'add' && 'bg-success-soft text-success-ink')}>
                <span aria-hidden="true">{line.type === 'del' ? '− ' : line.type === 'add' ? '+ ' : '  '}</span>
                <span className="sr-only">{line.type === 'del' ? t('admin.promptHealth.compare.removed') : line.type === 'add' ? t('admin.promptHealth.compare.added') : ''}</span>
                {line.text || ' '}
            </div>)}
        </pre>
    </div>;
}

interface PanelState {
    id: string;
    card: PromptCard | null;
    draft: string;
    error?: boolean;
}

function ComparePanel({ panel, findings, checking, focus, proposal, proposing, onDraft, onRemove, onSaved, onPropose, onAccept, onDiscard }: {
    panel: PanelState;
    findings: PromptHealthFinding[];
    checking: boolean;
    focus: string | null;
    proposal: PromptHealthProposal | null;
    proposing: boolean;
    onDraft: (value: string) => void;
    onRemove: () => void;
    onSaved: (card: PromptCard, findings?: PromptHealthFinding[]) => void;
    onPropose: (finding: PromptHealthFinding) => void;
    onAccept: () => void;
    onDiscard: () => void;
}) {
    const { t } = useI18n();
    const message = useFindingMessage();
    const listId = useId();
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [active, setActive] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'saved' | 'restored' | 'error' | null>(null);
    const [diff, setDiff] = useState(false);
    const [confirmRestore, setConfirmRestore] = useState(false);
    const { card, draft } = panel;
    const ranges = useMemo(() => findingRanges(findings, panel.id, draft), [findings, panel.id, draft]);
    const numbered = useMemo(() => {
        const byFinding = new Map(ranges.map(range => [range.findingId, range]));
        return findings.map(finding => ({ finding, range: byFinding.get(finding.id) ?? null }));
    }, [findings, ranges]);
    const dirty = card !== null && draft !== (card.text ?? '');

    const select = useCallback((range: PromptHealthRange) => {
        const area = textarea.current;
        if (!area) return;
        area.focus();
        area.setSelectionRange(range.start, range.end);
        const lines = draft.slice(0, range.start).split('\n').length - 1;
        area.scrollTop = Math.max(0, lines * 24 - 48);
        setActive(range.number);
    }, [draft]);

    // «Apri il prompt»: il passaggio dell'avviso scelto è selezionato all'apertura.
    const focused = useRef(false);
    useEffect(() => {
        if (focused.current || !focus) return;
        const range = ranges.find(item => item.findingId === focus);
        if (range) { focused.current = true; select(range); }
    }, [focus, ranges, select]);

    const save = async () => {
        setBusy(true);
        setStatus(null);
        try {
            const result = await postJson<{ findings: PromptHealthFinding[] }>('/api/admin/prompt-health/save', { prompt_id: panel.id, text: draft });
            onSaved({ ...(card as PromptCard), text: draft, differs_from_factory: card?.factory != null && draft !== card.factory, customised: true }, result.findings);
            setStatus('saved');
        } catch {
            setStatus('error');
        } finally {
            setBusy(false);
        }
    };

    const restore = async () => {
        setConfirmRestore(false);
        setBusy(true);
        setStatus(null);
        try {
            const result = await postJson<{ text: string }>('/api/admin/prompt-health/restore-factory', { prompt_id: panel.id });
            onSaved({ ...(card as PromptCard), text: result.text, differs_from_factory: false, customised: false });
            setStatus('restored');
        } catch {
            setStatus('error');
        } finally {
            setBusy(false);
        }
    };

    const caret = (position: number) => {
        const hit = ranges.find(range => range.start <= position && position <= range.end);
        setActive(hit ? hit.number : null);
    };

    return <Card as="section" aria-labelledby={`${listId}-title`} className="min-w-0 space-y-3 p-4">
        <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
                <h3 id={`${listId}-title`} className="break-words font-mono text-sm font-semibold text-ink-strong">{promptLabel(panel.id)}</h3>
                {card && <p className="text-xs text-ink-muted">
                    {card.customised ? t('admin.promptHealth.card.customised') : card.differs_from_factory ? t('admin.promptHealth.card.differs') : t('admin.promptHealth.card.factory')}
                    {dirty && <> · <span className="font-semibold text-warning-ink">{t('admin.promptHealth.compare.unsaved')}</span></>}
                </p>}
            </div>
            <Button type="button" variant="ghost" onClick={onRemove} aria-label={t('admin.promptHealth.compare.remove', { prompt: promptLabel(panel.id) })}>
                <X className="h-4 w-4" aria-hidden="true" />
            </Button>
        </div>
        {panel.error && <Callout variant="danger">{t('admin.promptHealth.compare.loadError')}</Callout>}
        {!card && !panel.error && <p className="text-sm text-ink-muted">{t('admin.promptHealth.compare.loading')}</p>}
        {card && !card.editable && <Callout variant="info">{t('admin.promptHealth.compare.notEditable')}</Callout>}
        {card?.editable && <>
            <HighlightedEditor value={draft} onChange={onDraft} ranges={ranges} describedBy={listId} textareaRef={textarea}
                label={t('admin.promptHealth.compare.editorLabel', { prompt: promptLabel(panel.id) })} onCaret={caret} />
            <div id={listId} aria-live="polite" className="space-y-2">
                <p className="text-xs font-semibold text-ink-muted">
                    {checking ? t('admin.promptHealth.compare.checking')
                        : findings.length ? t('admin.promptHealth.compare.passages', { count: findings.length }) : t('admin.promptHealth.compare.noPassages')}
                </p>
                {numbered.length > 0 && <ol className="space-y-2">
                    {numbered.map(({ finding, range }) => {
                        const other = otherSentence(finding, panel.id);
                        return <li key={finding.id} className={cn('space-y-1 rounded-control border p-2 text-sm',
                            range && active === range.number ? 'border-danger bg-danger-soft' : 'border-line bg-surface-sunken')}>
                            <p className="text-ink-body">
                                <span className={cn('font-semibold', SEVERITY_TEXT[finding.severity])}>
                                    {range ? t('admin.promptHealth.compare.passage', { number: range.number }) : t('admin.promptHealth.compare.general')}
                                    {' · '}{t(`admin.promptHealth.severity.${finding.severity}`)}
                                </span>{' '}{message(finding)}
                            </p>
                            {other && <p className="break-words text-xs text-ink-muted">
                                {t('admin.promptHealth.compare.against', { prompt: promptLabel(other.prompt) })} «{other.text}»
                            </p>}
                            {finding.ack && <p className="text-xs text-ink-muted">{t('admin.promptHealth.ack.marked')}: {finding.ack.note}</p>}
                            <div className="flex flex-wrap gap-2">
                                {range && <Button type="button" variant="ghost" size="sm" onClick={() => select(range)}>{t('admin.promptHealth.compare.show')}</Button>}
                                {canPropose(finding) && <Button type="button" variant="ghost" size="sm" disabled={proposing} onClick={() => onPropose(finding)}>
                                    <Sparkles className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.propose')}
                                </Button>}
                            </div>
                        </li>;
                    })}
                </ol>}
            </div>
            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={save} disabled={busy || !dirty}>
                    <Save className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.compare.save')}
                </Button>
                {card.factory != null && <Button type="button" variant="secondary" aria-expanded={diff} onClick={() => setDiff(value => !value)}>
                    <GitCompare className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.compare.diff')}
                </Button>}
                {card.factory != null && draft !== card.factory && (confirmRestore
                    ? <ConfirmInline question={t('admin.promptHealth.compare.restoreConfirm')} onConfirm={restore} onCancel={() => setConfirmRestore(false)} busy={busy} />
                    : <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmRestore(true)}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.restore')}
                    </Button>)}
            </div>
            <div role="status">
                {status === 'saved' && <Callout variant={findings.length ? 'warning' : 'success'}>
                    {findings.length ? t('admin.promptHealth.compare.savedWithWarnings') : t('admin.promptHealth.saved.none')}
                </Callout>}
                {status === 'restored' && <Callout variant="success">{t('admin.promptHealth.compare.restored')}</Callout>}
                {status === 'error' && <Callout variant="danger">{t('admin.promptHealth.compare.saveError')}</Callout>}
            </div>
            {proposal && <div className="space-y-2 rounded-control border border-line-strong bg-surface p-2">
                <DiffView before={proposal.before} after={proposal.after} title={t('admin.promptHealth.propose.title', { prompt: promptLabel(panel.id) })} />
                <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => { onDraft(proposal.after); onAccept(); setStatus(null); }}>
                        <Check className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.propose.accept')}
                    </Button>
                    <Button type="button" variant="secondary" onClick={onDiscard}>
                        <X className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.propose.discard')}
                    </Button>
                </div>
            </div>}
            {diff && card.factory != null && <DiffView before={card.factory} after={draft} />}
        </>}
    </Card>;
}

/**
 * Schermata di confronto (#761): due o tre prompt affiancati e modificabili, i
 * passaggi in conflitto in rosso, avvisi ricalcolati sulla bozza prima di
 * salvare. Ogni prompt si salva da solo e il salvataggio non è mai bloccato.
 */
export function PromptCompare({ initial, focus, propose = false, llmFindings = [], paths, knownPrompts, onClose, onChanged }: {
    initial: string[];
    focus: string | null;
    /** Aperto da «Proponi correzione»: chiede subito la proposta per l'avviso `focus` (#763). */
    propose?: boolean;
    /** Contraddizioni trovate dal modello: evidenziate come gli altri avvisi. */
    llmFindings?: PromptHealthFinding[];
    paths: PromptHealthPath[];
    knownPrompts: string[];
    onClose: () => void;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const titleId = useId();
    const addId = useId();
    const surfaceId = useId();
    const [panels, setPanels] = useState<PanelState[]>(() => initial.slice(0, 3).map(id => ({ id, card: null, draft: '' })));
    const [findings, setFindings] = useState<PromptHealthFinding[]>([]);
    const [surface, setSurface] = useState('');
    const [assembled, setAssembled] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkError, setCheckError] = useState(false);
    const [toAdd, setToAdd] = useState('');
    const [recheck, setRecheck] = useState(0);
    const request = useRef<AbortController | null>(null);
    const message = useFindingMessage();
    const [proposals, setProposals] = useState<Record<string, PromptHealthProposal>>({});
    const [proposeStatus, setProposeStatus] = useState<'loading' | 'none' | 'error' | 'notConfigured' | 'accepted' | null>(null);

    // Schede dei prompt: testo salvato, testo di fabbrica, avvisi dell'ultimo controllo.
    const ids = panels.map(panel => panel.id).join('|');
    useEffect(() => {
        panels.filter(panel => !panel.card && !panel.error).forEach(panel => {
            loadPromptCard(panel.id)
                .then(card => {
                    setPanels(current => current.map(item => item.id === card.id ? { ...item, card, draft: card.text ?? '' } : item));
                    setFindings(current => [...current.filter(f => !card.findings.some(c => c.id === f.id)), ...card.findings]);
                })
                .catch(() => setPanels(current => current.map(item => item.id === panel.id ? { ...item, error: true } : item)));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando cambia l'elenco dei pannelli
    }, [ids]);

    // Ricalcolo sulla bozza: dopo una pausa nella scrittura, solo i turni interessati.
    const drafts = useMemo(() => Object.fromEntries(panels
        .filter(panel => panel.card?.editable && panel.draft !== (panel.card.text ?? ''))
        .map(panel => [panel.id, panel.draft])), [panels]);
    const draftKey = JSON.stringify(drafts);
    const loaded = panels.length > 0 && panels.every(panel => panel.card || panel.error);
    useEffect(() => {
        if (!loaded || (!surface && !recheck && draftKey === '{}')) return;
        const timer = window.setTimeout(async () => {
            request.current?.abort();
            const controller = new AbortController();
            request.current = controller;
            setChecking(true);
            setCheckError(false);
            try {
                const result = await postJson<{ findings: PromptHealthFinding[]; assembled: string | null }>('/api/admin/prompt-health/evaluate', {
                    prompt_ids: panels.filter(panel => !(panel.id in drafts)).map(panel => panel.id),
                    drafts, surface: surface || null,
                }, controller.signal);
                setFindings(result.findings);
                setAssembled(result.assembled);
            } catch (error) {
                if ((error as Error).name !== 'AbortError') setCheckError(true);
            } finally {
                if (request.current === controller) setChecking(false);
            }
        }, recheck ? 0 : 1200);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- le bozze sono nella chiave
    }, [draftKey, surface, loaded, recheck, ids]);
    useEffect(() => () => request.current?.abort(), []);

    // «Proponi correzione» (#763): il modello riscrive le frasi in conflitto sulle bozze correnti; niente viene salvato.
    const requestProposal = useCallback(async (finding: PromptHealthFinding) => {
        setProposeStatus('loading');
        try {
            const involved = new Set(finding.sentences.map(sentence => sentence.prompt));
            const current = Object.fromEntries(panels.filter(panel => panel.card?.editable && involved.has(panel.id)).map(panel => [panel.id, panel.draft]));
            const explanation = typeof finding.params.explanation === 'string' ? finding.params.explanation : message(finding);
            const response = await apiFetch('/api/admin/prompt-health/llm/propose', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sentences: finding.sentences.map(({ prompt, text }) => ({ prompt, text })), explanation, drafts: current }),
            });
            if (response.status === 409) { setProposeStatus('notConfigured'); return; }
            if (!response.ok) throw new Error('propose');
            const result: { proposals: PromptHealthProposal[] } = await response.json();
            setProposals(Object.fromEntries(result.proposals.map(item => [item.prompt_id, item])));
            setProposeStatus(result.proposals.length ? null : 'none');
        } catch {
            setProposeStatus('error');
        }
    }, [panels, message]);

    const dropProposal = (id: string) => setProposals(current => {
        const next = { ...current };
        delete next[id];
        return next;
    });

    const allFindings = useMemo(() => mergeFindings(findings, llmFindings), [findings, llmFindings]);
    const proposed = useRef(false);
    useEffect(() => {
        if (!propose || !focus || !loaded || proposed.current) return;
        const finding = allFindings.find(item => item.id === focus);
        if (!finding) return;
        proposed.current = true;
        void requestProposal(finding);
    }, [propose, focus, loaded, allFindings, requestProposal]);

    const add = () => {
        const id = toAdd.trim();
        if (!id || panels.length >= 3 || panels.some(panel => panel.id === id)) return;
        setPanels(current => [...current, { id, card: null, draft: '' }]);
        setToAdd('');
    };

    const savedCard = (card: PromptCard, fresh?: PromptHealthFinding[]) => {
        setPanels(current => current.map(item => item.id === card.id ? { ...item, card, draft: card.text ?? '' } : item));
        if (fresh) setFindings(current => [...current.filter(f => !f.prompts.includes(card.id)), ...fresh]);
        else setRecheck(value => value + 1);
        onChanged();
    };

    return <Card as="section" aria-labelledby={titleId} className="space-y-4">
        <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
                <h2 id={titleId} className="text-lg font-semibold text-ink-strong">{t('admin.promptHealth.compare.title')}</h2>
                <p className="text-sm text-ink-muted">{t('admin.promptHealth.compare.help')}</p>
            </div>
            <Button type="button" variant="secondary" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.close')}</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
                <label htmlFor={surfaceId} className="text-sm font-semibold text-ink-body">{t('admin.promptHealth.compare.context')}</label>
                <select id={surfaceId} value={surface} onChange={event => setSurface(event.target.value)}
                    className="min-h-control w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-body">
                    <option value="">{t('admin.promptHealth.compare.contextAll')}</option>
                    {paths.map(path => <optgroup key={path.instrument} label={path.instrument}>
                        {path.steps.flatMap(step => step.surfaces).map(item => <option key={item} value={item}>{item}</option>)}
                    </optgroup>)}
                </select>
            </div>
            <div className="space-y-1">
                <label htmlFor={addId} className="text-sm font-semibold text-ink-body">{t('admin.promptHealth.compare.add')}</label>
                <div className="flex gap-2">
                    <input id={addId} list={`${addId}-list`} value={toAdd} onChange={event => setToAdd(event.target.value)}
                        disabled={panels.length >= 3} placeholder={t('admin.promptHealth.compare.addPlaceholder')}
                        className="min-h-control min-w-0 flex-1 rounded-control border border-line bg-surface px-3 font-mono text-sm text-ink-body" />
                    <datalist id={`${addId}-list`}>{knownPrompts.map(id => <option key={id} value={id} />)}</datalist>
                    <Button type="button" variant="secondary" onClick={add} disabled={panels.length >= 3 || !toAdd.trim()}>
                        <Plus className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.compare.addButton')}
                    </Button>
                </div>
                {panels.length >= 3 && <p className="text-xs text-ink-muted">{t('admin.promptHealth.compare.max')}</p>}
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="status">
            <Button type="button" variant="secondary" disabled={checking || !loaded} onClick={() => setRecheck(value => value + 1)}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />{t('admin.promptHealth.action.recheck')}
            </Button>
            {checking && <span className="text-sm text-ink-muted">{t('admin.promptHealth.compare.checking')}</span>}
            {checkError && <span className="text-sm text-danger-ink">{t('admin.promptHealth.compare.checkError')}</span>}
            {proposeStatus === 'loading' && <span className="text-sm text-ink-muted">{t('admin.promptHealth.propose.loading')}</span>}
        </div>
        <div role="status">
            {proposeStatus === 'none' && <Callout variant="info">{t('admin.promptHealth.propose.none')}</Callout>}
            {proposeStatus === 'error' && <Callout variant="danger">{t('admin.promptHealth.propose.error')}</Callout>}
            {proposeStatus === 'notConfigured' && <Callout variant="info">{t('admin.promptHealth.propose.notConfigured')}</Callout>}
            {proposeStatus === 'accepted' && <Callout variant="success">{t('admin.promptHealth.propose.accepted')}</Callout>}
        </div>

        {panels.length === 0 && <Callout variant="info">{t('admin.promptHealth.compare.empty')}</Callout>}
        <div className={cn('grid gap-4', panels.length === 2 && 'lg:grid-cols-2', panels.length === 3 && 'lg:grid-cols-2 xl:grid-cols-3')}>
            {panels.map(panel => <ComparePanel key={panel.id} panel={panel} checking={checking} focus={focus}
                findings={allFindings.filter(finding => finding.prompts.includes(panel.id))}
                proposal={proposals[panel.id] ?? null} proposing={proposeStatus === 'loading'}
                onPropose={finding => void requestProposal(finding)}
                onAccept={() => { dropProposal(panel.id); setProposeStatus('accepted'); }}
                onDiscard={() => dropProposal(panel.id)}
                onDraft={value => setPanels(current => current.map(item => item.id === panel.id ? { ...item, draft: value } : item))}
                onRemove={() => setPanels(current => current.filter(item => item.id !== panel.id))}
                onSaved={savedCard} />)}
        </div>

        {surface && assembled !== null && <details className="rounded-control border border-line bg-surface-sunken p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-body">{t('admin.promptHealth.compare.assembled', { surface })}</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-body">{assembled}</pre>
        </details>}
    </Card>;
}
