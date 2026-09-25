'use client';

import { localToday } from '@/lib/timeline-dates';
import { visualLabel } from '@/lib/i18n-visual-tools';
import type { TimelineItem } from '@/lib/timeline-items';

const UNDATED = '9999-99-99';

/** Journey calendar over the unified timeline items (milestones, dated activities,
    goal reviews, institution appointments). Points render as dots, periods as bars;
    items without any date are listed below for placement. */
export function TimelineCalendar({ items, locale, onOpen }: { items: TimelineItem[]; locale: string; onOpen: (item: TimelineItem) => void }) {
    const l = (key: string) => visualLabel(locale, key);
    const today = localToday();
    const time = (value: string) => Date.parse(value);
    const display = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(locale);
    const key = (item: TimelineItem) => item.start ?? item.end ?? UNDATED;
    const dated = items.filter(item => item.start || item.end);
    const undated = items.filter(item => !item.start && !item.end);
    const values = [time(today), ...dated.flatMap(item => [item.start, item.end].filter((value): value is string => Boolean(value)).map(time))].filter(Number.isFinite);
    if (!values.length) return null;
    const low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max((high - low) * 0.07, 86400000 * 7);
    const left = low - padding, right = high + padding;
    const position = (value: string) => (time(value) - left) / (right - left) * 100;
    const title = (item: TimelineItem) => item.deadline ? `${l('registrationDeadline')}: ${item.title}` : item.title;
    const label = (item: TimelineItem) => item.dateMode === 'period'
        ? `${item.start ? display(item.start) : l('openStart')} → ${item.end ? display(item.end) : l('openEnd')}`
        : display(item.start!);
    return <section aria-label={l('calendarView')} className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-3 sm:p-5">
        <h3 className="font-semibold">{l('calendarView')}</h3>
        <div className="hidden md:block">
            <div className="relative ml-[35%] h-7 border-b border-slate-300 text-xs text-slate-600">{[...new Set([low, high])].map(value => <span key={value} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(value - left) / (right - left) * 100}%` }}>{display(new Date(value).toISOString().slice(0, 10))}</span>)}</div>
            <div className="relative pt-8">
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 right-0 w-[65%]"><div className="absolute h-full border-l-2 border-ochre-500" style={{ left: `${position(today)}%` }}><span className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-white px-1 text-xs font-semibold text-slate-800">{l('today')}</span></div></div>
                {dated.map(item => {
                    const start = item.start ? position(item.start) : 0;
                    const end = item.end ? position(item.end) : 100;
                    return <button type="button" key={item.key} onClick={() => onOpen(item)} aria-label={`${l('eventDetails')}: ${title(item)}`} className="relative flex min-h-16 w-full items-center gap-0 rounded border-b border-slate-200 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600">
                        <span className="w-[35%] min-w-0 pr-4 py-2"><span className="block break-words font-medium">{title(item)}</span><span className="block text-xs text-slate-600">{label(item)}</span></span>
                        <span className="relative block h-8 w-[65%]" aria-hidden="true">
                            {item.dateMode === 'period' ? <span className={`absolute top-2 h-4 min-w-1 border-2 border-indigo-600 bg-indigo-100 ${item.start ? 'rounded-l-full' : 'border-l-0 border-dashed'} ${item.end ? 'rounded-r-full' : 'border-r-0 border-dashed'}`} style={{ left: `${start}%`, width: `${Math.max(0, end - start)}%` }} /> : <span className="absolute top-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-indigo-600" style={{ left: `${start}%` }} />}
                        </span>
                    </button>;
                })}
            </div>
        </div>
        <ol className="ml-2 space-y-3 border-l-2 border-indigo-200 pl-4 md:hidden">
            {[...dated.map(item => ({ sortKey: key(item), item })), { sortKey: today, item: null as TimelineItem | null }].sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(({ item }) => item ?
                <li key={item.key} className="relative"><span aria-hidden="true" className={`absolute -left-[23px] top-4 w-3 bg-indigo-600 ${item.dateMode === 'period' ? 'bottom-4 min-h-5 rounded-sm' : 'h-3 rounded-full'}`} /><button type="button" className="min-h-11 w-full rounded-lg border border-slate-200 p-3 text-left focus-visible:outline-2 focus-visible:outline-indigo-600" onClick={() => onOpen(item)} aria-label={`${l('eventDetails')}: ${title(item)}`}><span className="block break-words font-medium">{title(item)}</span><span className="block text-sm text-slate-600">{label(item)}</span></button></li> :
                <li key="today" className="relative py-2 text-sm font-semibold"><span aria-hidden="true" className="absolute -left-[25px] top-3 h-4 w-4 rounded-full bg-ochre-500" />{l('today')} · {display(today)}</li>)}
        </ol>
        {undated.length > 0 && <div className="space-y-2 border-t border-slate-200 pt-3"><p className="text-sm text-slate-600">{l('undated')}</p>{undated.map(item => <button key={item.key} type="button" className="block min-h-11 w-full rounded border border-slate-200 p-2 text-left" onClick={() => onOpen(item)}>{title(item)}</button>)}</div>}
    </section>;
}
