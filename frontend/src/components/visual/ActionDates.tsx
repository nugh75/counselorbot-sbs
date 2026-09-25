'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { visualLabel } from '@/lib/i18n-visual-tools';
import type { TimelineDates } from '@/lib/timeline-dates';
import type { Action } from '@/lib/visual-tools';
import { TimelineDateFields } from './TimelineDateFields';

/** Date fields for an activity's detail panel: reuses `TimelineDateFields`
    (none / day / period) and adds a way back to "no date", which the shared
    component does not offer on its own. */
export function ActionDateFields({ value, onChange, locale }: {
    value: TimelineDates; onChange: (dates: TimelineDates) => void; locale: string;
}) {
    const l = (key: string) => visualLabel(locale, key);
    return <div className="space-y-2">
        <TimelineDateFields value={value} onChange={onChange} locale={locale} />
        {value.date_mode && <Tooltip content={l('removeDate')}>
            <Button type="button" variant="ghost" size="md" className="gap-1.5" aria-label={l('removeDate')}
                onClick={() => onChange({ date_mode: null, start_date: null, end_date: null })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />{l('removeDate')}
            </Button>
        </Tooltip>}
    </div>;
}

/** Formatted date and "view on the timeline" link shown on the card itself,
    outside the (collapsible) detail panel. */
export function ActionDateSummary({ action, locale }: { action: Action; locale: string }) {
    const l = (key: string) => visualLabel(locale, key);
    if (!action.date_mode || !(action.start_date || action.end_date)) return null;
    const display = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(locale);
    const label = action.date_mode === 'point'
        ? (action.start_date ? display(action.start_date) : null)
        : `${action.start_date ? display(action.start_date) : l('openStart')} → ${action.end_date ? display(action.end_date) : l('openEnd')}`;
    if (!label) return null;
    return <p className="mt-2 text-sm text-slate-600">
        {label} · <Link className="underline hover:text-indigo-700" href={`/profilo/timeline?item=action-${action.id}`}>{l('viewOnTimeline')}</Link>
    </p>;
}
