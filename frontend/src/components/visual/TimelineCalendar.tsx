'use client';

import { eventDates, eventDateKey, localToday, sortedTimeline, validTimelineDates } from '@/lib/timeline-dates';
import { visualLabel } from '@/lib/i18n-visual-tools';
import type { TimelineEvent } from '@/lib/visual-tools';

export function TimelineCalendar({ events, locale, onOpen }: { events: TimelineEvent[]; locale: string; onOpen: (id: string) => void }) {
    const l = (key: string) => visualLabel(locale, key);
    const today = localToday();
    const time = (value: string) => Date.parse(value);
    const display = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(locale);
    const dated = sortedTimeline(events).filter(event => eventDateKey(event) !== '9999-99-99' && validTimelineDates(eventDates(event)));
    const undated = events.filter(event => !dated.some(item => item.id === event.id));
    const values = [time(today), ...dated.flatMap(event => {
        const dates = eventDates(event);
        return [dates.start_date, dates.end_date].filter((value): value is string => Boolean(value)).map(time);
    })].filter(Number.isFinite);
    const low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max((high - low) * 0.07, 86400000 * 7);
    const left = low - padding, right = high + padding;
    const position = (value: string) => (time(value) - left) / (right - left) * 100;
    const title = (event: TimelineEvent) => event.institution_event && event.institution_date === 'deadline' ? `${l('registrationDeadline')}: ${event.title}` : event.title;
    const label = (event: TimelineEvent) => {
        const dates = eventDates(event);
        return dates.date_mode === 'point' ? display(dates.start_date!) :
            `${dates.start_date ? display(dates.start_date) : l('openStart')} → ${dates.end_date ? display(dates.end_date) : l('openEnd')}`;
    };
    return <section aria-label={l('calendarView')} className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-3 sm:p-5">
        <h3 className="font-semibold">{l('calendarView')}</h3>
        <div className="hidden md:block">
            <div className="relative ml-[35%] h-7 border-b border-slate-300 text-xs text-slate-600">{[...new Set([low, high])].map(value => <span key={value} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(value - left) / (right - left) * 100}%` }}>{display(new Date(value).toISOString().slice(0, 10))}</span>)}</div>
            <div className="relative pt-8">
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 right-0 w-[65%]"><div className="absolute h-full border-l-2 border-ochre-500" style={{ left: `${position(today)}%` }}><span className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-white px-1 text-xs font-semibold text-slate-800">{l('today')}</span></div></div>
                {dated.map(event => {
                    const dates = eventDates(event);
                    const start = dates.start_date ? position(dates.start_date) : 0;
                    const end = dates.end_date ? position(dates.end_date) : 100;
                    return <button type="button" key={event.id} onClick={() => onOpen(event.id)} aria-label={`${l('eventDetails')}: ${title(event)}`} className="relative flex min-h-16 w-full items-center gap-0 rounded border-b border-slate-200 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600">
                        <span className="w-[35%] min-w-0 pr-4 py-2"><span className="block break-words font-medium">{title(event)}</span><span className="block text-xs text-slate-600">{label(event)}</span></span>
                        <span className="relative block h-8 w-[65%]" aria-hidden="true">
                            {dates.date_mode === 'point' ? <span className="absolute top-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-indigo-600" style={{ left: `${start}%` }} /> : <span className={`absolute top-2 h-4 min-w-1 border-2 border-indigo-600 bg-indigo-100 ${dates.start_date ? 'rounded-l-full' : 'border-l-0 border-dashed'} ${dates.end_date ? 'rounded-r-full' : 'border-r-0 border-dashed'}`} style={{ left: `${start}%`, width: `${Math.max(0, end - start)}%` }} />}
                        </span>
                    </button>;
                })}
            </div>
        </div>
        <ol className="ml-2 space-y-3 border-l-2 border-indigo-200 pl-4 md:hidden">
            {[...dated.map(event => ({ key: eventDateKey(event), event })), { key: today, event: null }].sort((a, b) => a.key.localeCompare(b.key)).map(({ event }) => event ?
                <li key={event.id} className="relative"><span aria-hidden="true" className={`absolute -left-[23px] top-4 w-3 bg-indigo-600 ${eventDates(event).date_mode === 'period' ? 'bottom-4 min-h-5 rounded-sm' : 'h-3 rounded-full'}`} /><button type="button" className="min-h-11 w-full rounded-lg border border-slate-200 p-3 text-left focus-visible:outline-2 focus-visible:outline-indigo-600" onClick={() => onOpen(event.id)} aria-label={`${l('eventDetails')}: ${title(event)}`}><span className="block break-words font-medium">{title(event)}</span><span className="block text-sm text-slate-600">{label(event)}</span></button></li> :
                <li key="today" className="relative py-2 text-sm font-semibold"><span aria-hidden="true" className="absolute -left-[25px] top-3 h-4 w-4 rounded-full bg-ochre-500" />{l('today')} · {display(today)}</li>)}
        </ol>
        {undated.length > 0 && <div className="space-y-2 border-t border-slate-200 pt-3"><p className="text-sm text-slate-600">{l('undated')}</p>{undated.map(event => <button key={event.id} type="button" className="block min-h-11 w-full rounded border border-slate-200 p-2 text-left" onClick={() => onOpen(event.id)}>{event.title} · {event.period}</button>)}</div>}
    </section>;
}
