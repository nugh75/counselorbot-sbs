'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BriefcaseBusiness, Flag, GraduationCap, Plus, Repeat2, Trash2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { TimelineCalendar } from './TimelineCalendar';
import { TimelineDateFields } from './TimelineDateFields';
import { datePeriod, sortedTimeline, validTimelineDates, type TimelineDates } from '@/lib/timeline-dates';
import { InstitutionTimelineDates } from './InstitutionTimelineDates';
import { apiFetch } from '@/lib/auth';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { moveTimelineEvent, type ActionKind, type SavedWorkspace, type TimelineEvent, type VisualWorkspace } from '@/lib/visual-tools';

const field = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const iconButton = 'h-[44px] w-[44px] shrink-0 p-0';
const symbols = { milestone: Flag, study: GraduationCap, work: BriefcaseBusiness, change: Repeat2 };
type Preview = { title: string; description: string; preview_hash: string };
type SnapshotPayload = { revision: number; event_ids: string[]; title: string; reflection: string; language: string };
type Props = { personal?: boolean; sessionId: string; locale: string; work: VisualWorkspace; edit: (work: VisualWorkspace) => void;
    save: () => Promise<SavedWorkspace | null>; selected: string[] | null; select: (ids: string[]) => void; focusEvent?: string };

export function TimelineTools({ personal = false, sessionId, locale, work, edit, save, selected, select, focusEvent }: Props) {
    const l = (key: string) => visualLabel(locale, key);
    const originalTimeline = work.timeline ?? { title: '', events: [] };
    const timeline = personal ? { ...originalTimeline, events: sortedTimeline(originalTimeline.events) } : originalTimeline;
    const selectedIds = timeline.events.filter(e => selected === null || selected.includes(e.id)).map(e => e.id);
    const [title, setTitle] = useState('');
    const [period, setPeriod] = useState('');
    const [dates, setDates] = useState<TimelineDates>({ date_mode: 'point', start_date: null, end_date: null });
    const [activeEvent, setActiveEvent] = useState<string | undefined>(focusEvent);
    const [tense, setTense] = useState<'past' | 'future'>('future');
    const [portfolio, setPortfolio] = useState<{ id: number; title: string }[]>([]);
    const [portfolioIssue, setPortfolioIssue] = useState(false);
    const [actionKinds, setActionKinds] = useState<Record<string, ActionKind>>({});
    const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyTitle, setCopyTitle] = useState('');
    const [reflection, setReflection] = useState('');
    const [preview, setPreview] = useState<{ data: Preview; payload: SnapshotPayload; requestId: string; signature: string } | null>(null);
    const [pending, setPending] = useState(false);
    const [issue, setIssue] = useState('');
    const [savedItem, setSavedItem] = useState<number | null>(null);
    const signature = JSON.stringify([work, selectedIds]);
    const validPreview = preview?.signature === signature ? preview : null;
    const endpoint = personal ? '/api/user/timeline' : `/api/session/${encodeURIComponent(sessionId)}/visual-tools/timeline`;
    const limit = personal ? Infinity : 30;
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
    useEffect(() => {
        if (focusEvent) {
            setActiveEvent(focusEvent);
            window.requestAnimationFrame(() => document.getElementById(`timeline-${focusEvent}`)?.scrollIntoView({ block: 'center' }));
        }
    }, [focusEvent]);
    const updateEvent = (id: string, patch: Partial<TimelineEvent>) => edit({ ...work, timeline: { ...timeline, events: timeline.events.map(e => e.id === id ? { ...e, ...patch } : e) } });
    const tool = (name: string, Icon: typeof Plus, run: () => void, disabled = false) => <Tooltip content={name}><Button type="button" variant="secondary" aria-label={name} className={iconButton} disabled={disabled} onClick={run}><Icon className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>;
    const prepareCopy = async () => {
        setIssue(''); setPreview(null); setSavedItem(null);
        const state = await save();
        if (!state) return;
        setPending(true);
        try {
            const payload = { revision: state.revision, event_ids: selectedIds, title: copyTitle.trim(), reflection, language: locale.slice(0, 2) };
            const response = await apiFetch(`${endpoint}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
            if (!response.ok) { setIssue(response.status === 413 ? 'snapshotTooLong' : response.status === 409 ? 'conflict' : 'previewError'); return; }
            setPreview({ data: await response.json(), payload, requestId: crypto.randomUUID(), signature: JSON.stringify([state.workspace, selectedIds]) });
        } catch { setIssue('previewError'); }
        finally { setPending(false); }
    };
    const saveCopy = async () => {
        if (!validPreview) return;
        setPending(true); setIssue('');
        try {
            const response = await apiFetch(`${endpoint}/portfolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...validPreview.payload, preview_hash: validPreview.data.preview_hash, request_id: validPreview.requestId }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) { setIssue(response.status === 409 ? 'conflict' : 'timelineSaveError'); return; }
            setSavedItem((await response.json()).item_id); setPreview(null); void loadPortfolio();
        } catch { setIssue('timelineSaveError'); }
        finally { setPending(false); }
    };
    return <fieldset disabled={pending} className="min-w-0 space-y-4">
        {personal && <><p className="text-sm leading-relaxed text-slate-600">{l('calendarHelp')}</p><TimelineCalendar events={timeline.events} locale={locale} onOpen={id => { setActiveEvent(id); window.requestAnimationFrame(() => { const element = document.getElementById(`timeline-${id}`); element?.scrollIntoView({ block: 'nearest' }); element?.focus({ preventScroll: true }); }); }} /></>}
        {!personal && <label className="block text-sm font-medium">{l('timelineTitle')}<input data-workspace-field required={timeline.events.length > 0} maxLength={160} className={field} value={timeline.title} onChange={e => edit({ ...work, timeline: { ...timeline, title: e.target.value } })} /></label>}
        <details open={!timeline.events.length || Boolean(title)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('addEvent')}</summary>
            <form className="space-y-3" onSubmit={e => {
                e.preventDefault(); if (!title.trim() || (personal ? !validTimelineDates(dates) : !period.trim() || !timeline.title.trim()) || timeline.events.length >= limit) return;
                const event: TimelineEvent = { id: crypto.randomUUID(), title: title.trim(), ...(personal ? dates : {}), period: personal ? datePeriod(dates) : period.trim(), tense, symbol: 'milestone', reflection: '', source: '', action_ids: [], portfolio: [] };
                edit({ ...work, timeline: { ...timeline, title: timeline.title || l('timeline'), events: [...timeline.events, event] } });
                if (selected !== null) select([...selectedIds, event.id]);
                setTitle(''); setPeriod(''); setActiveEvent(event.id); setDates({ date_mode: 'point', start_date: null, end_date: null });
            }}>
                <label className="block text-sm">{l('eventTitle')}<input required maxLength={160} className={field} value={title} onChange={e => setTitle(e.target.value)} /></label>
                {personal ? <TimelineDateFields value={dates} onChange={setDates} locale={locale} workspace={false} /> : <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">{l('period')}<input required maxLength={100} className={field} value={period} onChange={e => setPeriod(e.target.value)} /></label>
                    <label className="block text-sm">{l('tense')}<select className={field} value={tense} onChange={e => setTense(e.target.value as 'past' | 'future')}><option value="past">{l('past')}</option><option value="future">{l('future')}</option></select></label>
                </div>}
                <Tooltip content={l('addEvent')}><Button type="submit" aria-label={l('addEvent')} className={personal ? 'min-h-11 px-4' : iconButton} disabled={(personal ? !validTimelineDates(dates) : !timeline.title.trim()) || timeline.events.length >= limit}><Plus className="h-4 w-4" aria-hidden="true" />{personal && l('addEvent')}</Button></Tooltip>
                {timeline.events.length >= limit && <p role="status">{l('limit')}</p>}
            </form>
        </details>
        {!timeline.events.length && <p className="text-slate-600">{l('timelineEmpty')}</p>}
        <ol className={personal ? "space-y-4" : "ml-2 space-y-4 border-l-2 border-indigo-200 pl-4"}>
            {timeline.events.filter(event => !personal || activeEvent === event.id).map((event, index) => { const Icon = symbols[event.symbol]; return <li key={event.id} tabIndex={-1} id={`timeline-${event.id}`} className="relative min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                <details open={!personal || activeEvent === event.id} onToggle={e => { if (e.currentTarget.open) setActiveEvent(event.id); else setActiveEvent(previous => previous === event.id ? undefined : previous); }}>
                <summary className="min-h-11 cursor-pointer break-words py-2 font-medium text-indigo-700">{event.title} · {event.period}</summary>
                {!personal && <div className="absolute -left-[23px] top-5 h-3 w-3 rounded-full bg-indigo-500" aria-hidden="true" />}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.includes(event.id)} onChange={e => select(e.target.checked ? [...selectedIds, event.id] : selectedIds.filter(id => id !== event.id))} aria-label={`${l('selectEvent')}: ${event.title}`} /><Icon className="h-4 w-4" aria-hidden="true" />{index + 1}{!event.date_mode && !personal ? ` · ${l(event.tense)}` : ''}</label>
                    <div className="flex gap-1">{!personal && tool(`${l('moveUp')}: ${event.title}`, ArrowUp, () => edit(moveTimelineEvent(work, event.id, -1)), index === 0)}{!personal && tool(`${l('moveDown')}: ${event.title}`, ArrowDown, () => edit(moveTimelineEvent(work, event.id, 1)), index === timeline.events.length - 1)}{tool(`${l('remove')}: ${event.title}`, Trash2, () => edit({ ...work, timeline: { ...timeline, events: timeline.events.filter(e => e.id !== event.id) } }))}</div>
                </div>
                {event.institution_event && <p className="text-sm font-medium text-indigo-700">{l(event.institution_available === false ? 'unavailable' : 'institutionManaged')}{event.institution_date === 'deadline' ? ` · ${l('registrationDeadline')}` : ''}</p>}
                <label className="block text-sm">{l('eventTitle')}<input readOnly={Boolean(event.institution_event)} data-workspace-field required maxLength={160} className={`${field} font-semibold`} value={event.title} onChange={e => updateEvent(event.id, { title: e.target.value })} /></label>
                {personal && !event.institution_event && <TimelineDateFields value={event} locale={locale} legacyPeriod={event.period} onChange={value => updateEvent(event.id, { ...value, period: datePeriod(value) || event.period })} />}
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {(!personal || Boolean(event.institution_event)) && <>
                    <label className="block text-sm">{l('period')}<input readOnly={Boolean(event.institution_event)} data-workspace-field required maxLength={100} className={field} value={event.institution_event && event.institution_available !== false ? new Date(event.period).toLocaleString(locale) : event.period} onChange={e => updateEvent(event.id, { period: e.target.value })} /></label>
                    <label className="block text-sm">{l('tense')}<select className={field} disabled={Boolean(event.institution_event)} value={event.tense} onChange={e => updateEvent(event.id, { tense: e.target.value as TimelineEvent['tense'] })}><option value="past">{l('past')}</option><option value="future">{l('future')}</option></select></label>
                    </>}<label className="block text-sm">{l('symbol')}<select className={field} value={event.symbol} onChange={e => updateEvent(event.id, { symbol: e.target.value as TimelineEvent['symbol'] })}>{Object.keys(symbols).map(key => <option key={key} value={key}>{l(key)}</option>)}</select></label>
                </div>
                {personal && <label className="mt-3 block text-sm">{l('planned')}<textarea aria-label={l('planned')} rows={2} maxLength={1000} className={field} value={event.planned || ''} onChange={e => updateEvent(event.id, { planned: e.target.value })} /></label>}
                <label className="mt-3 block text-sm">{l(personal ? 'diary' : 'reflection')}<textarea aria-label={l(personal ? 'diary' : 'reflection')} rows={2} maxLength={1000} className={field} value={event.reflection} onChange={e => updateEvent(event.id, { reflection: e.target.value })} /></label>
                {personal && <div className="my-3 flex flex-wrap gap-4">{(['notebook', 'booklet', 'orientation'] as const).map(key => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={(event.personal_links || []).includes(key)} onChange={e => updateEvent(event.id, { personal_links: e.target.checked ? [...(event.personal_links || []), key] : (event.personal_links || []).filter(link => link !== key) })} />{l(key)}</label>)}</div>}
                {(event.personal_links || []).map(key => <a key={key} className="mr-4 inline-block min-h-11 py-2 text-indigo-700 underline" href={`/profilo/${{ notebook: 'taccuino', booklet: 'libretto', orientation: 'orientamento' }[key]}`}>{l(key)}</a>)}
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <section aria-label={l('board')} className="min-w-0 space-y-2">
                        {event.action_ids.map(id => { const action = work.actions.find(a => a.id === id); return <div key={id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 p-2 text-sm"><span className="min-w-0 break-words">{action ? `${action.kind && action.kind !== 'activity' ? l(action.kind) + ': ' : ''}${action.title} · ${l(action.stage)}` : l('unavailable')}</span>{tool(`${l('unlink')}: ${action?.title || l('unavailable')}`, Unlink, () => updateEvent(event.id, { action_ids: event.action_ids.filter(a => a !== id) }))}</div>; })}
                        <label className="block text-sm">{l('linkAction')}<select className={field} value="" onChange={e => { if (e.target.value) updateEvent(event.id, { action_ids: [...event.action_ids, e.target.value] }); }}><option value="">—</option>{work.actions.filter(a => !event.action_ids.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
                        <label className="block text-sm">{l('actionKind')}<select className={field} value={actionKinds[event.id] || 'activity'} onChange={e => setActionKinds(previous => ({ ...previous, [event.id]: e.target.value as ActionKind }))}>{['activity', 'book', 'article', 'film'].map(kind => <option key={kind} value={kind}>{l(kind)}</option>)}</select></label>
                        <form className="flex items-end gap-2" onSubmit={e => {
                            e.preventDefault(); const name = (actionDrafts[event.id] || '').trim(); if (!name || work.actions.length >= limit) return;
                            const actionId = crypto.randomUUID();
                            edit({ ...work, actions: [...work.actions, { id: actionId, title: name, kind: actionKinds[event.id] || 'activity', stage: 'todo', detail: '', reflection: '', source: '' }], timeline: { ...timeline, events: timeline.events.map(t => t.id === event.id ? { ...t, action_ids: [...t.action_ids, actionId] } : t) } });
                            setActionDrafts(previous => ({ ...previous, [event.id]: '' }));
                        }}><label className="min-w-0 flex-1 text-sm">{l('createAction')}<input required maxLength={160} className={field} value={actionDrafts[event.id] || ''} onChange={e => setActionDrafts(previous => ({ ...previous, [event.id]: e.target.value }))} /></label><Tooltip content={l('createAction')}><Button type="submit" aria-label={l('createAction')} className={iconButton} disabled={work.actions.length >= limit}><Plus className="h-4 w-4" aria-hidden="true" /></Button></Tooltip></form>
                    </section>
                    <section aria-label={l('linkPortfolio')} className="min-w-0 space-y-2">
                        {event.portfolio.map(p => <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 p-2 text-sm">{p.title ? <a className="min-w-0 break-words text-indigo-700 underline" href={`/profilo/portfolio#portfolio-${p.id}`} target="_blank" rel="noopener noreferrer">{p.title}</a> : <span>{l('unavailable')}</span>}{tool(`${l('unlink')}: ${p.title || l('unavailable')}`, Unlink, () => updateEvent(event.id, { portfolio: event.portfolio.filter(item => item.id !== p.id) }))}</div>)}
                        <label className="block text-sm">{l('linkPortfolio')}<select className={field} value="" disabled={portfolioIssue || event.portfolio.length >= 20} onChange={e => { const p = portfolio.find(item => item.id === Number(e.target.value)); if (p) updateEvent(event.id, { portfolio: [...event.portfolio, { id: p.id, title: p.title }] }); }}><option value="">—</option>{portfolio.filter(p => !event.portfolio.some(link => link.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
                    </section>
                </div>
                </details>
            </li>; })}
        </ol>
        {personal && <InstitutionTimelineDates locale={locale} work={work} edit={edit} />}
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
            {validPreview && <><pre className="whitespace-pre-wrap break-words rounded-md bg-white p-3 font-sans text-sm">{validPreview.data.title}{'\n\n'}{validPreview.data.description}</pre><Button type="button" onClick={() => void saveCopy()}>{l('savePortfolio')}</Button></>}
            {issue && <p role="alert" className="text-sm text-red-800">{l(issue)}</p>}
            {pending && <p role="status">{l('saving')}</p>}
            {savedItem && <p role="status">{l('snapshotSaved')} <a className="text-indigo-700 underline" href={`/profilo/portfolio#portfolio-${savedItem}`} target="_blank" rel="noopener noreferrer">{l('openPortfolio')}</a></p>}
        </section>}
    </fieldset>;
}
