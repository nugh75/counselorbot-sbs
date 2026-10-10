'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { classMeetingText, type ClassMeetingTextKey } from '@/lib/i18n-class-meetings';
import { meetingHost, meetingWhen, parseMeetings, type ClassMeeting } from '@/lib/class-meetings';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

/**
 * #175/#176: when, where or the link of a class or group meeting, the booking of
 * an individual one, and the student's own attendance mark from the start.
 */
export function MeetingDetails({ lang, meeting, attended, onChanged, showTitle = false }: {
    lang: string; meeting: ClassMeeting; attended: boolean; onChanged: () => void | Promise<void>; showTitle?: boolean;
}) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<'error' | 'slotTaken' | null>(null);
    const [choice, setChoice] = useState('');
    const cancelled = meeting.status === 'cancelled';
    const individual = meeting.kind === 'individual';
    const slots = meeting.slots ?? [];
    const mine = slots.find(slot => slot.id === meeting.booking_slot_id) ?? null;
    const freeSlots = slots.filter(slot => slot.id !== meeting.booking_slot_id);
    // Attendance starts with the meeting, or with the student's own slot.
    const start = individual ? mine?.starts_at ?? null : meeting.starts_at;
    const started = start !== null && new Date(start).getTime() <= Date.now();
    const host = meetingHost(meeting);

    const call = async (path: string, method: string, body?: object) => {
        setBusy(true);
        setFailure(null);
        try {
            const response = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined });
            if (!response.ok) {
                const detail = (await response.json().catch(() => null))?.detail;
                setFailure(detail === 'slot_taken' || detail === 'slot_unavailable' ? 'slotTaken' : 'error');
            }
            setChoice('');
            await onChanged();
        } catch { setFailure('error'); } finally { setBusy(false); }
    };

    return <div className="space-y-1 text-sm" data-testid="meeting-details">
        {showTitle && <p className="font-semibold text-slate-800">{meeting.title}{meeting.group_name ? ` · ${meeting.group_name}` : ''}</p>}
        <p className={cancelled ? 'text-slate-500 line-through' : 'text-slate-700'}>
            {[individual ? (mine ? null : m('individual')) : null, m(meeting.mode), meeting.place].filter(Boolean).join(' · ')}
            {!individual && start && <>{' · '}<time dateTime={start}>{meetingWhen(meeting, lang)}</time></>}
        </p>
        {host && <p className="text-xs text-slate-600">{`${m('with')} ${host}`}</p>}
        {cancelled && <p className="text-xs font-medium text-slate-600">{m('cancelled')}</p>}
        {!cancelled && meeting.link && <a href={meeting.link} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />{m('openLink')}</a>}
        {meeting.description && <p className="whitespace-pre-wrap text-xs text-slate-600">{meeting.description}</p>}

        {!cancelled && individual && <div className="space-y-1" data-testid="meeting-booking">
            {meeting.booking_cancelled && <p role="status" className="text-xs font-medium text-amber-800">{m('bookingCancelled')}</p>}
            {mine && <p className="text-xs"><span className="font-semibold">{m('yourSlot')}: </span>
                <time dateTime={mine.starts_at}>{meetingWhen(mine, lang)}</time></p>}
            {freeSlots.length > 0 ? <div className="flex flex-wrap items-end gap-2">
                <label className="block text-xs"><span className="sr-only">{mine ? m('changeSlot') : m('book')}</span>
                    <select className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto" value={choice}
                        disabled={busy} onChange={event => setChoice(event.target.value)}>
                        <option value="">{m('chooseSlot')}</option>
                        {freeSlots.map(slot => <option key={slot.id} value={slot.id}>{meetingWhen(slot, lang)}</option>)}
                    </select></label>
                <Button variant="secondary" size="sm" disabled={busy || !choice}
                    onClick={() => void call(`/api/user/meetings/${meeting.id}/booking`, 'POST', { slot_id: Number(choice) })}>
                    {mine ? m('changeSlot') : m('book')}</Button>
            </div> : !mine && <p className="text-xs text-slate-600">{m('noFreeSlots')}</p>}
            {mine && !started && <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => void call(`/api/user/meetings/${meeting.id}/booking`, 'DELETE')}>{m('cancelBooking')}</Button>}
        </div>}

        {!cancelled && (started
            ? <div className="flex flex-wrap items-center gap-2">
                {attended && <span role="status" className="text-xs font-medium text-emerald-700">{m('attendedDone')}</span>}
                <Button variant={attended ? 'ghost' : 'secondary'} size="sm" disabled={busy}
                    onClick={() => void call(`/api/user/meetings/${meeting.id}/attendance`, attended ? 'DELETE' : 'POST')}>
                    {attended ? m('undoAttended') : m('attended')}</Button>
            </div>
            : <p className="text-xs text-slate-500">{individual && !mine ? m('bookFirst') : m('notStarted')}</p>)}
        {failure && <p role="alert" className="text-xs font-medium text-red-600">{m(failure)}</p>}
    </div>;
}

/** The meetings of the student's classes or groups, with booking and attendance. */
export function useStudentMeetings() {
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
    return { meetings, failed, load };
}

/** The meetings of the student's classes or groups, shown on the timeline. */
export function StudentMeetings({ lang }: { lang: string }) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const { meetings, failed, load } = useStudentMeetings();
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
