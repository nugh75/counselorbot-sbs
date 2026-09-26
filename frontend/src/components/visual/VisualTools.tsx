'use client';
import { AssignmentSource } from '@/components/teacher/AssignmentSource';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, GitCommitHorizontal, Columns3, Download, Folder, FolderPlus, Image as ImageIcon, LayoutList, Layers, MessageSquare, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiFetch } from '@/lib/auth';
import { normalizeRecommendationCatalog, type RecommendationCatalog } from '@/lib/recommendations';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { NewDeckDialog } from './NewDeckDialog';
import { InlineRename } from '@/components/ui/InlineRename';
import { emptyWorkspace, removeAction, removeCriterion, removeOption, setCell, workspaceText, timelineText, cardColumnsOf, cardColumnLabel, renameCardColumn, removeCardColumn, cardDecksOf, activeDeckIdOf, addCardDeck, renameCardDeck, removeCardDeck, setActiveCardDeck, cardsInDeck, type ActionStage, type SavedWorkspace, type VisualWorkspace } from '@/lib/visual-tools';
import { validTimelineDates } from '@/lib/timeline-dates';
import { BUILTIN_CARD_IMAGES, tavoloImageUrl } from '@/lib/tavolo-images';
import { ActionDateFields, ActionDateSummary } from './ActionDates';

export type WorkTab = 'board' | 'comparison' | 'cards' | 'timeline';
type Tab = WorkTab;
export type VisualToolsRequest = { tab: WorkTab; nonce: number; eventId?: string };
type Props = {
    sessionId?: string;
    personal?: boolean;
    legacySession?: string;
    locale: string;
    compact?: boolean;
    hideTrigger?: boolean;
    catalog?: RecommendationCatalog;
    onDiscuss?: (text: string) => void;
    request?: VisualToolsRequest | null;
    fixedTab?: WorkTab;
    pageBackHref?: string;
    onWorkTabChange?: (tab: WorkTab) => void;
    openCreate?: boolean;
};
const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const buttonClass = 'h-[44px] w-[44px] shrink-0 p-0';
const stages: ActionStage[] = ['todo', 'doing', 'done'];
const workTabs: WorkTab[] = ['board', 'comparison', 'cards', 'timeline'];
const tabIcons: Record<Tab, typeof LayoutList> = {
    board: LayoutList, comparison: Columns3, cards: Layers, timeline: GitCommitHorizontal,
};
const isWorkTab = (tab: Tab): tab is WorkTab => workTabs.includes(tab as WorkTab);
// A refresh should not reopen the creation form: drop `new` once it has served its purpose.
const stripNewParam = () => {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('new')) return;
        url.searchParams.delete('new');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* best effort only */ }
};
export function VisualTools(props: Props) {
    return <WorkspaceView key={props.personal ? 'personal' : props.sessionId} {...props} />;
}

function WorkspaceView({ sessionId = '', personal = false, legacySession, locale, hideTrigger = false, catalog: providedCatalog, onDiscuss, request, fixedTab, pageBackHref, onWorkTabChange, openCreate = false }: Props) {
    const l = (key: string) => visualLabel(locale, personal ? ({ save: 'personalSave', saved: 'timelineSaved', saveHelp: 'personalSaveHelp', openHelp: 'personalTimelineHelp', working: 'personalTimelineHelp' } as Record<string, string>)[key] || key : key);
    const endpoint = personal ? '/api/user/timeline' : `/api/session/${encodeURIComponent(sessionId)}/visual-tools`;
    const [focusEvent, setFocusEvent] = useState<string | undefined>();
    const [open, setOpen] = useState(Boolean(fixedTab));
    const [toolsExpanded, setToolsExpanded] = useState(!personal);
    const [tab, setTab] = useState<Tab>(fixedTab ?? (personal ? 'timeline' : 'board'));
    const [helpOpen, setHelpOpen] = useState<Record<WorkTab, boolean>>({ board: false, comparison: false, cards: false, timeline: false });
    const [saved, setSaved] = useState<SavedWorkspace>({ revision: 0, workspace: emptyWorkspace() });
    const [work, setWork] = useState<VisualWorkspace>(emptyWorkspace);
    const [timelineSelection, setTimelineSelection] = useState<string[] | null>(null);
    // F23 (lotto 4): rinomina in linea per mazzi e colonne, al posto del prompt nativo.
    const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
    const [renamingColumnId, setRenamingColumnId] = useState<string | null>(null);
    const [history, setHistory] = useState<VisualWorkspace[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [issue, setIssue] = useState('');
    const [catalog, setCatalog] = useState<RecommendationCatalog>({ reading: [], strategy: [], advice: [] });
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDetail, setDraftDetail] = useState('');
    const [draftSource, setDraftSource] = useState('');
    const [draftCard, setDraftCard] = useState('');
    const [cardSource, setCardSource] = useState('');
    const [draftCardImage, setDraftCardImage] = useState('');
    const [pickingImageCardId, setPickingImageCardId] = useState<string | null>(null);
    const [deckDialogOpen, setDeckDialogOpen] = useState(false);
    const [deckListOpen, setDeckListOpen] = useState(true);
    const [dragCardId, setDragCardId] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const [criterion, setCriterion] = useState('');
    const [option, setOption] = useState('');
    const [optionSource, setOptionSource] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    // Questa schermata contiene un solo insieme coerente di strumenti. Taccuino,
    // Libretto e Tavolo hanno pagine proprie nell'Area personale.
    const tabs: Tab[] = fixedTab ? [fixedTab] : workTabs;
    const columns = cardColumnsOf(work);
    const tabLabel = (key: Tab) => l(key);
    const dialog = useRef<HTMLElement>(null);
    const loadGeneration = useRef(0);
    const opener = useRef<HTMLElement | null>(null);
    const id = useId();
    const dirty = JSON.stringify(work) !== JSON.stringify(saved.workspace);
    const hasWork = Boolean(work.actions.length || work.cards.length || work.comparison.options.length || work.timeline?.events.length);
    const currentCatalog = providedCatalog ?? catalog;
    useEffect(() => {
        if (!personal || tab !== 'board' || !loaded) return;
        const focusAction = () => {
            const hash = window.location.hash;
            if (!hash.startsWith('#action-')) return;
            let target: string;
            try { target = decodeURIComponent(hash.slice(1)); } catch { return; }
            const element = document.getElementById(target);
            element?.scrollIntoView({ block: 'center' });
            element?.focus({ preventScroll: true });
        };
        const frame = requestAnimationFrame(focusAction);
        window.addEventListener('hashchange', focusAction);
        return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', focusAction); };
    }, [personal, tab, loaded]);
    useEffect(() => {
        if (!personal || tab !== 'board' || !loaded || !openCreate) return;
        setCreateOpen(true);
        stripNewParam();
        const frame = requestAnimationFrame(() => {
            const input = document.getElementById(`${id}-new-action-title`);
            input?.scrollIntoView({ block: 'center' });
            input?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [personal, tab, loaded, openCreate, id]);
    const sources = [
        ...currentCatalog.strategy.map(item => ({ title: item.name || item.slug, detail: item.description || '', key: `strategy:${item.slug}` })),
        ...currentCatalog.reading.map(item => ({ title: item.title || item.slug, detail: item.why || '', key: `reading:${item.slug}` })),
    ];
    const edit = (next: VisualWorkspace) => { setHistory(previous => [...previous.slice(-29), work]); setWork(next); };
    // Embedded pages (personal fixed-tab) render the workspace inline in the
    // page flow, so the app header and the rest of the page stay visible.
    const embedded = Boolean(personal && fixedTab && pageBackHref);
    const selectTab = (next: Tab) => {
        setTab(next);
        if (isWorkTab(next)) onWorkTabChange?.(next);
    };
    const focusMoved = (itemId: string) => window.requestAnimationFrame(() => {
        const element = document.getElementById(itemId);
        element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'nearest' });
    });
    const launch = () => { opener.current = document.activeElement as HTMLElement; setOpen(true); };
    const load = useCallback(async () => {
        const generation = ++loadGeneration.current;
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch(personal ? `${endpoint}?${new URLSearchParams({ lang: locale, ...(legacySession ? { legacy_session: legacySession } : {}), ...(request?.eventId ? { event: request.eventId } : {}) })}` : endpoint, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error();
            const result: SavedWorkspace & { focus_event?: string } = await response.json();
            setFocusEvent(result.focus_event);
            if (generation !== loadGeneration.current) return;
            setSaved(result); setWork(result.workspace); setHistory([]); setLoaded(true);
        } catch { if (generation === loadGeneration.current) setIssue('loadError'); }
        finally { if (generation === loadGeneration.current) setBusy(false); }
    }, [endpoint, personal, locale, legacySession, request?.eventId]);

    useEffect(() => { if (open && !loaded) void load(); }, [open, loaded, load]);
    useEffect(() => {
        if (!open || providedCatalog || personal) return;
        const controller = new AbortController();
        void apiFetch(`/api/session/${encodeURIComponent(sessionId)}/recommendations?lang=${locale}`, { signal: controller.signal })
            .then(response => response.ok ? response.json() : null)
            .then(data => { if (data && !controller.signal.aborted) setCatalog(normalizeRecommendationCatalog(data)); }).catch(() => {});
        return () => controller.abort();
    }, [open, providedCatalog, sessionId, locale, personal]);
    useEffect(() => {
        if (!request) return;
        opener.current = document.activeElement as HTMLElement;
        setTab(fixedTab ?? request.tab); setOpen(true);
    }, [fixedTab, request]);
    useEffect(() => {
        if (!open || !pageBackHref) return;
        window.requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>('.workspace-page-back')?.focus({ preventScroll: true }));
    }, [open, pageBackHref]);
    useEffect(() => {
        if (!dirty) return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [dirty]);
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        if (!embedded) document.body.style.overflow = 'hidden';
        const keyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // Let the tooltip dismiss first; a second Escape closes the workspace.
                if (event.defaultPrevented || document.querySelector('[role="tooltip"]')) return;
                event.preventDefault();
                if (pageBackHref) dialog.current?.querySelector<HTMLButtonElement>('.workspace-page-back')?.click();
                else setOpen(false);
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
        return () => { if (!embedded) { document.body.style.overflow = previous; opener.current?.focus({ preventScroll: true }); } document.removeEventListener('keydown', keyboard); };
    }, [open, pageBackHref, embedded]);

    const save = async (next = work): Promise<SavedWorkspace | null> => {
        if (!loaded || busy) return null;
        if (next.timeline?.events.some(event => !validTimelineDates(event)) || next.actions.some(action => !validTimelineDates(action))) { setIssue('dateError'); return null; }
        if (next.actions.some(a => !a.title.trim()) || next.cards.some(c => !c.text.trim()) || next.comparison.options.some(o => !o.title.trim()) || next.comparison.criteria.some(c => !c.label.trim()) || (next.timeline?.events.length && (!next.timeline.title.trim() || next.timeline.events.some(e => !e.title.trim() || !e.period.trim())))) { setIssue('requiredFields'); return null; }
        for (const field of dialog.current?.querySelectorAll<HTMLInputElement>('[data-workspace-field]') ?? []) {
            if (!field.reportValidity()) return null;
        }
        if (next === work && !dirty) return saved;
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch(personal ? `${endpoint}?lang=${locale}` : endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision: saved.revision, workspace: next }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) { setIssue(response.status === 409 ? 'conflict' : 'saveError'); return null; }
            const result: SavedWorkspace = await response.json();
            if (next !== work) setHistory(previous => [...previous.slice(-29), work]);
            setSaved(result); setWork(result.workspace); return result;
        } catch { setIssue('saveError'); return null; }
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
        const text = tab === 'timeline' ? timelineText(work, l, timelineSelection ?? undefined) : workspaceText(work, l);
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
    const removeButton = (label: string, remove: () => void) => <Tooltip content={`${l('remove')}: ${label}`}><Button type="button" variant="ghost" className={buttonClass} aria-label={`${l('remove')}: ${label}`} onClick={remove}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>;

    return <>
        {!hideTrigger && <Tooltip content={l('openHelp')}>
            <Button type="button" variant="secondary" className={buttonClass} onClick={launch} aria-label={l('open')}>
                <LayoutList className="h-4 w-4 shrink-0" aria-hidden="true" />{dirty && <span aria-label={l('unsaved')}>•</span>}
            </Button>
        </Tooltip>}
        {open && createPortal(<div className={embedded ? 'page-narrow flex flex-col p-4 pt-0' : 'fixed inset-0 z-[85] flex bg-white'}>
            <section ref={dialog} role="dialog" aria-modal={embedded ? undefined : true} aria-labelledby={`${id}-title`} className={embedded ? 'flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm' : 'flex h-full w-full min-w-0 flex-col overflow-hidden bg-white'}>
                <header className="shrink-0 border-b border-slate-200 p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                        {pageBackHref && <PreviousPageButton
                            fallbackHref={pageBackHref}
                            variant="labelled"
                            className="workspace-page-back"
                            beforeBack={async () => {
                                if (dirty && !window.confirm(l('leaveConfirm'))) throw new Error('navigation cancelled');
                            }}
                        />}
                        <div className="min-w-0 flex-1"><h2 id={`${id}-title`} className="text-lg font-semibold text-slate-800">{personal ? tabLabel(tab) : l('title')}</h2></div>
                        {!pageBackHref && <Tooltip content={l('close')}><Button type="button" variant="ghost" className={buttonClass} autoFocus aria-label={l('close')} onClick={() => setOpen(false)}><X className="h-5 w-5" aria-hidden="true" /></Button></Tooltip>}
                    </div>
                    {!fixedTab && <details open={Boolean(pageBackHref) || toolsExpanded} onToggle={(event) => { if (!pageBackHref) setToolsExpanded(event.currentTarget.open); }}>
                    <summary hidden={!personal || Boolean(pageBackHref)} className="min-h-11 cursor-pointer py-2 text-sm text-indigo-700">{l('otherTools')}</summary>
                    <div role="tablist" aria-label={l('title')} className="mt-3 flex flex-wrap gap-1">
                        {tabs.map((key, index) => { const Icon = tabIcons[key]; return <Tooltip key={key} content={tabLabel(key)}><Button type="button" role="tab" aria-label={tabLabel(key)} id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
                            variant={tab === key ? 'primary' : 'secondary'} className={buttonClass} onClick={() => selectTab(key)} onKeyDown={event => {
                                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                event.preventDefault();
                                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? tabs.length - 1 : 1)) % tabs.length;
                                selectTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus();
                            }}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /></Button></Tooltip>; })}
                    </div>
                    </details>}
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" id={`${id}-panel`} role={fixedTab ? 'region' : 'tabpanel'} aria-labelledby={fixedTab ? `${id}-title` : `${id}-${tab}`}>
                    {issue && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        <p>{l(issue)}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {['loadError', 'saveError', 'exportError', 'conflict'].includes(issue) && <Tooltip content={l(issue === 'conflict' ? 'reload' : 'retry')}><Button aria-label={l(issue === 'conflict' ? 'reload' : 'retry')} type="button" variant="secondary" className={buttonClass} disabled={busy} onClick={() => { if (issue === 'loadError') void load(); else if (issue === 'exportError') void exportPdf(); else if (issue === 'saveError') void save(); else if (window.confirm(l('reloadConfirm'))) void load(); }}><RotateCcw className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>}
                            {loaded && <Tooltip content={l('copyDownload')}><Button aria-label={l('copyDownload')} type="button" variant="secondary" className={buttonClass} onClick={() => download(new Blob([workspaceText(work, l)], { type: 'text/plain;charset=utf-8' }), 'counselorbot_visual_draft.txt')}><Download className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>}
                        </div>
                    </div>}
                    {!loaded ? <p role="status" className="text-slate-600">{l(busy ? 'loading' : 'loadError')}</p> : <fieldset disabled={busy} className="min-w-0 space-y-4">
                        {!(personal && tab === 'timeline') && <section aria-label={l('howTo')} className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm leading-relaxed text-slate-800">
                            <h3 className="font-semibold">{l(tab)}</h3>
                            <details key={tab} open={helpOpen[tab]} onToggle={event => {
                                const expanded = event.currentTarget.open;
                                setHelpOpen(previous => previous[tab] === expanded ? previous : { ...previous, [tab]: expanded });
                            }}>
                                <summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('howTo')}</summary>
                                <p className="mb-3">{l(`${tab}Purpose`)}</p>
                                <p className="mb-3 text-slate-600">{l('working')}</p>
                                <ol className="list-decimal space-y-2 pl-5">{[1, 2, 3].map(step => <li key={step}>{l(`${tab}Step${step}`)}</li>)}</ol>
                                <p className="mt-3"><strong>{l('example')}: </strong>{l(`${tab}Example`)}</p>
                                <div className="mt-3 space-y-2 border-t border-indigo-200 pt-3 text-slate-600">
                                    <p>{l('saveHelp')}</p>
                                    <p>{l('exportHelp')}</p>
                                    {onDiscuss && <p>{l('discussHelp')}</p>}
                                    <p>{l('undoHelp')}</p>
                                </div>
                                <Tooltip content={l('startWorking')}><Button aria-label={l('startWorking')} type="button" variant="secondary" className={`${buttonClass} mt-3`} onClick={() => {
                                    setHelpOpen(previous => ({ ...previous, [tab]: false }));
                                    window.requestAnimationFrame(() => {
                                        const firstForm = dialog.current?.querySelector('form')?.closest('details')?.querySelector('summary');
                                        firstForm?.focus({ preventScroll: true });
                                        firstForm?.scrollIntoView({ block: 'nearest' });
                                    });
                                }}><ArrowRight className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                            </details>
                        </section>}
                        {tab === 'board' && <>
                            <details open={!work.actions.length || Boolean(draftTitle) || createOpen} onToggle={event => { if (!event.currentTarget.open) setCreateOpen(false); }} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addAction')}</summary>
                            <form className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); if (!draftTitle.trim() || draftTitle.length > 160 || work.actions.length >= (personal ? Infinity : 30)) return;
                                edit({ ...work, actions: [...work.actions, { id: crypto.randomUUID(), title: draftTitle.trim(), detail: draftDetail, stage: 'todo', reflection: '', source: draftSource }] }); setDraftTitle(''); setDraftDetail(''); setDraftSource(''); }}>
                                {sourceSelector('action')}
                                <label className="block text-sm font-medium">{l('titleField')}<input id={`${id}-new-action-title`} required maxLength={160} value={draftTitle} onChange={e => setDraftTitle(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                <label className="block text-sm">{l('detail')}<textarea maxLength={1000} rows={2} value={draftDetail} onChange={e => setDraftDetail(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                <Tooltip content={l('addAction')}><Button aria-label={l('addAction')} type="submit" className={buttonClass} disabled={work.actions.length >= (personal ? Infinity : 30) || draftTitle.length > 160}><Plus className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                {work.actions.length >= (personal ? Infinity : 30) && <p role="status">{l('limit')}</p>}
                            </form></details>
                            {!work.actions.length && <p className="py-5 text-center text-slate-600">{l('emptyBoard')}</p>}
                            <div className="grid gap-3 lg:grid-cols-3">{stages.map(stage => <section key={stage} aria-label={l(stage)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <h3 className="mb-3 font-semibold text-slate-700">{l(stage)} <span className="font-mono text-sm text-slate-500">{work.actions.filter(a => a.stage === stage).length}</span></h3>
                                <div className="space-y-3">{work.actions.filter(a => a.stage === stage).map(action => {
                                    const diary = /^\/profilo\/assegnazioni#assignment-\d+$/.test(action.source || '') ? work.timeline?.events.find(event => event.action_ids.includes(action.id)) : undefined;
                                    return <article key={action.id} id={personal ? `action-${action.id}` : undefined} tabIndex={personal ? -1 : undefined} className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-3">
                                    <label className="block text-sm">{action.kind === 'check' && <span className="mr-1 font-semibold" aria-hidden="true">◷</span>}{l('titleField')}<input data-workspace-field required maxLength={160} value={action.title} className={`${inputClass} mt-1 font-semibold`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, title: e.target.value } : a) })} /></label>
                                    {personal && <ActionDateSummary action={action} locale={locale} />}
                                    <label className="mt-3 block text-sm">{l('move')}<select id={`${id}-action-${action.id}`} aria-label={`${l('move')}: ${action.title}`} value={action.stage} className={`${inputClass} mt-1 min-h-[44px]`} onChange={e => { edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, stage: e.target.value as ActionStage } : a) }); focusMoved(`${id}-action-${action.id}`); }}>{stages.map(s => <option key={s} value={s} disabled={s === 'done' && action.kind === 'check' && !action.progress}>{l(s)}</option>)}</select></label>{action.kind === 'check' && !action.progress && <p role="status" className="mt-1 text-xs text-slate-500">{l('checkNeedsProgress')}</p>}
                                    <details className="mt-2"><summary className="min-h-[44px] cursor-pointer py-3 text-sm font-medium text-indigo-700">{l('detail')} · {action.kind === 'check' ? l('observe') : l('reflection')}</summary>
                                        {action.kind === 'check' ? <>
                                            <label className="block text-sm">{l('progress')}<select className={`${inputClass} mt-1`} value={action.progress || ''} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, progress: (e.target.value || null) as 'on_track' | 'slow' | 'stuck' | null } : a) })}><option value="">—</option>{(['on_track', 'slow', 'stuck'] as const).map(progress => <option key={progress} value={progress}>{l(progress)}</option>)}</select></label>
                                            <label className="mt-2 block text-sm">{l('observe')}<textarea value={action.reflection} maxLength={1000} rows={3} className={`${inputClass} mt-1`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, reflection: e.target.value } : a) })} /></label>
                                            <label className="mt-2 block text-sm">{l('adjust')}<textarea value={action.adjustment || ''} maxLength={1000} rows={3} className={`${inputClass} mt-1`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, adjustment: e.target.value } : a) })} /></label>
                                        </> : <label className="block text-sm">{l('actionKind')}<select className={`${inputClass} mt-1`} value={action.kind || 'activity'} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, kind: e.target.value as 'activity' | 'book' | 'article' | 'film' } : a) })}>{['activity', 'book', 'article', 'film'].map(kind => <option key={kind} value={kind}>{l(kind)}</option>)}</select></label>}
                                        {personal && <ActionDateFields value={action} locale={locale} onChange={dates => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, ...dates } : a) })} />}
                                        <label className="block text-sm">{l('detail')}<textarea value={action.detail} maxLength={1000} rows={3} className={`${inputClass} mt-1`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, detail: e.target.value } : a) })} /></label>
                                        {diary ? <p className="mt-2 py-2 text-sm text-slate-600">{action.kind === 'check' ? l('observe') : l('reflection')} · {l('timeline')}</p> : action.kind === 'check' ? null : <label className="mt-2 block text-sm">{l('reflection')}<textarea value={action.reflection} maxLength={1000} rows={3} className={`${inputClass} mt-1`} onChange={e => edit({ ...work, actions: work.actions.map(a => a.id === action.id ? { ...a, reflection: e.target.value } : a) })} /></label>}
                                        <p className="mt-2 break-words text-xs text-slate-500">{l('source')}: <AssignmentSource source={action.source || l('personal')} lang={locale} linked={personal} /></p>
                                        {removeButton(action.title, () => edit(removeAction(work, action.id)))}
                                    </details>
                                </article>; })}</div>
                            </section>)}</div>
                        </>}
                        {tab === 'cards' && (() => {
                            const decks = cardDecksOf(work, l('mainDeck'));
                            const activeDeckId = activeDeckIdOf(work);
                            const activeDeckCards = cardsInDeck(work, activeDeckId);
                            const currentDeckObj = decks.find(d => d.id === activeDeckId) || decks[0];

                            return <>
                            {deckListOpen ? (
                            <section aria-label={l('cardDecks')}>
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Folder className="h-4 w-4 text-indigo-600" aria-hidden="true" />{l('cardDecks')}</h3>
                                    <Tooltip content={l('newDeck')}><Button type="button" variant="secondary" className="min-h-11 gap-2 px-3" aria-label={l('newDeck')} disabled={decks.length >= 20} onClick={() => setDeckDialogOpen(true)}><FolderPlus className="h-4 w-4" aria-hidden="true" />{l('newDeck')}</Button></Tooltip>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {decks.map(deck => {
                                        const deckCards = cardsInDeck(work, deck.id);
                                        const deckCols = deck.card_columns?.length ? deck.card_columns : cardColumnsOf(work, deck.id);
                                        return <article key={deck.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                                            {renamingDeckId === deck.id ? <InlineRename value={deck.title} maxLength={100} ariaLabel={`${l('renameDeck')}: ${deck.title}`} onRename={name => { edit(renameCardDeck(work, deck.id, name, l('mainDeck'))); setRenamingDeckId(null); }} onCancel={() => setRenamingDeckId(null)} /> : <>
                                            <button type="button" className="min-h-11 flex-1 text-left" aria-label={`${l('cardDecks')}: ${deck.title}`} onClick={() => { edit(setActiveCardDeck(work, deck.id)); setDeckListOpen(false); }}>
                                                <h4 className="break-words font-semibold text-slate-900">{deck.title} <span className="font-mono text-sm text-slate-500">{deckCards.length}</span></h4>
                                                <p className="mt-1 break-words text-xs text-slate-500">{deckCols.map(c => cardColumnLabel(work, c, l)).join(' · ')}</p>
                                            </button>
                                            </>}
                                            <div className="mt-2 flex items-center gap-1 self-end">
                                                <Tooltip content={`${l('renameDeck')}: ${deck.title}`}><Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label={`${l('renameDeck')}: ${deck.title}`} onClick={() => setRenamingDeckId(previous => previous === deck.id ? null : deck.id)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                                {decks.length > 1 && <Tooltip content={`${l('deleteDeck')}: ${deck.title}`}><Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label={`${l('deleteDeck')}: ${deck.title}`} onClick={() => {
                                                    if (window.confirm(`${l('deleteDeck')}: "${deck.title}"?`)) edit(removeCardDeck(work, deck.id, l('mainDeck')));
                                                }}><Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" /></Button></Tooltip>}
                                            </div>
                                        </article>;
                                    })}
                                </div>
                            </section>
                            ) : (<>
                            <div className="flex flex-wrap items-center gap-2">
                                <Tooltip content={l('backToDecks')}><Button type="button" variant="secondary" className={buttonClass} aria-label={l('backToDecks')} onClick={() => setDeckListOpen(true)}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                {renamingDeckId === currentDeckObj.id && <InlineRename value={currentDeckObj.title} maxLength={100} ariaLabel={`${l('renameDeck')}: ${currentDeckObj.title}`} onRename={name => { edit(renameCardDeck(work, currentDeckObj.id, name, l('mainDeck'))); setRenamingDeckId(null); }} onCancel={() => setRenamingDeckId(null)} />}
                                    {!renamingDeckId && <h3 className="min-w-0 break-words font-semibold text-slate-900">{currentDeckObj.title} <span className="font-mono text-sm text-slate-500">{activeDeckCards.length}</span></h3>}
                                <div className="ml-auto flex items-center gap-1">
                                    <Tooltip content={`${l('renameDeck')}: ${currentDeckObj.title}`}><Button type="button" variant="ghost" className={buttonClass} aria-label={`${l('renameDeck')}: ${currentDeckObj.title}`} onClick={() => setRenamingDeckId(previous => previous === currentDeckObj.id ? null : currentDeckObj.id)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                    {decks.length > 1 && <Tooltip content={`${l('deleteDeck')}: ${currentDeckObj.title}`}><Button type="button" variant="ghost" className={buttonClass} aria-label={`${l('deleteDeck')}: ${currentDeckObj.title}`} onClick={() => {
                                        if (window.confirm(`${l('deleteDeck')}: "${currentDeckObj.title}"?`)) edit(removeCardDeck(work, currentDeckObj.id, l('mainDeck')));
                                    }}><Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" /></Button></Tooltip>}
                                </div>
                            </div>

                            {(() => {
                                const currentDeckCols = cardColumnsOf(work, activeDeckId);
                                return <>
                                <details open={!activeDeckCards.length || Boolean(draftCard)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addCard')}</summary>
                                <form className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); if (!draftCard.trim() || draftCard.length > 600 || work.cards.length >= 30) return;
                                    edit({ ...work, cards: [...work.cards, { id: crypto.randomUUID(), text: draftCard.trim(), bucket: currentDeckCols[0].id, source: cardSource, image: draftCardImage || null, deck_id: activeDeckId }] }); setDraftCard(''); setCardSource(''); setDraftCardImage(''); }}>
                                    <label className="block text-sm font-medium">{l('cardText')}<textarea required maxLength={600} rows={3} value={draftCard} onChange={e => setDraftCard(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                    <div className="block text-sm font-medium text-slate-700">
                                        <span className="mb-1 block">{l('cardImage') || 'Illustrazione (opzionale)'}</span>
                                        {draftCardImage ? (
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setPickingImageCardId('draft')}
                                                    className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1 hover:border-indigo-400 hover:bg-indigo-50/30"
                                                    title={l('changeImage')}
                                                >
                                                    <img src={tavoloImageUrl(draftCardImage)} alt="" className="max-h-full max-w-full object-contain" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDraftCardImage('')}
                                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-red-600"
                                                >
                                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                                    {l('removeImage')}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setPickingImageCardId('draft')}
                                                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
                                            >
                                                <ImageIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                                                + {l('addImage')}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600">{draftCard.length}/600 · {l('source')}: {cardSource || l('personal')}</p>
                                    <Tooltip content={l('addCard')}><Button aria-label={l('addCard')} type="submit" className={buttonClass} disabled={draftCard.length > 600 || work.cards.length >= 30}><Plus className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                    {(draftCard.length > 600 || work.cards.length >= 30) && <p role="status">{l('limit')}</p>}
                                </form></details>
                                {!activeDeckCards.length && <p className="py-5 text-center text-slate-600">{l('emptyCards')}</p>}
                                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, 240px), 1fr))` }}>{currentDeckCols.map(column => { const columnTitle = cardColumnLabel(work, column, l); const colCards = activeDeckCards.filter(c => c.bucket === column.id); return <section key={column.id} aria-label={columnTitle} onDragOver={event => { if (!dragCardId) return; event.preventDefault(); setDragOverCol(column.id); }} onDragLeave={event => { if (event.currentTarget.contains(event.relatedTarget as Node)) return; setDragOverCol(previous => previous === column.id ? null : previous); }} onDrop={event => { event.preventDefault(); const droppedId = dragCardId || event.dataTransfer.getData('text/plain'); if (droppedId) edit({ ...work, cards: work.cards.map(c => c.id === droppedId ? { ...c, bucket: column.id } : c) }); setDragCardId(null); setDragOverCol(null); }} className={`min-w-0 rounded-xl border bg-slate-50 p-3 transition-colors ${dragOverCol === column.id && dragCardId ? 'border-indigo-500 bg-indigo-50/70' : 'border-slate-200'}`}>
                                    <div className="mb-3 flex items-start justify-between gap-1">
                                        {renamingColumnId === column.id && <InlineRename value={column.label || ''} maxLength={100} ariaLabel={`${l('renameColumn')}: ${columnTitle}`} onRename={name => { edit(renameCardColumn(work, column.id, name, activeDeckId)); setRenamingColumnId(null); }} onCancel={() => setRenamingColumnId(null)} />}
                                        {!renamingColumnId && <h3 className="min-w-0 break-words font-semibold">{columnTitle} <span className="font-mono text-sm text-slate-500">{colCards.length}</span></h3>}
                                        <div className="flex shrink-0">
                                            <Tooltip content={l('renameColumn')}><Button type="button" variant="ghost" className={buttonClass} aria-label={`${l('renameColumn')}: ${columnTitle}`} onClick={() => setRenamingColumnId(previous => previous === column.id ? null : column.id)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                                            {currentDeckCols.length > 1 && removeButton(columnTitle, () => edit(removeCardColumn(work, column.id, activeDeckId)))}
                                        </div>
                                    </div>
                                    <div className="space-y-3">{colCards.map(card => <article key={card.id} draggable={!busy}
                                    onDragStart={event => {
                                        if ((event.target as HTMLElement).closest('textarea, input, select, button')) { event.preventDefault(); return; }
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', card.id);
                                        setDragCardId(card.id);
                                    }}
                                    onDragEnd={() => { setDragCardId(null); setDragOverCol(null); }}
                                    className={`group/card flex flex-col overflow-hidden rounded-xl border border-indigo-200/90 bg-white shadow-sm transition-shadow hover:shadow-md ${dragCardId === card.id ? 'opacity-50 ring-2 ring-indigo-400' : ''}`}>
                                    {card.image ? (
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setPickingImageCardId(card.id)}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPickingImageCardId(card.id); } }}
                                            className="relative flex h-44 w-full cursor-pointer items-center justify-center border-b border-slate-100 bg-slate-50/80 p-3 transition-colors hover:bg-indigo-50/40"
                                            aria-label={l('changeImage')}
                                            title={l('changeImage')}
                                        >
                                            <img
                                                src={tavoloImageUrl(card.image)}
                                                alt=""
                                                className="max-h-full max-w-full object-contain drop-shadow-sm transition-transform group-hover/card:scale-105"
                                            />
                                            <div className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-slate-600 shadow-sm opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-white hover:text-indigo-700">
                                                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setPickingImageCardId(card.id)}
                                            className="flex h-20 w-full items-center justify-center gap-2 border-b border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
                                            aria-label={l('addImage')}
                                        >
                                            <ImageIcon className="h-4 w-4 shrink-0 text-slate-400 group-hover/card:text-indigo-600" aria-hidden="true" />
                                            <span>+ {l('addImage')}</span>
                                        </button>
                                    )}

                                    <div className="flex flex-1 flex-col p-3">
                                        <textarea
                                            aria-label={l('cardText')}
                                            data-workspace-field
                                            required
                                            maxLength={600}
                                            rows={3}
                                            value={card.text}
                                            placeholder="..."
                                            className="w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[14px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            onChange={e => edit({ ...work, cards: work.cards.map(c => c.id === card.id ? { ...c, text: e.target.value } : c) })}
                                        />

                                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2 text-xs">
                                            <div className="flex flex-1 flex-wrap items-center gap-1.5">
                                                <select
                                                    id={`${id}-card-${card.id}`}
                                                    aria-label={l('move')}
                                                    value={card.bucket}
                                                    className="h-8 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-white"
                                                    onChange={e => { edit({ ...work, cards: work.cards.map(c => c.id === card.id ? { ...c, bucket: e.target.value } : c) }); focusMoved(`${id}-card-${card.id}`); }}
                                                >
                                                    {currentDeckCols.map(b => <option key={b.id} value={b.id}>{cardColumnLabel(work, b, l)}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex shrink-0 items-center">
                                                {removeButton(card.text, () => edit({ ...work, cards: work.cards.filter(c => c.id !== card.id) }))}
                                            </div>
                                        </div>
                                    </div>
                                </article>)}</div>
                            </section>; })}</div>
                            </>;
                            })()}
                        </>)}
                        </>;
                        })()}
                        {tab === 'comparison' && <>
                            <details open={!work.comparison.options.length || Boolean(option)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addOption')}</summary>
                            <form className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); if (!option.trim() || option.length > 160 || work.comparison.options.length >= 3) return;
                                edit({ ...work, comparison: { ...work.comparison, options: [...work.comparison.options, { id: crypto.randomUUID(), title: option.trim(), source: optionSource }] } }); setOption(''); setOptionSource(''); }}>
                                {sourceSelector('option')}
                                <label className="block text-sm font-medium">{l('option')}<input required maxLength={160} value={option} onChange={e => setOption(e.target.value)} className={`${inputClass} mt-1`} /></label>
                                <Tooltip content={l('addOption')}><Button aria-label={l('addOption')} type="submit" className={buttonClass} disabled={work.comparison.options.length >= 3 || option.length > 160}><Plus className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
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
                                    <Tooltip content={l('addCriterion')}><Button aria-label={l('addCriterion')} type="submit" className={buttonClass} disabled={work.comparison.criteria.length >= 6}><Plus className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
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
                {(personal || tab !== 'timeline') && <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 p-3">
                    <p role="status" className="text-sm text-slate-600">{l(busy ? 'saving' : dirty ? 'unsaved' : loaded ? 'saved' : 'loading')}</p>
                    <div className="flex flex-wrap gap-2">
                        <Tooltip content={l('saveHelp')} side="top"><Button aria-label={l('save')} type="button" className={personal ? 'min-h-11 px-4' : buttonClass} disabled={!loaded || busy || !dirty} onClick={() => void save()}><Save className="h-4 w-4" aria-hidden="true" />{personal && l('save')}</Button></Tooltip>
                        <Tooltip content={l('undoHelp')} side="top"><Button type="button" variant="secondary" aria-label={l('undo')} className={buttonClass} disabled={busy || !history.length} onClick={() => { const previous = history[history.length - 1]; if (previous) { setWork(previous); setHistory(history.slice(0, -1)); } }}><Undo2 className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                        <Tooltip content={l('exportHelp')} side="top"><Button aria-label={l('export')} type="button" variant="secondary" className={buttonClass} disabled={!loaded || busy || !hasWork} onClick={() => void exportPdf()}><Download className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                        {onDiscuss && <Tooltip content={l('discussHelp')} side="top"><Button aria-label={l('discuss')} type="button" variant="secondary" className={buttonClass} disabled={!loaded || busy || !hasWork || (tab === 'timeline' && !(work.timeline?.events.some(e => timelineSelection === null || timelineSelection.includes(e.id))))} onClick={() => void discuss()}><MessageSquare className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>}
                    </div>
                </footer>}
            </section>
            <NewDeckDialog open={deckDialogOpen} locale={locale} onCancel={() => setDeckDialogOpen(false)} onCreate={(title, columns) => { edit(addCardDeck(work, title, l('mainDeck'), [], columns)); setDeckDialogOpen(false); }} />
        </div>, document.body)}

        {/* Modal picker for card illustrations */}
        {pickingImageCardId && createPortal(
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="card-image-picker-title"
                    className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                        <h3 id="card-image-picker-title" className="text-base font-semibold text-slate-900">
                            {l('selectImage')}
                        </h3>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-9 w-9 p-0 text-slate-500 hover:text-slate-800"
                            onClick={() => setPickingImageCardId(null)}
                            aria-label={l('close')}
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5">
                        <div className="mb-4">
                            <button
                                type="button"
                                onClick={() => {
                                    if (pickingImageCardId === 'draft') {
                                        setDraftCardImage('');
                                    } else {
                                        edit({ ...work, cards: work.cards.map(c => c.id === pickingImageCardId ? { ...c, image: null } : c) });
                                    }
                                    setPickingImageCardId(null);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                                {l('removeImage')}
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {BUILTIN_CARD_IMAGES.map(img => {
                                const currentImage = pickingImageCardId === 'draft'
                                    ? draftCardImage
                                    : work.cards.find(c => c.id === pickingImageCardId)?.image;
                                const isSelected = currentImage === img.id;

                                return (
                                    <button
                                        key={img.id}
                                        type="button"
                                        onClick={() => {
                                            if (pickingImageCardId === 'draft') {
                                                setDraftCardImage(img.id);
                                            } else {
                                                edit({ ...work, cards: work.cards.map(c => c.id === pickingImageCardId ? { ...c, image: img.id } : c) });
                                            }
                                            setPickingImageCardId(null);
                                        }}
                                        className={`group flex flex-col items-center rounded-xl border p-2.5 text-left transition-all hover:shadow-md ${
                                            isSelected
                                                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/30'
                                                : 'border-slate-200 bg-slate-50/40 hover:border-indigo-300 hover:bg-white'
                                        }`}
                                    >
                                        <div className="flex h-24 w-full items-center justify-center p-1">
                                            <img
                                                src={tavoloImageUrl(img.id)}
                                                alt=""
                                                className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                                            />
                                        </div>
                                        <span className="mt-2 line-clamp-1 text-xs font-semibold text-slate-800">
                                            {img.name}
                                        </span>
                                        <span className="line-clamp-2 text-[11px] leading-tight text-slate-500">
                                            {img.usage}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )}
    </>;
}
