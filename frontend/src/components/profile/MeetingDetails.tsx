'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { classMeetingText, type ClassMeetingTextKey } from '@/lib/i18n-class-meetings';
import { meetingWhen, parseMeetings, type ClassMeeting } from '@/lib/class-meetings';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

/**
 * #175: when, where or the link of a class or group meeting, and the student's
 * own attendance mark from the start of the meeting.
 */
export function MeetingDetails({ lang, meeting, attended, onChanged, showTitle = false }: {
    lang: string; meeting: ClassMeeting; attended: boolean; onChanged: () => void | Promise<void>; showTitle?: boolean;
}) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const cancelled = meeting.status === 'cancelled';
    const started = new Date(meeting.starts_at).getTime() <= Date.now();
    const toggle = async () => {
        setBusy(true);
        setFailed(false);
        try {
            const response = await apiFetch(`/api/user/meetings/${meeting.id}/attendance`, { method: attended ? 'DELETE' : 'POST' });
            if (!response.ok) throw new Error('attendance');
            await onChanged();
        } catch { setFailed(true); } finally { setBusy(false); }
    };
    return <div className="space-y-1 text-sm" data-testid="meeting-details">
        {showTitle && <p className="font-semibold text-slate-800">{meeting.title}{meeting.group_name ? ` · ${meeting.group_name}` : ''}</p>}
        <p className={cancelled ? 'text-slate-500 line-through' : 'text-slate-700'}>
            <time dateTime={meeting.starts_at}>{meetingWhen(meeting, lang)}</time>{` · ${m(meeting.mode)}`}{meeting.place ? ` · ${meeting.place}` : ''}
        </p>
        {cancelled && <p className="text-xs font-medium text-slate-600">{m('cancelled')}</p>}
        {!cancelled && meeting.link && <a href={meeting.link} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />{m('openLink')}</a>}
        {meeting.description && <p className="whitespace-pre-wrap text-xs text-slate-600">{meeting.description}</p>}
        {!cancelled && (started
            ? <div className="flex flex-wrap items-center gap-2">
                {attended && <span role="status" className="text-xs font-medium text-emerald-700">{m('attendedDone')}</span>}
                <Button variant={attended ? 'ghost' : 'secondary'} size="sm" disabled={busy} onClick={() => void toggle()}>
                    {attended ? m('undoAttended') : m('attended')}</Button>
            </div>
            : <p className="text-xs text-slate-500">{m('notStarted')}</p>)}
        {failed && <p role="alert" className="text-xs font-medium text-red-600">{m('error')}</p>}
    </div>;
}

/** The meetings of the student's classes or groups, shown on the timeline. */
export function StudentMeetings({ lang }: { lang: string }) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [meetings, setMeetings] = useState<ClassMeeting[] | null>(null);
    const [failed, setFailed] = useState(false);
    const load = useCallback(async () => {
        try {
            const response = await apiFetch('/api/user/meetings');
            if (!response.ok) throw new Error('meetings');
            setMeetings(parseMeetings(await response.json()));
            setFailed(false);
        } catch { setFailed(true); }
    }, []);
    useEffect(() => { void load(); }, [load]);
    // Students without classes see nothing here; their timeline is unchanged.
    if (!failed && (!meetings || meetings.length === 0)) return null;
    return <section aria-label={m('timelineTitle')} className="glass-panel space-y-3 p-4">
        <h2 className="font-semibold text-slate-900">{m('timelineTitle')}</h2>
        {failed && <Callout variant="danger">{m('loadError')} <Button variant="secondary" size="sm" onClick={() => void load()}>{m('retry')}</Button></Callout>}
        <ul className="space-y-3">
            {(meetings ?? []).map(row => <li key={row.id} className="rounded-md border border-slate-200 bg-white p-3">
                <MeetingDetails lang={lang} meeting={row} attended={Boolean(row.attended)} onChanged={load} showTitle />
            </li>)}
        </ul>
    </section>;
}
