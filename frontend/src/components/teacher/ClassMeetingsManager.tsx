'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { classMeetingText, type ClassMeetingTextKey } from '@/lib/i18n-class-meetings';
import { fromLocalInput, meetingHost, meetingWhen, parseMeeting, parseMeetings, toLocalInput, type ClassMeeting, type MeetingSlot } from '@/lib/class-meetings';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmInline } from '@/components/ui/ConfirmInline';

const input = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm';
const select = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto';

type HostKind = ClassMeeting['host_kind'];
interface Draft {
    title: string; description: string; kind: ClassMeeting['kind']; startsAt: string; duration: string;
    mode: 'in_person' | 'online'; place: string; link: string;
    hostKind: HostKind; referralId: string; hostName: string; hostRole: string;
}
const emptyDraft: Draft = { title: '', description: '', kind: 'group', startsAt: '', duration: '60', mode: 'in_person', place: '', link: '',
    hostKind: 'teacher', referralId: '', hostName: '', hostRole: '' };
interface Referent { id: number; role: string; name: string | null }

function draftOf(meeting: ClassMeeting): Draft {
    return { title: meeting.title, description: meeting.description ?? '', kind: meeting.kind,
        startsAt: meeting.starts_at ? toLocalInput(meeting.starts_at) : '',
        duration: meeting.duration_minutes ? String(meeting.duration_minutes) : '', mode: meeting.mode,
        place: meeting.place ?? '', link: meeting.link ?? '', hostKind: meeting.host_kind,
        referralId: meeting.referral_id ? String(meeting.referral_id) : '',
        hostName: meeting.host_kind === 'expert' ? meeting.host_name ?? '' : '',
        hostRole: meeting.host_kind === 'expert' ? meeting.host_role ?? '' : '' };
}

/**
 * #175/#176: the meetings of one class or group. The teacher creates, edits and
 * cancels them here, manages the slots and bookings of individual meetings and
 * picks one as a path step.
 */
export function ClassMeetingsManager({ lang, groupId, usedIds, onAdd, addLabel, kindFilter }: {
    lang: string; groupId: number; usedIds: number[]; onAdd: (meeting: ClassMeeting) => void; addLabel: string;
    /** #177: a follow-up offers only class debriefings or only individual appointments. */
    kindFilter?: ClassMeeting['kind'];
}) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [meetings, setMeetings] = useState<ClassMeeting[]>([]);
    const [referents, setReferents] = useState<Referent[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selected, setSelected] = useState('');
    const [editing, setEditing] = useState<ClassMeeting | 'new' | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<'error' | 'conflict' | 'slotTaken' | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            const [response, people] = await Promise.all([
                apiFetch(`/api/teacher/groups/${groupId}/meetings`),
                apiFetch(`/api/teacher/groups/${groupId}/meeting-referents`),
            ]);
            if (!response.ok) throw new Error('meetings');
            setMeetings(parseMeetings(await response.json()));
            if (people.ok) setReferents(await people.json() as Referent[]);
            setLoadFailed(false);
        } catch { setLoadFailed(true); }
    }, [groupId]);
    useEffect(() => { void load(); }, [load]);

    const open = (target: ClassMeeting | 'new') => {
        setEditing(target);
        setDraft(target === 'new' ? { ...emptyDraft, kind: kindFilter ?? 'group' } : draftOf(target));
        setFailure(null);
    };

    // Every write returns the meeting; failures keep the form open with a message.
    const send = async (path: string, method: string, body?: object): Promise<boolean> => {
        setBusy(true);
        setFailure(null);
        try {
            const response = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined });
            if (!response.ok) {
                const detail = (await response.json().catch(() => null))?.detail;
                setFailure(detail === 'slot_taken' ? 'slotTaken' : response.status === 409 ? 'conflict' : 'error');
                return false;
            }
            const saved = parseMeeting(await response.json());
            await load();
            if (saved && editing === 'new') setSelected(String(saved.id));
            return true;
        } catch { setFailure('error'); return false; } finally { setBusy(false); }
    };

    const save = async () => {
        const startsAt = draft.kind === 'group' ? fromLocalInput(draft.startsAt) : null;
        if ((draft.kind === 'group' && !startsAt) || !draft.title.trim()) { setFailure('error'); return; }
        const body = { title: draft.title.trim(), description: draft.description.trim() || null, kind: draft.kind, starts_at: startsAt,
            duration_minutes: draft.kind === 'group' && draft.duration ? Number(draft.duration) : null, mode: draft.mode,
            place: draft.mode === 'in_person' ? draft.place.trim() || null : null,
            link: draft.mode === 'online' ? draft.link.trim() || null : null,
            host_kind: draft.hostKind, referral_id: draft.hostKind === 'referent' ? Number(draft.referralId) || null : null,
            host_name: draft.hostKind === 'expert' ? draft.hostName.trim() || null : null,
            host_role: draft.hostKind === 'expert' ? draft.hostRole.trim() || null : null };
        const done = editing === 'new'
            ? await send(`/api/teacher/groups/${groupId}/meetings`, 'POST', body)
            : await send(`/api/teacher/meetings/${(editing as ClassMeeting).id}`, 'PUT', { ...body, revision: (editing as ClassMeeting).revision });
        if (done) setEditing(null);
    };

    const ready = draft.title.trim() && (draft.kind === 'individual' || draft.startsAt)
        && (draft.mode === 'in_person' ? draft.place.trim() : draft.link.trim())
        && (draft.hostKind !== 'referent' || draft.referralId) && (draft.hostKind !== 'expert' || draft.hostName.trim());
    const selectable = meetings.filter(row => row.status === 'scheduled' && !usedIds.includes(row.id)
        && (!kindFilter || row.kind === kindFilter));
    const label = (row: ClassMeeting) => row.kind === 'individual' ? `${row.title} · ${m('individual')}` : `${row.title} · ${meetingWhen(row, lang)}`;
    return <div className="space-y-3" data-testid="class-meetings">
        {loadFailed && <Callout variant="danger">{m('loadError')} <Button variant="secondary" onClick={() => void load()}>{m('retry')}</Button></Callout>}
        {!loadFailed && !meetings.length && <p className="text-sm text-slate-600">{m('empty')}</p>}
        <div className="flex flex-wrap items-end gap-2">
            <label className="block w-full text-sm sm:w-auto">{m('meeting')}
                <select value={selected} onChange={event => setSelected(event.target.value)} className={`${input} sm:w-auto`}>
                    <option value="">{m('choose')}</option>
                    {selectable.map(row => <option key={row.id} value={row.id}>{label(row)}</option>)}
                </select>
            </label>
            <Button variant="secondary" disabled={busy || !selected} onClick={() => {
                const meeting = meetings.find(row => row.id === Number(selected));
                if (meeting) onAdd(meeting);
                setSelected('');
            }}><Plus className="h-4 w-4" aria-hidden />{addLabel}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => open('new')}>{m('newMeeting')}</Button>
        </div>
        <p className="text-sm text-slate-600">{m('rule')}</p>

        {editing && <fieldset disabled={busy} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
            <legend className="px-1 text-sm font-semibold">{editing === 'new' ? m('newMeeting') : `${m('edit')} · ${editing.title}`}</legend>
            <label className="block text-sm">{m('topic')}
                <input className={input} maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            {/* The kind is chosen once: group meetings have a date, individual ones slots. */}
            {editing === 'new' && !kindFilter && <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-1">{m('kind')}</legend>
                {(['group', 'individual'] as const).map(kind => <label key={kind} className="flex min-h-[44px] items-center gap-2">
                    <input type="radio" name={`meeting-kind-${groupId}`} checked={draft.kind === kind} onChange={() => setDraft({ ...draft, kind })}
                        className="h-4 w-4 accent-indigo-600" />{m(kind)}</label>)}
            </fieldset>}
            <fieldset className="space-y-1 text-sm">
                <legend className="mb-1">{m('host')}</legend>
                <div className="flex flex-wrap gap-4">
                    {(['teacher', 'referent', 'expert'] as const).map(host => <label key={host} className="flex min-h-[44px] items-center gap-2">
                        <input type="radio" name={`meeting-host-${groupId}`} checked={draft.hostKind === host} onChange={() => setDraft({ ...draft, hostKind: host })}
                            className="h-4 w-4 accent-indigo-600" />{m(host)}</label>)}
                </div>
                {draft.hostKind === 'referent' && (referents.length === 0 ? <p className="text-slate-600">{m('noReferents')}</p>
                    : <label className="block">{m('referent')}
                        <select className={select} value={draft.referralId} onChange={event => setDraft({ ...draft, referralId: event.target.value })}>
                            <option value="">{m('chooseReferent')}</option>
                            {referents.map(row => <option key={row.id} value={row.id}>{row.name ? `${row.role} · ${row.name}` : row.role}</option>)}
                        </select></label>)}
                {draft.hostKind === 'expert' && <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">{m('expertName')}
                        <input className={input} maxLength={200} value={draft.hostName} onChange={event => setDraft({ ...draft, hostName: event.target.value })} /></label>
                    <label className="block">{m('expertRole')}
                        <input className={input} maxLength={200} value={draft.hostRole} onChange={event => setDraft({ ...draft, hostRole: event.target.value })} /></label>
                </div>}
                {draft.hostKind !== 'teacher' && <p className="text-xs text-slate-600">{m('inviteNote')}</p>}
            </fieldset>
            {draft.kind === 'group' && <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">{m('startsAt')}
                    <input type="datetime-local" className={input} value={draft.startsAt} onChange={event => setDraft({ ...draft, startsAt: event.target.value })} /></label>
                <label className="block text-sm">{m('duration')}
                    <input type="number" min={5} max={600} className={input} value={draft.duration} onChange={event => setDraft({ ...draft, duration: event.target.value })} /></label>
            </div>}
            <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-1">{m('mode')}</legend>
                {(['in_person', 'online'] as const).map(mode => <label key={mode} className="flex min-h-[44px] items-center gap-2">
                    <input type="radio" name={`meeting-mode-${groupId}`} checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })}
                        className="h-4 w-4 accent-indigo-600" />{m(mode)}</label>)}
            </fieldset>
            {draft.mode === 'in_person'
                ? <label className="block text-sm">{m('place')}
                    <input className={input} maxLength={300} value={draft.place} onChange={event => setDraft({ ...draft, place: event.target.value })} /></label>
                : <label className="block text-sm">{m('link')}
                    <input type="url" className={input} maxLength={500} placeholder="https://" value={draft.link} onChange={event => setDraft({ ...draft, link: event.target.value })} /></label>}
            <label className="block text-sm">{m('description')}
                <textarea className={input} rows={2} maxLength={3000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
            <div className="flex flex-wrap gap-2">
                <Button disabled={!ready} onClick={() => void save()}>{m('save')}</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>{m('discard')}</Button>
            </div>
        </fieldset>}
        {failure && <p role="alert" className="text-sm font-medium text-red-600">{m(failure)}</p>}

        {meetings.length > 0 && <ul className="space-y-2">
            {meetings.map(row => <li key={row.id} className="space-y-1 rounded-md border border-slate-200 bg-white p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 basis-full break-words font-semibold text-slate-800 sm:basis-auto">
                        {row.title}{row.status === 'cancelled' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{m('cancelled')}</span>}
                    </p>
                    {row.status === 'scheduled' && <div className="flex gap-1">
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => open(row)}>{m('edit')}</Button>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmCancel(row.id)}>{m('cancelMeeting')}</Button>
                    </div>}
                </div>
                <p className="text-slate-600">{[row.kind === 'individual' ? m('individual') : meetingWhen(row, lang), m(row.mode), row.place ?? row.link,
                    meetingHost(row) ? `${m('with')} ${meetingHost(row)}` : null].filter(Boolean).join(' · ')}</p>
                {/* Attendance means something only once a scheduled meeting has started. */}
                {row.status === 'scheduled' && (row.kind === 'individual' || (row.starts_at && new Date(row.starts_at).getTime() <= Date.now()))
                    && <p className="text-xs text-slate-500">{`${row.attendance_count ?? 0} ${m('attendances')}`}</p>}
                {row.kind === 'individual' && row.status === 'scheduled'
                    && <SlotsEditor lang={lang} meeting={row} busy={busy} send={send} />}
                {confirmCancel === row.id && <ConfirmInline question={m('cancelConfirm')} busy={busy}
                    onConfirm={() => void send(`/api/teacher/meetings/${row.id}/cancel`, 'POST', { revision: row.revision }).then(done => { if (done) setConfirmCancel(null); })}
                    onCancel={() => setConfirmCancel(null)} />}
            </li>)}
        </ul>}
    </div>;
}

/** #176: the slots of an individual meeting, with who booked each one. */
function SlotsEditor({ lang, meeting, busy, send }: {
    lang: string; meeting: ClassMeeting; busy: boolean; send: (path: string, method: string, body?: object) => Promise<boolean>;
}) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [startsAt, setStartsAt] = useState('');
    const [duration, setDuration] = useState('15');
    const slots = (meeting.slots ?? []).filter(slot => slot.status !== 'cancelled');
    const free = (except: MeetingSlot) => slots.filter(slot => slot.id !== except.id && !slot.booking && new Date(slot.starts_at).getTime() > Date.now());
    return <div className="space-y-2 border-t border-slate-100 pt-2" data-testid="meeting-slots">
        <p className="text-xs font-semibold text-slate-700">{m('slots')}</p>
        {!slots.length && <p className="text-xs text-slate-600">{m('noSlots')}</p>}
        <ul className="space-y-1">
            {slots.map(slot => <li key={slot.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-100 p-1.5">
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <time dateTime={slot.starts_at}>{meetingWhen(slot, lang)}</time>{' · '}
                    {slot.booking ? <strong>{slot.booking.name}</strong> : <span className="text-slate-500">{m('free')}</span>}
                </span>
                {slot.booking && free(slot).length > 0 && <label className="text-xs"><span className="sr-only">{m('moveTo')}</span>
                    <select className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" value="" disabled={busy}
                        onChange={event => { if (event.target.value) void send(`/api/teacher/bookings/${slot.booking!.id}/move`, 'POST', { slot_id: Number(event.target.value) }); }}>
                        <option value="">{m('moveTo')}</option>
                        {free(slot).map(other => <option key={other.id} value={other.id}>{meetingWhen(other, lang)}</option>)}
                    </select></label>}
                {slot.booking && <Button variant="ghost" size="sm" disabled={busy}
                    onClick={() => void send(`/api/teacher/bookings/${slot.booking!.id}/cancel`, 'POST')}>{m('cancelBooking')}</Button>}
                <Button variant="ghost" size="sm" disabled={busy}
                    onClick={() => void send(`/api/teacher/slots/${slot.id}/cancel`, 'POST', { revision: slot.revision ?? 1 })}>{m('cancelSlot')}</Button>
            </li>)}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
            <label className="block text-xs">{m('startsAt')}
                <input type="datetime-local" className={input} value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
            <label className="block w-28 text-xs">{m('duration')}
                <input type="number" min={5} max={600} className={input} value={duration} onChange={event => setDuration(event.target.value)} /></label>
            <Button variant="secondary" size="sm" disabled={busy || !fromLocalInput(startsAt)} onClick={() => {
                const start = fromLocalInput(startsAt);
                if (start) void send(`/api/teacher/meetings/${meeting.id}/slots`, 'POST', { starts_at: start, duration_minutes: duration ? Number(duration) : null })
                    .then(done => { if (done) setStartsAt(''); });
            }}><Plus className="h-4 w-4" aria-hidden />{m('addSlot')}</Button>
        </div>
    </div>;
}
