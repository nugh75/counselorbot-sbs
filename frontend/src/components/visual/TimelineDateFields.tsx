'use client';

import { visualLabel } from '@/lib/i18n-visual-tools';
import type { TimelineDates } from '@/lib/timeline-dates';

const field = 'mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';

export function TimelineDateFields({ value, onChange, locale, legacyPeriod, workspace = true }: {
    value: TimelineDates; onChange: (dates: TimelineDates) => void; locale: string; legacyPeriod?: string; workspace?: boolean;
}) {
    const l = (key: string) => visualLabel(locale, key);
    return <div className="space-y-3">
        {!value.date_mode && <p className="text-sm text-slate-600">{legacyPeriod} · {l('legacyDateHelp')}</p>}
        <label className="block text-sm">{l('dateMode')}<select aria-label={l('dateMode')} className={field} value={value.date_mode || ''} onChange={e => {
            const mode = e.target.value as 'point' | 'period';
            onChange({ ...value, date_mode: mode, end_date: mode === 'point' ? null : value.end_date });
        }}>
            {!value.date_mode && <option value="" disabled>—</option>}
            <option value="point">{l('singleDate')}</option><option value="period">{l('dateRange')}</option>
        </select></label>
        {value.date_mode && <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-sm">{l(value.date_mode === 'point' ? 'singleDate' : 'startDate')}<input data-workspace-field={workspace || undefined} type="date" min="0001-01-01" max={value.end_date || '9999-12-31'} required={!value.end_date} className={field} value={value.start_date || ''} onChange={e => onChange({ ...value, start_date: e.target.value || null })} /></label>
            {value.date_mode === 'period' && <label className="block min-w-0 text-sm">{l('endDate')}<input data-workspace-field={workspace || undefined} type="date" min={value.start_date || '0001-01-01'} max="9999-12-31" required={!value.start_date} className={field} value={value.end_date || ''} onChange={e => onChange({ ...value, end_date: e.target.value || null })} /></label>}
        </div>}
        {value.date_mode === 'period' && <p className="text-sm text-slate-600">{l('openDatesHelp')}</p>}
    </div>;
}
