'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Columns3, LayoutList, Layers, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiFetch } from '@/lib/auth';
import { normalizeRecommendationCatalog, type RecommendationCatalog } from '@/lib/recommendations';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { emptyWorkspace, removeCriterion, removeOption, setCell, workspaceText, type ActionStage, type CardBucket, type SavedWorkspace, type VisualWorkspace } from '@/lib/visual-tools';

type Tab = 'board' | 'comparison' | 'cards';
export type VisualToolsRequest = { tab: Tab; nonce: number };
type Props = {
    sessionId: string;
    locale: string;
    compact?: boolean;
    hideTrigger?: boolean;
    catalog?: RecommendationCatalog;
    onDiscuss?: (text: string) => void;
    request?: VisualToolsRequest | null;
};
const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const buttonClass = 'min-h-[44px] min-w-[44px]';
const stages: ActionStage[] = ['todo', 'doing', 'done'];
const buckets: CardBucket[] = ['unsorted', 'yes', 'explore', 'no'];
const tabs: Tab[] = ['board', 'comparison', 'cards'];

export function VisualTools(props: Props) {
    return <WorkspaceView key={props.sessionId} {...props} />;
}

function WorkspaceView({ sessionId, locale, compact = false, hideTrigger = false, catalog: providedCatalog, onDiscuss, request }: Props) {
    const l = (key: string) => visualLabel(locale, key);
    const endpoint = `/api/session/${encodeURIComponent(sessionId)}/visual-tools`;
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<Tab>('board');
    const [helpOpen, setHelpOpen] = useState<Record<Tab, boolean>>({ board: true, comparison: true, cards: true });
    const [saved, setSaved] = useState<SavedWorkspace>({ revision: 0, workspace: emptyWorkspace() });
    const [work, setWork] = useState<VisualWorkspace>(emptyWorkspace);
    const [history, setHistory] = useState<VisualWorkspace[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [issue, setIssue] = useState('');
    const [catalog, setCatalog] = useState<RecommendationCatalog>({ reading: [], strategy: [] });
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDetail, setDraftDetail] = useState('');
    const [draftSource, setDraftSource] = useState('');
    const [draftCard, setDraftCard] = useState('');
    const [cardSource, setCardSource] = useState('');
    const [criterion, setCriterion] = useState('');
    const [option, setOption] = useState('');
    const [optionSource, setOptionSource] = useState('');
    const dialog = useRef<HTMLElement>(null);
    const loadGeneration = useRef(0);
    const opener = useRef<HTMLElement | null>(null);
    const id = useId();
    const dirty = JSON.stringify(work) !== JSON.stringify(saved.workspace);
    const hasWork = Boolean(work.actions.length || work.cards.length || work.comparison.options.length);
    const currentCatalog = providedCatalog ?? catalog;
    const sources = [
        ...currentCatalog.strategy.map(item => ({ title: item.name || item.slug, detail: item.description || '', key: `strategy:${item.slug}` })),
        ...currentCatalog.reading.map(item => ({ title: item.title || item.slug, detail: item.why || '', key: `reading:${item.slug}` })),
    ];
    const edit = (next: VisualWorkspace) => { setHistory(previous => [...previous.slice(-29), work]); setWork(next); };
    const focusMoved = (itemId: string) => window.requestAnimationFrame(() => {
        const element = document.getElementById(itemId);
        element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'nearest' });
    });
    const launch = () => { opener.current = document.activeElement as HTMLElement; setOpen(true); };
    const load = useCallback(async () => {
        const generation = ++loadGeneration.current;
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch(endpoint, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error();
            const result: SavedWorkspace = await response.json();
            if (generation !== loadGeneration.current) return;
            setSaved(result); setWork(result.workspace); setHistory([]); setLoaded(true);
        } catch { if (generation === loadGeneration.current) setIssue('loadError'); }
        finally { if (generation === loadGeneration.current) setBusy(false); }
    }, [endpoint]);

    useEffect(() => { if (open && !loaded) void load(); }, [open, loaded, load]);
    useEffect(() => {
        if (!open || providedCatalog) return;
        const controller = new AbortController();
        void apiFetch(`/api/session/${encodeURIComponent(sessionId)}/recommendations?lang=${locale}`, { signal: controller.signal })
            .then(response => response.ok ? response.json() : null)
            .then(data => { if (data && !controller.signal.aborted) setCatalog(normalizeRecommendationCatalog(data)); }).catch(() => {});
        return () => controller.abort();
    }, [open, providedCatalog, sessionId, locale]);
    useEffect(() => {
        if (!request) return;
        opener.current = document.activeElement as HTMLElement;
        setTab(request.tab); setOpen(true);
    }, [request]);
    useEffect(() => {
        if (!dirty) return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [dirty]);
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const keyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // Let the tooltip dismiss first; a second Escape closes the workspace.
                if (event.defaultPrevented || document.querySelector('[role="tooltip"]')) return;
                event.preventDefault(); setOpen(false);
            }
            if (event.key !== 'Tab') return;
            const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex="0"]') ?? [])]
                .filter(element => element.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            const outside = !dialog.current?.contains(document.activeElement);
            if (first && (event.shiftKey ? outside || document.activeElement === first : outside || document.activeElement === last)) {
                event.preventDefault(); (event.shiftKey ? last : first).focus();
            }
        };
        document.addEventListener('keydown', keyboard);
        return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', keyboard); opener.current?.focus({ preventScroll: true }); };
    }, [open]);

    const save = async (): Promise<boolean> => {
        if (!loaded || busy) return false;
        if (work.actions.some(a => !a.title.trim()) || work.cards.some(c => !c.text.trim()) || work.comparison.options.some(o => !o.title.trim()) || work.comparison.criteria.some(c => !c.label.trim())) { setIssue('requiredFields'); return false; }
        for (const field of dialog.current?.querySelectorAll<HTMLInputElement>('[data-workspace-field]') ?? []) {
            if (!field.reportValidity()) return false;
        }
        if (!dirty) return true;
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision: saved.revision, workspace: work }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) { setIssue(response.status === 409 ? 'conflict' : 'saveError'); return false; }
            const result: SavedWorkspace = await response.json();
            setSaved(result); setWork(result.workspace); return true;
        } catch { setIssue('saveError'); return false; }
        finally { setBusy(false); }
    };
    const download = (blob: Blob, name: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const exportPdf = async () => {
        if (!(await save())) return;
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch(`${endpoint}/pdf?lang=${locale}`, { signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error();
            download(await response.blob(), 'counselorbot_visual_tools.pdf');
        } catch { setIssue('exportError'); }
        finally { setBusy(false); }
    };
    const discuss = async () => {
        const text = workspaceText(work, l);
        if (text.length > 8000) { setIssue('tooLong'); return; }
        if (!(await save())) return;
        setOpen(false);
        // The parent fills the composer; sending remains an explicit chat action.
        onDiscuss?.(text);
    };
    const sourceSelector = (kind: 'action' | 'option') => sources.length > 0 && <label className="block text-sm text-slate-600">{l('fromCatalog')}
        <select className={`${inputClass} mt-1 min-h-[44px]`} value="" onChange={event => {
            const item = sources.find(source => source.key === event.target.value);
            if (!item) return;
            if (kind === 'action') { setDraftTitle(item.title); setDraftDetail(item.detail); setDraftSource(item.title); }
            else { setOption(item.title); setOptionSource(item.title); }
        }}><option value="">{l('chooseSource')}</option>{sources.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select>
    </label>;
    const removeButton = (label: string, remove: () => void) => <Button type="button" variant="ghost" className={buttonClass} aria-label={`${l('remove')}: ${label}`} onClick={remove}>{l('remove')}</Button>;

    return <>
        {!hideTrigger && <Tooltip content={l('openHelp')}>
            <Button type="button" variant="secondary" className={`${buttonClass} max-w-full text-left ${compact ? 'px-3' : ''}`} onClick={launch} aria-label={l('open')}>
                <LayoutList className="h-4 w-4 shrink-0" aria-hidden="true" />{l(compact ? 'tools' : 'title')}{dirty && <span aria-label={l('unsaved')}>•</span>}
            </Button>
        </Tooltip>}
        {open && createPortal(<div className="fixed inset-0 z-[85] flex bg-white">
            <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-white">
                <header className="shrink-0 border-b border-slate-200 p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                        <div><h2 id={`${id}-title`} className="text-lg font-semibold text-slate-800">{l('title')}</h2><p className="mt-1 hidden text-sm text-slate-600 sm:block">{l('working')}</p></div>
                        <Button type="button" variant="ghost" className={buttonClass} autoFocus aria-label={l('close')} onClick={() => setOpen(false)}><X className="h-5 w-5" aria-hidden="true" /></Button>
                    </div>
                    <div role="tablist" aria-label={l('title')} className="mt-3 flex flex-wrap gap-1">
                        {tabs.map((key, index) => { const Icon = [LayoutList, Columns3, Layers][index]; return <Button key={key} type="button" role="tab" aria-label={l(key)} id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
                            variant={tab === key ? 'primary' : 'secondary'} className={`${buttonClass} px-2 sm:px-4`} onClick={() => setTab(key)} onKeyDown={event => {
                                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                event.preventDefault();
                                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowLeft' ? 2 : 1)) % 3;
                                setTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus();
                            }}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{l(`${key}Tab`)}</Button>; })}
                    </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
                    {issue && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        <p>{l(issue)}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {['loadError', 'saveError', 'exportError', 'conflict'].includes(issue) && <Button type="button" variant="secondary" className={buttonClass} disabled={busy} onClick={() => { if (issue === 'loadError') void load(); else if (issue === 'exportError') void exportPdf(); else if (issue === 'saveError') void save(); else if (window.confirm(l('reloadConfirm'))) void load(); }}>{l(issue === 'conflict' ? 'reload' : 'retry')}</Button>}
                            {loaded && <Button type="button" variant="secondary" className={buttonClass} onClick={() => download(new Blob([workspaceText(work, l)], { type: 'text/plain;charset=utf-8' }), 'counselorbot_visual_draft.txt')}>{l('copyDownload')}</Button>}
                        </div>
                    </div>}
                    {!loaded ? <p role="status" className="text-slate-600">{l(busy ? 'loading' : 'loadError')}</p> : <fieldset disabled={busy} className="min-w-0 space-y-4">
                        <section aria-label={l('howTo')} className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm leading-relaxed text-slate-800">
                            <h3 className="font-semibold">{l(tab)}</h3>
                            <p className="mt-1">{l(`${tab}Purpose`)}</p>
                            <details key={tab} open={helpOpen[tab]} onToggle={event => {
                                const expanded = event.currentTarget.open;
                                setHelpOpen(previous => previous[tab] === expanded ? previous : { ...previous, [tab]: expanded });
                            }}>
                                <summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('howTo')}</summary>
                                <ol className="list-decimal space-y-2 pl-5">{[1, 2, 3].map(step => <li key={step}>{l(`${tab}Step${step}`)}</li>)}</ol>
                                <p className="mt-3"><strong>{l('example')}: </strong>{l(`${tab}Example`)}</p>
                                <div className="mt-3 space-y-2 border-t border-indigo-200 pt-3 text-slate-600">
                                    <p>{l('saveHelp')}</p>
                                    <p>{l('exportHelp')}</p>
                                    {onDiscuss && <p>{l('discussHelp')}</p>}
                                    <p>{l('undoHelp')}</p>
                                </div>
                                <Button type="button" variant="secondary" className={`${buttonClass} mt-3 max-w-full whitespace-normal text-left`} onClick={() => {
                                    setHelpOpen(previous => ({ ...previous, [tab]: false }));
                                    window.requestAnimationFrame(() => {
                                        const firstForm = dialog.current?.querySelector('form')?.closest('details')?.querySelector('summary');
                                        firstForm?.focus({ preventScroll: true });
                                        firstForm?.scrollIntoView({ block: 'nearest' });
                                    });
                                }}>{l('startWorking')}</Button>
                            </details>
                        </section>
                        {tab === 'board' && <>
                            <details open={!work.actions.length || Boolean(draftTitle)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addAction')}</summary>
                            <form className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); if (!draftTitle.trim() || draftTitle.length > 160 || work.actions.length >= 30) return;
                                edit({ ...work, actions: [...work.actions, { id: crypto.randomUUID(), title: draftTitle.trim(), detail: draftDetail, stage: 'todo', reflection: '', source: draftSource }] }); setDraftTitle(''); setDraftDetail(''); setDraftSource(''); }}>
                                {sourceSelector('action')}
                                <label className="block text-sm font-medium">{l('titleField')}<input required maxLength={160} value={draftTitle} onChange={e => setDraftTitle(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                <label className="block text-sm">{l('detail')}<textarea maxLength={1000} rows={2} value={draftDetail} onChange={e => setDraftDetail(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                <Button type="submit" className={buttonClass} disabled={work.actions.length >= 30 || draftTitle.length > 160}>{l('addAction')}</Button>
                                {work.actions.length >= 30 && <p role="status">{l('limit')}</p>}
                            </form></details>
                            {!work.actions.length && <p className="py-5 text-center text-slate-600">{l('emptyBoard')}</p>}
                            <div className="grid gap-3 lg:grid-cols-3">{stages.map(stage => <section key={stage} aria-label={l(stage)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <h3 className={`mb-3 border-l-4 pl-2 font-semibold ${stage === 'doing' ? 'border-ochre-500' : 'border-indigo-400'}`}>{l(stage)} <span className="font-mono text-sm text-slate-500">{work.actions.filter(a => a.stage === stage).length}</span></h3>
                                <div className="space-y-3">{work.actions.filter(a => a.stage === stage).map(action => <article key={action.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <label className="block text-sm">{l('titleField')}<input data-workspace-field required maxLength={160} value={action.title} className={`${inputClass} mt-1 font-semibold`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, title: e.target.value } : a) })} /></label>
                                    <label className="mt-3 block text-sm">{l('move')}<select id={`${id}-action-${action.id}`} aria-label={`${l('move')}: ${action.title}`} value={action.stage} className={`${inputClass} mt-1 min-h-[44px]`} onChange={e => { edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, stage: e.target.value as ActionStage } : a) }); focusMoved(`${id}-action-${action.id}`); }}>{stages.map(s => <option key={s} value={s}>{l(s)}</option>)}</select></label>
                                    <details className="mt-2"><summary className="min-h-[44px] cursor-pointer py-3 text-sm font-medium text-indigo-700">{l('detail')} · {l('reflection')}</summary>
                                        <label className="block text-sm">{l('detail')}<textarea value={action.detail} maxLength={1000} rows={3} className={`${inputClass} mt-1`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, detail: e.target.value } : a) })} /></label>
                                        <label className="mt-2 block text-sm">{l('reflection')}<textarea value={action.reflection} maxLength={1000} rows={3} className={`${inputClass} mt-1`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, reflection: e.target.value } : a) })} /></label>
                                        <p className="mt-2 break-words text-xs text-slate-500">{l('source')}: {action.source || l('personal')}</p>
                                        {removeButton(action.title, () => edit({ ...work, actions: work.actions.filter(a => a.id !== action.id) }))}
                                    </details>
                                </article>)}</div>
                            </section>)}</div>
                        </>}
                        {tab === 'cards' && <>
                            <details open={!work.cards.length || Boolean(draftCard)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addCard')}</summary>
                            <form className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); if (!draftCard.trim() || draftCard.length > 600 || work.cards.length >= 30) return;
                                edit({ ...work, cards: [...work.cards, { id: crypto.randomUUID(), text: draftCard.trim(), bucket: 'unsorted', source: cardSource }] }); setDraftCard(''); setCardSource(''); }}>
                                <label className="block text-sm font-medium">{l('cardText')}<textarea required maxLength={600} rows={3} value={draftCard} onChange={e => setDraftCard(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                <p className="text-xs text-slate-600">{draftCard.length}/600 · {l('source')}: {cardSource || l('personal')}</p>
                                <Button type="submit" className={buttonClass} disabled={draftCard.length > 600 || work.cards.length >= 30}>{l('addCard')}</Button>
                                {(draftCard.length > 600 || work.cards.length >= 30) && <p role="status">{l('limit')}</p>}
                            </form></details>
                            {!work.cards.length && <p className="py-5 text-center text-slate-600">{l('emptyCards')}</p>}
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{buckets.map(bucket => <section key={bucket} aria-label={l(bucket)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <h3 className="mb-3 font-semibold">{l(bucket)} <span className="font-mono text-sm text-slate-500">{work.cards.filter(c => c.bucket === bucket).length}</span></h3>
                                <div className="space-y-3">{work.cards.filter(c => c.bucket === bucket).map(card => <article key={card.id} className="rounded-lg border border-indigo-200 bg-white p-3">
                                    <textarea aria-label={l('cardText')} data-workspace-field required maxLength={600} rows={4} value={card.text} className={inputClass} onChange={e => edit({ ...work, cards: work.cards.map(c => c.id === card.id ? { ...c, text: e.target.value } : c) })} />
                                    <label className="mt-2 block text-sm">{l('move')}<select id={`${id}-card-${card.id}`} value={card.bucket} className={`${inputClass} mt-1 min-h-[44px]`} onChange={e => { edit({ ...work, cards: work.cards.map(c => c.id === card.id ? { ...c, bucket: e.target.value as CardBucket } : c) }); focusMoved(`${id}-card-${card.id}`); }}>{buckets.map(b => <option key={b} value={b}>{l(b)}</option>)}</select></label>
                                    <p className="mt-2 break-words text-xs text-slate-500">{l('source')}: {card.source || l('personal')}</p>
                                    {removeButton(card.text, () => edit({ ...work, cards: work.cards.filter(c => c.id !== card.id) }))}
                                </article>)}</div>
                            </section>)}</div>
                        </>}
                        {tab === 'comparison' && <>
                            <details open={!work.comparison.options.length || Boolean(option)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addOption')}</summary>
                            <form className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); if (!option.trim() || option.length > 160 || work.comparison.options.length >= 3) return;
                                edit({ ...work, comparison: { ...work.comparison, options: [...work.comparison.options, { id: crypto.randomUUID(), title: option.trim(), source: optionSource }] } }); setOption(''); setOptionSource(''); }}>
                                {sourceSelector('option')}
                                <label className="block text-sm font-medium">{l('option')}<input required maxLength={160} value={option} onChange={e => setOption(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                <Button type="submit" className={buttonClass} disabled={work.comparison.options.length >= 3 || option.length > 160}>{l('addOption')}</Button>
                            </form></details>
                            <section aria-label={l('criteria')} className="space-y-2"><details open={!work.comparison.criteria.length} className="rounded-xl border border-slate-200 p-3">
                                <summary className="min-h-[44px] cursor-pointer py-3 font-semibold text-indigo-700">{l('criteria')}</summary>
                                <div className="flex flex-wrap gap-2">{work.comparison.criteria.map(c => <div key={c.id} className="flex min-w-0 flex-wrap items-center gap-1 rounded-md border border-slate-200 p-1">
                                    <input aria-label={l('criterion')} data-workspace-field required maxLength={100} value={c.label} className={`${inputClass} max-w-48`} onChange={e => edit({ ...work, comparison: { ...work.comparison, criteria: work.comparison.criteria.map(k => k.id === c.id ? { ...k, label: e.target.value } : k) } })} />
                                    {removeButton(c.label, () => edit(removeCriterion(work, c.id)))}
                                </div>)}</div>
                                <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (!criterion.trim() || work.comparison.criteria.length >= 6) return;
                                    edit({ ...work, comparison: { ...work.comparison, criteria: [...work.comparison.criteria, { id: crypto.randomUUID(), label: criterion.trim() }] } }); setCriterion(''); }}>
                                    <label className="min-w-0 flex-1 text-sm">{l('criterion')}<input required maxLength={100} value={criterion} className={`${inputClass} mt-1`} onChange={e => setCriterion(e.target.value)} /></label>
                                    <Button type="submit" className={buttonClass} disabled={work.comparison.criteria.length >= 6}>{l('addCriterion')}</Button>
                                </form></details>
                            </section>
                            {!work.comparison.options.length && <p className="py-5 text-center text-slate-600">{l('emptyComparison')}</p>}
                            <div className={`grid gap-3 ${work.comparison.options.length === 2 ? 'md:grid-cols-2' : work.comparison.options.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-1'}`}>{work.comparison.options.map(o => <article key={o.id} className={`min-w-0 rounded-xl border p-3 ${work.comparison.chosen === o.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                                <label className="block text-sm">{l('option')}<input data-workspace-field required maxLength={160} value={o.title} className={`${inputClass} mt-1 font-semibold`} onChange={e => edit({ ...work, comparison: { ...work.comparison, options: work.comparison.options.map(item => item.id === o.id ? { ...item, title: e.target.value } : item) } })} /></label>
                                {work.comparison.criteria.map(c => <label key={c.id} className="mt-3 block text-sm">{c.label}<textarea maxLength={500} rows={3} value={work.comparison.cells.find(cell => cell.option_id === o.id && cell.criterion_id === c.id)?.note || ''} className={`${inputClass} mt-1`} onChange={e => edit(setCell(work, o.id, c.id, e.target.value))} /></label>)}
                                <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium"><input type="radio" name={`${id}-choice`} checked={work.comparison.chosen === o.id} onChange={() => edit({ ...work, comparison: { ...work.comparison, chosen: o.id } })} />{l('choice')}</label>
                                <p className="break-words text-xs text-slate-500">{l('source')}: {o.source || l('personal')}</p>
                                {removeButton(o.title, () => edit(removeOption(work, o.id)))}
                            </article>)}</div>
                            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm"><input type="radio" name={`${id}-choice`} checked={!work.comparison.chosen} onChange={() => edit({ ...work, comparison: { ...work.comparison, chosen: null } })} />{l('noChoice')}</label>
                            <label className="block text-sm font-medium">{l('reason')}<textarea maxLength={1000} rows={3} value={work.comparison.reason} className={`${inputClass} mt-1`} onChange={e => edit({ ...work, comparison: { ...work.comparison, reason: e.target.value } })} /></label>
                        </>}
                    </fieldset>}
                </div>
                <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 p-3">
                    <p role="status" className="text-sm text-slate-600">{l(busy ? 'saving' : dirty ? 'unsaved' : loaded ? 'saved' : 'loading')}</p>
                    <div className="flex flex-wrap gap-2">
                        <Tooltip content={l('saveHelp')} side="top"><Button type="button" className={buttonClass} disabled={!loaded || busy || !dirty} onClick={() => void save()}>{l('save')}</Button></Tooltip>
                        <Tooltip content={l('undoHelp')} side="top"><Button type="button" variant="secondary" aria-label={l('undo')} className={buttonClass} disabled={busy || !history.length} onClick={() => { const previous = history[history.length - 1]; if (previous) { setWork(previous); setHistory(history.slice(0, -1)); } }}><Undo2 className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{l('undo')}</span></Button></Tooltip>
                        <Tooltip content={l('exportHelp')} side="top"><Button type="button" variant="secondary" className={buttonClass} disabled={!loaded || busy || !hasWork} onClick={() => void exportPdf()}>{l('export')}</Button></Tooltip>
                        {onDiscuss && <Tooltip content={l('discussHelp')} side="top"><Button type="button" variant="secondary" className={buttonClass} disabled={!loaded || busy || !hasWork} onClick={() => void discuss()}>{l('discuss')}</Button></Tooltip>}
                    </div>
                </footer>
            </section>
        </div>, document.body)}
    </>;
}
