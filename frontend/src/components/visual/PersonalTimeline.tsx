'use client';

// Unified personal timeline (`/profilo/timeline`): past milestones, dated
// activities, goal reviews and institution appointments in one ordered view.
// Only milestones are edited here; activities and goals link to their pages.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, CalendarDays, Flag, Plus, Target, Trash2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiFetch } from '@/lib/auth';
import { goalApi, type PersonalGoal } from '@/lib/goals';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { TimelineCalendar } from './TimelineCalendar';
import { TimelineDateFields } from './TimelineDateFields';
import { InstitutionTimelineDates } from './InstitutionTimelineDates';
import { datePeriod, localToday, validTimelineDates, type TimelineDates } from '@/lib/timeline-dates';
import { filterItems, splitByToday, timelineItems, type TimelineItem, type TimelineItemKind } from '@/lib/timeline-items';
import type { SavedWorkspace, TimelineEvent, VisualWorkspace } from '@/lib/visual-tools';

const field = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const iconButton = 'h-[44px] w-[44px] shrink-0 p-0';
const FILTER_KEY = 'cb_timeline_filters';
const KINDS: TimelineItemKind[] = ['milestone', 'action', 'goal', 'appointment'];
const KIND_ICON: Record<TimelineItemKind, typeof Flag> = { milestone: Flag, action: Activity, goal: Target, appointment: CalendarDays };
const KIND_LABEL: Record<TimelineItemKind, string> = { milestone: 'milestone', action: 'kindAction', goal: 'kindGoal', appointment: 'kindAppointment' };
type Preview = { title: string; description: string; preview_hash: string };
type SnapshotPayload = { revision: number; event_ids: string[]; title: string; reflection: string; language: string };

const readFilters = (): Set<TimelineItemKind> => {
    try {
        const raw = localStorage.getItem(FILTER_KEY);
        if (raw) return new Set((JSON.parse(raw) as TimelineItemKind[]).filter(kind => KINDS.includes(kind)));
    } catch { /* best effort only */ }
    return new Set(KINDS);
};

export function PersonalTimeline({ locale }: { locale: string }) {
    const l = (key: string) => visualLabel(locale, key);
    const params = useSearchParams();
    const itemParam = params.get('item') || '';
    const eventParam = params.get('event') || undefined;
    const [saved, setSaved] = useState<SavedWorkspace | null>(null);
    const [work, setWork] = useState<VisualWorkspace | null>(null);
    const [goals, setGoals] = useState<PersonalGoal[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [issue, setIssue] = useState('');
    const [activeEvent, setActiveEvent] = useState<string | undefined>(undefined);
    const [createTitle, setCreateTitle] = useState('');
    const [createDates, setCreateDates] = useState<TimelineDates>({ date_mode: 'point', start_date: null, end_date: null });
    const [createSymbol, setCreateSymbol] = useState<TimelineEvent['symbol']>('milestone');
    const [createReflection, setCreateReflection] = useState('');
    const [createDirty, setCreateDirty] = useState(false);
    const [filters, setFilters] = useState<Set<TimelineItemKind> | null>(null);
    const [selected, setSelected] = useState<string[] | null>(null);
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyTitle, setCopyTitle] = useState('');
    const [reflection, setReflection] = useState('');
    const [preview, setPreview] = useState<{ data: Preview; payload: SnapshotPayload; requestId: string; signature: string } | null>(null);
    const [pending, setPending] = useState(false);
    const [savedItem, setSavedItem] = useState<number | null>(null);
    const [portfolio, setPortfolio] = useState<{ id: number; title: string }[]>([]);
    const [portfolioIssue, setPortfolioIssue] = useState(false);

    const timeline = useMemo(() => work?.timeline ?? { title: '', events: [] }, [work]);
    const workspace = useMemo(() => ({ actions: work?.actions ?? [], timeline }), [work, timeline]);
    const dirty = Boolean(work && saved && JSON.stringify(work) !== JSON.stringify(saved.workspace));
    useDraftGuard(loaded && (dirty || createDirty), l('leaveConfirm'));

    const load = useCallback(async () => {
        setBusy(true); setIssue('');
        try {
            const query = new URLSearchParams({ lang: locale, ...(eventParam ? { event: eventParam } : {}) });
            const [response, goalRows] = await Promise.all([
                apiFetch(`/api/user/timeline?${query}`, { signal: AbortSignal.timeout(15000) }),
                goalApi<PersonalGoal[]>('/user/goals').catch(() => [] as PersonalGoal[]),
            ]);
            if (!response.ok) throw new Error();
            const result: SavedWorkspace & { focus_event?: string } = await response.json();
            setGoals(goalRows);
            setSaved(result); setWork(result.workspace); setLoaded(true);
            if (result.focus_event) setActiveEvent(result.focus_event);
        } catch { setIssue('loadError'); }
        finally { setBusy(false); }
    }, [locale, eventParam]);
    useEffect(() => { void load(); }, [load]);

    const loadPortfolio = useCallback(async (signal?: AbortSignal) => {
        setPortfolioIssue(false);
        try {
            const response = await apiFetch('/api/user/portfolio', { signal });
            if (!response.ok) throw new Error();
            const items = await response.json();
            if (!Array.isArray(items)) throw new Error();
            setPortfolio(items);
        } catch { if (!signal?.aborted) setPortfolioIssue(true); }
    }, []);
    useEffect(() => { const controller = new AbortController(); void loadPortfolio(controller.signal); return () => controller.abort(); }, [loadPortfolio]);

    useEffect(() => { if (!filters) setFilters(readFilters()); }, [filters]);
    const chooseFilters = (next: Set<TimelineItemKind>) => {
        setFilters(next);
        try { localStorage.setItem(FILTER_KEY, JSON.stringify([...next])); } catch { /* per-viewer convenience only */ }
    };

    const save = useCallback(async (next?: VisualWorkspace): Promise<SavedWorkspace | null> => {
        if (!loaded || busy) return null;
        const target = next ?? work;
        if (!target) return null;
        const events = target.timeline?.events ?? [];
        if (events.some(event => !validTimelineDates(event))) { setIssue('dateError'); return null; }
        if (events.some(event => !event.title.trim())) { setIssue('requiredFields'); return null; }
        if (next === work && !dirty) return saved;
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch(`/api/user/timeline?lang=${locale}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision: saved!.revision, workspace: target }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) { setIssue(response.status === 409 ? 'conflict' : 'saveError'); return null; }
            const result: SavedWorkspace = await response.json();
            setSaved(result); setWork(result.workspace); return result;
        } catch { setIssue('saveError'); return null; }
        finally { setBusy(false); }
    }, [loaded, busy, work, dirty, saved, locale]);

    const updateEvent = (id: string, patch: Partial<TimelineEvent>) => setWork(previous => previous ? { ...previous, timeline: { title: previous.timeline?.title || l('timeline'), events: (previous.timeline?.events ?? []).map(event => event.id === id ? { ...event, ...patch } : event) } } : previous);

    const addMilestone = async () => {
        if (!createTitle.trim() || !validTimelineDates(createDates) || !work) return;
        const event: TimelineEvent = {
            id: crypto.randomUUID(), title: createTitle.trim(), ...createDates,
            period: datePeriod(createDates), tense: 'past', symbol: createSymbol,
            reflection: createReflection, source: '', action_ids: [], portfolio: [],
        };
        const state = await save({ ...work, timeline: { title: timeline.title || l('timeline'), events: [...timeline.events, event] } });
        if (!state) return;
        setCreateTitle(''); setCreateDates({ date_mode: 'point', start_date: null, end_date: null });
        setCreateReflection(''); setCreateSymbol('milestone'); setCreateDirty(false);
        setActiveEvent(event.id);
    };

    const items = useMemo(() => timelineItems(workspace, goals), [workspace, goals]);
    const filtered = useMemo(() => filterItems(items, filters ?? new Set(KINDS)), [items, filters]);
    const { past, future, undated } = useMemo(() => splitByToday(filtered, localToday()), [filtered]);

    // `?item=` (deep link from the activities board) and `?event=` (portfolio links)
    // highlight the entry and scroll to it; a milestone also opens its editor.
    const highlighted = itemParam || (eventParam && items.some(item => item.eventId === eventParam) ? `milestone-${eventParam}` : '');
    useEffect(() => {
        if (!loaded || !highlighted) return;
        window.requestAnimationFrame(() => {
            const eventId = items.find(item => item.key === highlighted)?.eventId;
            if (eventId) setActiveEvent(previous => previous ?? eventId);
            document.getElementById(`timeline-${highlighted}`)?.scrollIntoView({ block: 'center' });
        });
    }, [loaded, highlighted, items]);
    useEffect(() => {
        if (!activeEvent || activeEvent === 'new') return;
        window.requestAnimationFrame(() => document.getElementById(`timeline-milestone-${activeEvent}`)?.scrollIntoView({ block: 'nearest' }));
    }, [activeEvent]);

    const openItem = (item: TimelineItem) => {
        if (item.editable && item.eventId) {
            setActiveEvent(previous => previous === item.eventId ? undefined : item.eventId);
            window.requestAnimationFrame(() => document.getElementById(`timeline-${item.key}`)?.scrollIntoView({ block: 'nearest' }));
            return;
        }
        if (item.href) window.location.assign(item.href);
    };

    const selectedIds = timeline.events.filter(event => !event.institution_event && (selected === null || selected.includes(event.id))).map(event => event.id);
    const prepareCopy = async () => {
        setIssue(''); setPreview(null); setSavedItem(null);
        const state = await save();
        if (!state) return;
        setPending(true);
        try {
            const payload = { revision: state.revision, event_ids: selectedIds, title: copyTitle.trim(), reflection, language: locale.slice(0, 2) };
            const response = await apiFetch('/api/user/timeline/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
            if (!response.ok) { setIssue(response.status === 413 ? 'snapshotTooLong' : response.status === 409 ? 'conflict' : 'previewError'); return; }
            setPreview({ data: await response.json(), payload, requestId: crypto.randomUUID(), signature: JSON.stringify([state.workspace, selectedIds]) });
        } catch { setIssue('previewError'); }
        finally { setPending(false); }
    };
    const saveCopy = async () => {
        if (!preview) return;
        setPending(true); setIssue('');
        try {
            const response = await apiFetch('/api/user/timeline/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...preview.payload, preview_hash: preview.data.preview_hash, request_id: preview.requestId }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) { setIssue(response.status === 409 ? 'conflict' : 'timelineSaveError'); return; }
            setSavedItem((await response.json()).item_id); setPreview(null); void loadPortfolio();
        } catch { setIssue('timelineSaveError'); }
        finally { setPending(false); }
    };

    const kindName = (kind: TimelineItemKind) => l(KIND_LABEL[kind]);
    const renderSection = (list: TimelineItem[], highlight: string) => list.map(item => {
        const Icon = KIND_ICON[item.kind];
        const isHighlight = item.key === highlight;
        if (item.kind === 'milestone') {
            const event = timeline.events.find(e => e.id === item.eventId)!;
            return <MilestoneEditor key={item.key} event={event} locale={locale} open={activeEvent === event.id} onOpen={() => setActiveEvent(previous => previous === event.id ? undefined : event.id)}
                onPatch={patch => updateEvent(event.id, patch)} onRemove={() => setWork(previous => previous ? { ...previous, timeline: { title: previous.timeline?.title || l('timeline'), events: (previous.timeline?.events ?? []).filter(e => e.id !== event.id) } } : previous)}
                onSave={() => void save()} portfolio={portfolio} portfolioIssue={portfolioIssue} reloadPortfolio={loadPortfolio}
                selected={selectedIds.includes(event.id)} onSelect={checked => setSelected(previous => (previous ?? selectedIds).filter(id => id !== event.id).concat(checked ? [event.id] : []))}
                highlight={isHighlight} busy={busy} pending={pending} />;
        }
        const body = <span className="flex min-w-0 items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ochre-600" aria-hidden="true" />
            <span className="min-w-0">
                <span className="block break-words font-medium">{item.deadline ? `${l('registrationDeadline')}: ${item.title}` : item.title}</span>
                <span className="block text-xs text-slate-600">{kindName(item.kind)}{item.kind === 'appointment' && item.start ? ` · ${displayDate(item.start, locale)}` : ''}{item.kind === 'action' && item.stage ? ` · ${l(item.stage)}` : ''}</span>
            </span>
        </span>;
        const content = item.href
            ? <Link href={item.href} className="block min-h-11 rounded-xl border border-slate-200 bg-white p-3 text-left focus-visible:outline-2 focus-visible:outline-indigo-600" onClick={() => openItem(item)}>{body}</Link>
            : <div className="rounded-xl border border-slate-200 bg-white p-3">{body}</div>;
        return <li key={item.key} id={`timeline-${item.key}`} tabIndex={-1} className={`relative min-w-0 ${isHighlight ? 'ring-2 ring-ochre-500' : ''}`}>{content}</li>;
    });

    if (issue === 'loadError' || !work) {
        return <div className="space-y-3">
            {issue === 'loadError' && <p role="alert" className="text-sm text-red-800">{l('loadError')} <Button type="button" variant="secondary" onClick={() => void load()}>{l('retry')}</Button></p>}
            {loaded && <TimelineCalendar items={filtered} locale={locale} onOpen={openItem} />}
        </div>;
    }

    return <fieldset disabled={pending} className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => { setActiveEvent('new'); setCreateDirty(false); }} aria-expanded={activeEvent === 'new'}><Plus className="h-4 w-4" aria-hidden="true" />{l('addEvent')}</Button>
            <Link href="/profilo/azioni?new=1" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-800 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"><Plus className="h-4 w-4" aria-hidden="true" />{l('addActivity')}</Link>
            <Link href="/profilo/obiettivi?new=1" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-800 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"><Plus className="h-4 w-4" aria-hidden="true" />{l('addGoal')}</Link>
            <details className="ml-auto rounded-lg border border-slate-200 bg-white px-3">
                <summary className="min-h-11 cursor-pointer text-sm font-medium text-indigo-700" aria-label={l('filtersTitle')}>{l('filtersTitle')}</summary>
                <div className="flex flex-wrap gap-3 py-2">
                    {KINDS.map(kind => <label key={kind} className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" checked={(filters ?? new Set(KINDS)).has(kind)} onChange={e => {
                            const next = new Set(filters ?? new Set(KINDS));
                            if (e.target.checked) next.add(kind); else next.delete(kind);
                            chooseFilters(next);
                        }} />{kindName(kind)}
                    </label>)}
                </div>
            </details>
        </div>
        {issue && <p role="alert" className="text-sm text-red-800">{l(issue)}{(issue === 'conflict' || issue === 'saveError') && <> <Button type="button" variant="secondary" onClick={() => { if (issue === 'conflict' && window.confirm(l('reloadConfirm'))) void load(); else if (issue === 'saveError') void save(); }}>{l('retry')}</Button></>}</p>}

        {activeEvent === 'new' && <details open className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <summary className="min-h-11 cursor-pointer font-medium text-indigo-700">{l('addEvent')}</summary>
            <div className="mt-3 space-y-3">
                <label className="block text-sm">{l('eventTitle')}<input required maxLength={160} className={field} value={createTitle} onChange={e => { setCreateTitle(e.target.value); setCreateDirty(true); }} /></label>
                <TimelineDateFields value={createDates} onChange={value => { setCreateDates(value); setCreateDirty(true); }} locale={locale} workspace={false} />
                <label className="block text-sm">{l('symbol')}<select className={field} value={createSymbol} onChange={e => { setCreateSymbol(e.target.value as TimelineEvent['symbol']); setCreateDirty(true); }}>{(['milestone', 'study', 'work', 'change'] as const).map(key => <option key={key} value={key}>{l(key)}</option>)}</select></label>
                <label className="block text-sm">{l('diary')}<textarea aria-label={l('diary')} rows={2} maxLength={1000} className={field} value={createReflection} onChange={e => { setCreateReflection(e.target.value); setCreateDirty(true); }} /></label>
                <Button type="button" onClick={() => void addMilestone()} disabled={!createTitle.trim() || !validTimelineDates(createDates)}><Plus className="h-4 w-4" aria-hidden="true" />{l('addEvent')}</Button>
            </div>
        </details>}

        <TimelineCalendar items={filtered} locale={locale} onOpen={openItem} />

        <ol className="space-y-3">
            {!items.length && <li className="text-slate-600">{l('timelineEmpty')}</li>}
            {renderSection(past, highlighted)}
            {(past.length > 0 || future.length > 0) && <li aria-hidden="true" className="relative py-1 text-sm font-semibold text-ochre-700"><span className="absolute -left-[25px] top-3 h-4 w-4 rounded-full bg-ochre-500" />{l('today')} · {displayDate(localToday(), locale)}</li>}
            {renderSection(future, highlighted)}
        </ol>
        {undated.length > 0 && <section aria-label={l('sectionUndated')} className="space-y-3 border-t border-slate-200 pt-3">
            <h3 className="text-sm font-semibold text-slate-600">{l('sectionUndated')}</h3>
            <ol className="space-y-3">{renderSection(undated, highlighted)}</ol>
        </section>}

        <InstitutionTimelineDates locale={locale} work={work} edit={setWork} />

        {portfolioIssue && <div role="alert" className="text-sm text-red-800">{l('portfolioLoadError')} <Button type="button" variant="secondary" onClick={() => void loadPortfolio()}>{l('retry')}</Button></div>}
        {timeline.events.length > 0 && <div className="space-y-2 border-t border-slate-200 pt-3">
            <p className="text-sm text-slate-600">{l('selectedEvents')}: {selectedIds.length} · {l('selectEventsHelp')}</p>
            <Button type="button" variant="secondary" disabled={!selectedIds.length} onClick={() => { setCopyOpen(!copyOpen); setCopyTitle(timeline.title); setPreview(null); setSavedItem(null); }}>{l('savePortfolio')}</Button>
        </div>}
        {copyOpen && <section aria-label={l('savePortfolio')} className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-sm">{l('snapshotHelp')}</p>
            <label className="block text-sm">{l('snapshotTitle')}<input maxLength={160} className={field} value={copyTitle} onChange={e => { setCopyTitle(e.target.value); setPreview(null); }} /></label>
            <label className="block text-sm">{l('reflection')}<textarea aria-label={l('reflection')} maxLength={1000} rows={2} className={field} value={reflection} onChange={e => { setReflection(e.target.value); setPreview(null); }} /></label>
            <Button type="button" variant="secondary" disabled={!selectedIds.length || !copyTitle.trim()} onClick={() => void prepareCopy()}>{l('preview')}</Button>
            {preview && <><pre className="whitespace-pre-wrap break-words rounded-md bg-white p-3 font-sans text-sm">{preview.data.title}{'\n\n'}{preview.data.description}</pre><Button type="button" onClick={() => void saveCopy()}>{l('savePortfolio')}</Button></>}
            {['snapshotTooLong', 'previewError', 'timelineSaveError'].includes(issue) && <p role="alert" className="text-sm text-red-800">{l(issue)}</p>}
            {pending && <p role="status">{l('saving')}</p>}
            {savedItem && <p role="status">{l('snapshotSaved')} <a className="text-indigo-700 underline" href={`/profilo/portfolio#portfolio-${savedItem}`} target="_blank" rel="noopener noreferrer">{l('openPortfolio')}</a></p>}
        </section>}

        <div className="border-t border-slate-200 pt-3">
            <Tooltip content={l('personalSaveHelp')} side="top"><Button aria-label={l('personalSave')} type="button" className="min-h-11 px-4" disabled={busy || !dirty} onClick={() => void save()}>{l('personalSave')}</Button></Tooltip>
        </div>
    </fieldset>;
}

function displayDate(value: string, locale: string) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(locale);
}

function MilestoneEditor({ event, locale, open, onOpen, onPatch, onRemove, onSave, portfolio, portfolioIssue, reloadPortfolio, selected, onSelect, highlight, busy, pending }: {
    event: TimelineEvent; locale: string; open: boolean; onOpen: () => void; onPatch: (patch: Partial<TimelineEvent>) => void; onRemove: () => void;
    onSave: () => void; portfolio: { id: number; title: string }[]; portfolioIssue: boolean; reloadPortfolio: (signal?: AbortSignal) => Promise<void>;
    selected: boolean; onSelect: (checked: boolean) => void; highlight: boolean; busy: boolean; pending: boolean;
}) {
    const l = (key: string) => visualLabel(locale, key);
    return <li id={`timeline-milestone-${event.id}`} tabIndex={-1} className={`relative min-w-0 rounded-xl bg-white p-3 ${highlight ? 'ring-2 ring-ochre-500' : 'border border-slate-200'}`}>
        <details open={open} onToggle={e => { if (e.currentTarget.open && !open) onOpen(); }}>
            <summary className="min-h-11 cursor-pointer break-words py-2 font-medium text-indigo-700">{event.title}{event.period ? ` · ${event.period}` : ''}</summary>
            <div className="mt-3 space-y-3">
                <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} aria-label={`${l('selectEvent')}: ${event.title}`} /></label>
                <label className="block text-sm">{l('eventTitle')}<input data-workspace-field required maxLength={160} className={`${field} font-semibold`} value={event.title} onChange={e => onPatch({ title: e.target.value })} /></label>
                <TimelineDateFields value={event} locale={locale} legacyPeriod={event.period} onChange={value => onPatch({ ...value, period: datePeriod(value) || event.period })} />
                <label className="block text-sm">{l('symbol')}<select className={field} value={event.symbol} onChange={e => onPatch({ symbol: e.target.value as TimelineEvent['symbol'] })}>{(['milestone', 'study', 'work', 'change'] as const).map(key => <option key={key} value={key}>{l(key)}</option>)}</select></label>
                <label className="block text-sm">{l('diary')}<textarea aria-label={l('diary')} rows={2} maxLength={1000} className={field} value={event.reflection} onChange={e => onPatch({ reflection: e.target.value })} /></label>
                <div className="flex flex-wrap gap-2">
                    <Tooltip content={l('personalSave')}><Button type="button" variant="secondary" className="min-h-11 px-4" disabled={busy} onClick={onSave}>{l('personalSave')}</Button></Tooltip>
                    <Tooltip content={`${l('remove')}: ${event.title}`}><Button type="button" variant="ghost" size="md" className="gap-1.5" aria-label={`${l('remove')}: ${event.title}`} onClick={onRemove}><Trash2 className="h-4 w-4" aria-hidden="true" />{l('remove')}</Button></Tooltip>
                </div>
                <section aria-label={l('linkPortfolio')} className="min-w-0 space-y-2">
                    {event.portfolio.map(p => <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 p-2 text-sm">{p.title ? <a className="min-w-0 break-words text-indigo-700 underline" href={`/profilo/portfolio#portfolio-${p.id}`} target="_blank" rel="noopener noreferrer">{p.title}</a> : <span>{l('unavailable')}</span>}<Tooltip content={`${l('unlink')}: ${p.title || l('unavailable')}`}><Button type="button" variant="ghost" className={iconButton} aria-label={`${l('unlink')}: ${p.title || l('unavailable')}`} disabled={pending} onClick={() => onPatch({ portfolio: event.portfolio.filter(item => item.id !== p.id) })}><Unlink className="h-4 w-4" aria-hidden="true" /></Button></Tooltip></div>)}
                    <label className="block text-sm">{l('linkPortfolio')}<select className={field} value="" disabled={portfolioIssue || event.portfolio.length >= 20} onChange={e => { const p = portfolio.find(item => item.id === Number(e.target.value)); if (p) onPatch({ portfolio: [...event.portfolio, { id: p.id, title: p.title }] }); }}><option value="">—</option>{portfolio.filter(p => !event.portfolio.some(link => link.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
                    {portfolioIssue && <Button type="button" variant="secondary" onClick={() => void reloadPortfolio()}>{l('retry')}</Button>}
                </section>
            </div>
        </details>
    </li>;
}
