'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { classPathText } from '@/lib/i18n-class-paths';
import type { ResourceDraft } from './PathResourceDialog';
import { classMeetingText, type ClassMeetingTextKey } from '@/lib/i18n-class-meetings';
import { fromLocalInput, meetingHost, meetingWhen, parseMeeting, parseMeetings, toLocalInput, type AttendanceMode, type ClassMeeting, type MeetingSlot } from '@/lib/class-meetings';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { TeacherLoading } from './TeacherAccess';
import { parseClassGroups } from './class-group-types';

const input = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm';
const select = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto';

type HostKind = ClassMeeting['host_kind'];
interface Draft {
    title: string; description: string; kind: ClassMeeting['kind']; startsAt: string; duration: string;
    mode: 'in_person' | 'online'; place: string; link: string;
    hostKind: HostKind; referralId: string; hostName: string; hostRole: string; showOnTimeline: boolean;
    attendanceMode: AttendanceMode;
    /** #190: the other classes or groups, besides this one. */
    groupIds: number[];
}
const emptyDraft: Draft = { title: '', description: '', kind: 'group', startsAt: '', duration: '60', mode: 'in_person', place: '', link: '',
    hostKind: 'teacher', referralId: '', hostName: '', hostRole: '', showOnTimeline: true, attendanceMode: 'student', groupIds: [] };
interface Referent { id: number; role: string; name: string | null }

function draftOf(meeting: ClassMeeting): Draft {
    return { title: meeting.title, description: meeting.description ?? '', kind: meeting.kind,
        startsAt: meeting.starts_at ? toLocalInput(meeting.starts_at) : '',
        duration: meeting.duration_minutes ? String(meeting.duration_minutes) : '', mode: meeting.mode,
        place: meeting.place ?? '', link: meeting.link ?? '', hostKind: meeting.host_kind,
        referralId: meeting.referral_id ? String(meeting.referral_id) : '',
        hostName: meeting.host_kind === 'expert' ? meeting.host_name ?? '' : '',
        hostRole: meeting.host_kind === 'expert' ? meeting.host_role ?? '' : '', showOnTimeline: meeting.show_on_timeline !== false,
        attendanceMode: meeting.attendance_mode,
        groupIds: (meeting.group_ids ?? []).filter(id => id !== meeting.group_id) };
}

/**
 * #175/#176: the meetings of one class or group. The teacher creates, edits and
 * cancels them here, manages the slots and bookings of individual meetings and
 * picks one as a path step.
 */
export function ClassMeetingsManager({ lang, groupId, usedIds, onAdd, addLabel, kindFilter, initialMeetingId, onMeetingsChanged, onDraft }: {
    lang: string; groupId: number; usedIds?: number[];
    /** Absent on the dedicated meetings page (#195): there is no path to add a step to. */
    onAdd?: (meeting: ClassMeeting) => void; addLabel?: string;
    /** #177: a follow-up offers only class debriefings or only individual appointments. */
    kindFilter?: ClassMeeting['kind'];
    initialMeetingId?: number;
    onMeetingsChanged?: (meetings: ClassMeeting[]) => void;
    onDraft?: ResourceDraft;
}) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [meetings, setMeetings] = useState<ClassMeeting[]>([]);
    const [referents, setReferents] = useState<Referent[]>([]);
    const [otherGroups, setOtherGroups] = useState<{ id: number; name: string }[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selected, setSelected] = useState('');
    const [editing, setEditing] = useState<ClassMeeting | 'new' | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<'error' | 'conflict' | 'slotTaken' | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
    const [registerOf, setRegisterOf] = useState<number | null>(null);
    const [loaded, setLoaded] = useState(false);
    const initialOpened = useRef(false);
    const [slotDrafts, setSlotDrafts] = useState<Record<number, boolean>>({});
    const liveForm = useRef({dirty: false, busy: false});
    const liveSlots = useRef<Record<number, boolean>>({});
    const reportSlotDraft = useCallback((id: number, dirty: boolean) => {
        liveSlots.current = {...liveSlots.current, [id]: dirty};
        onDraft?.(liveForm.current.dirty || Object.values(liveSlots.current).some(Boolean), liveForm.current.busy);
        setSlotDrafts(previous => Boolean(previous[id]) === dirty ? previous : {...previous, [id]: dirty});
    }, [onDraft]);
    const original = editing === 'new' ? {...emptyDraft, kind: kindFilter ?? 'group'} : editing ? draftOf(editing) : null;
    const formDirty = original !== null && JSON.stringify(draft) !== JSON.stringify(original);
    const resourceDirty = formDirty || Object.values(slotDrafts).some(Boolean);
    useEffect(() => {
        liveForm.current = {dirty: formDirty, busy};
        onDraft?.(resourceDirty, busy);
    }, [formDirty, resourceDirty, busy, onDraft]);
    const changeDraft = (next: Draft) => {
        const dirty = original !== null && JSON.stringify(next) !== JSON.stringify(original);
        liveForm.current = {dirty, busy};
        onDraft?.(dirty || Object.values(liveSlots.current).some(Boolean), busy);
        setDraft(next);
    };


    const load = useCallback(async () => {
        try {
            const [response, people, groups] = await Promise.all([
                apiFetch(`/api/teacher/groups/${groupId}/meetings`),
                apiFetch(`/api/teacher/groups/${groupId}/meeting-referents`),
                apiFetch('/api/admin/groups'),
            ]);
            if (!response.ok) throw new Error('meetings');
            const rows = parseMeetings(await response.json());
            setMeetings(rows);
            onMeetingsChanged?.(rows);
            if (initialMeetingId !== undefined && !initialOpened.current) {
                const target = rows.find(row => row.id === initialMeetingId && row.status === 'scheduled');
                if (target) {
                    initialOpened.current = true;
                    setEditing(target); setDraft(draftOf(target)); setFailure(null);
                }
            }
            if (people.ok) setReferents(await people.json() as Referent[]);
            // Other active classes or groups the teacher manages can share a meeting (#190).
            if (groups.ok) setOtherGroups(parseClassGroups(await groups.json())
                .filter(row => row.is_active && row.id !== groupId).map(row => ({ id: row.id, name: row.name })));
            setLoadFailed(false);
            return rows;
        } catch { setLoadFailed(true); } finally { setLoaded(true); }
    }, [groupId, initialMeetingId, onMeetingsChanged]);
    useEffect(() => { void load(); }, [load]);

    const open = useCallback((target: ClassMeeting | 'new') => {
        if (onDraft && formDirty && !window.confirm(classPathText(lang, 'discard'))) return;
        setEditing(target);
        setDraft(target === 'new' ? { ...emptyDraft, kind: kindFilter ?? 'group' } : draftOf(target));
        setFailure(null);
    }, [formDirty, kindFilter, lang, onDraft]);

    const reloadEditing = async () => {
        if (formDirty && !window.confirm(classPathText(lang, 'discard'))) return;
        setBusy(true);
        try {
            const rows = await load();
            if (!rows) return;
            if (editing && editing !== 'new') {
                const latest = rows.find(row => row.id === editing.id);
                if (latest) { setEditing(latest); setDraft(draftOf(latest)); }
            }
            setFailure(null);
        } finally { setBusy(false); }
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
            host_role: draft.hostKind === 'expert' ? draft.hostRole.trim() || null : null, show_on_timeline: draft.showOnTimeline,
            attendance_mode: draft.attendanceMode, group_ids: draft.groupIds };
        const done = editing === 'new'
            ? await send(`/api/teacher/groups/${groupId}/meetings`, 'POST', body)
            : await send(`/api/teacher/meetings/${(editing as ClassMeeting).id}`, 'PUT', { ...body, revision: (editing as ClassMeeting).revision });
        if (done) setEditing(null);
    };

    const ready = draft.title.trim() && (draft.kind === 'individual' || draft.startsAt)
        && (draft.mode === 'in_person' ? draft.place.trim() : draft.link.trim())
        && (draft.hostKind !== 'referent' || draft.referralId) && (draft.hostKind !== 'expert' || draft.hostName.trim());
    const selectable = meetings.filter(row => row.status === 'scheduled' && !(usedIds ?? []).includes(row.id)
        && (!kindFilter || row.kind === kindFilter));
    const label = (row: ClassMeeting) => row.kind === 'individual' ? `${row.title} · ${m('individual')}` : `${row.title} · ${meetingWhen(row, lang)}`;
    if (initialMeetingId !== undefined && !loaded) return <TeacherLoading />;
    return <div className="space-y-3" data-testid="class-meetings">
        {initialMeetingId !== undefined && loaded && !meetings.some(row => row.id === initialMeetingId && row.status === 'scheduled')
            && <Callout variant="warning">{m('loadError')}</Callout>}
        {loadFailed && <Callout variant="danger">{m('loadError')} <Button variant="secondary" onClick={() => void load()}>{m('retry')}</Button></Callout>}
        {!loadFailed && !meetings.length && <p className="text-sm text-slate-600">{m('empty')}</p>}
        <div className="flex flex-wrap items-end gap-2">
            {onAdd && <>
            <label className="block w-full text-sm sm:w-auto">{m('meeting')}
                <select value={selected} onChange={event => setSelected(event.target.value)} className={`${input} sm:w-auto`}>
                    <option value="">{m('choose')}</option>
                    {selectable.map(row => <option key={row.id} value={row.id}>{label(row)}</option>)}
                </select>
            </label>
            <Button variant="secondary" disabled={busy || resourceDirty || !selectable.some(row => row.id === Number(selected))} onClick={() => {
                const meeting = selectable.find(row => row.id === Number(selected));
                if (meeting) onAdd(meeting);
                setSelected('');
            }}><Plus className="h-4 w-4" aria-hidden />{addLabel}</Button>
            </>}
            <Button variant={onAdd ? 'secondary' : 'primary'} disabled={busy} onClick={() => open('new')}>{m('newMeeting')}</Button>
        </div>
        <p className="text-sm text-slate-600">{m('rule')}</p>

        {editing && <fieldset disabled={busy} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
            <legend className="px-1 text-sm font-semibold">{editing === 'new' ? m('newMeeting') : `${m('edit')} · ${editing.title}`}</legend>
            <label className="block text-sm">{m('topic')}
                <input className={input} maxLength={200} value={draft.title} onChange={event => changeDraft({ ...draft, title: event.target.value })} /></label>
            {/* The kind is chosen once: group meetings have a date, individual ones slots. */}
            {editing === 'new' && !kindFilter && <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-1">{m('kind')}</legend>
                {(['group', 'individual'] as const).map(kind => <label key={kind} className="flex min-h-[44px] items-center gap-2">
                    <input type="radio" name={`meeting-kind-${groupId}`} checked={draft.kind === kind} onChange={() => changeDraft({ ...draft, kind })}
                        className="h-4 w-4 accent-indigo-600" />{m(kind)}</label>)}
            </fieldset>}
            <fieldset className="space-y-1 text-sm">
                <legend className="mb-1">{m('host')}</legend>
                <div className="flex flex-wrap gap-4">
                    {(['teacher', 'referent', 'expert'] as const).map(host => <label key={host} className="flex min-h-[44px] items-center gap-2">
                        <input type="radio" name={`meeting-host-${groupId}`} checked={draft.hostKind === host} onChange={() => changeDraft({ ...draft, hostKind: host })}
                            className="h-4 w-4 accent-indigo-600" />{m(host)}</label>)}
                </div>
                {draft.hostKind === 'referent' && (referents.length === 0 ? <p className="text-slate-600">{m('noReferents')}</p>
                    : <label className="block">{m('referent')}
                        <select className={select} value={draft.referralId} onChange={event => changeDraft({ ...draft, referralId: event.target.value })}>
                            <option value="">{m('chooseReferent')}</option>
                            {referents.map(row => <option key={row.id} value={row.id}>{row.name ? `${row.role} · ${row.name}` : row.role}</option>)}
                        </select></label>)}
                {draft.hostKind === 'expert' && <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">{m('expertName')}
                        <input className={input} maxLength={200} value={draft.hostName} onChange={event => changeDraft({ ...draft, hostName: event.target.value })} /></label>
                    <label className="block">{m('expertRole')}
                        <input className={input} maxLength={200} value={draft.hostRole} onChange={event => changeDraft({ ...draft, hostRole: event.target.value })} /></label>
                </div>}
                {draft.hostKind !== 'teacher' && <p className="text-xs text-slate-600">{m('inviteNote')}</p>}
            </fieldset>
            {draft.kind === 'group' && <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">{m('startsAt')}
                    <input type="datetime-local" className={input} value={draft.startsAt} onChange={event => changeDraft({ ...draft, startsAt: event.target.value })} /></label>
                <label className="block text-sm">{m('duration')}
                    <input type="number" min={5} max={600} className={input} value={draft.duration} onChange={event => changeDraft({ ...draft, duration: event.target.value })} /></label>
            </div>}
            <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-1">{m('mode')}</legend>
                {(['in_person', 'online'] as const).map(mode => <label key={mode} className="flex min-h-[44px] items-center gap-2">
                    <input type="radio" name={`meeting-mode-${groupId}`} checked={draft.mode === mode} onChange={() => changeDraft({ ...draft, mode })}
                        className="h-4 w-4 accent-indigo-600" />{m(mode)}</label>)}
            </fieldset>
            {draft.mode === 'in_person'
                ? <label className="block text-sm">{m('place')}
                    <input className={input} maxLength={300} value={draft.place} onChange={event => changeDraft({ ...draft, place: event.target.value })} /></label>
                : <label className="block text-sm">{m('link')}
                    <input type="url" className={input} maxLength={500} placeholder="https://" value={draft.link} onChange={event => changeDraft({ ...draft, link: event.target.value })} /></label>}
            {otherGroups.length > 0 && <fieldset className="space-y-1 text-sm">
                <legend className="mb-1">{m('alsoFor')}</legend>
                <div className="grid gap-x-4 sm:grid-cols-2">
                    {otherGroups.map(other => <label key={other.id} className="flex min-h-[44px] items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={draft.groupIds.includes(other.id)}
                            onChange={event => changeDraft({ ...draft, groupIds: event.target.checked ? [...draft.groupIds, other.id]
                                : draft.groupIds.filter(id => id !== other.id) })} />{other.name}</label>)}
                </div>
            </fieldset>}
            <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-1">{m('attendanceBy')}</legend>
                {(['student', 'teacher', 'both'] as const).map(mode => <label key={mode} className="flex min-h-[44px] items-center gap-2">
                    <input type="radio" name={`meeting-attendance-${groupId}`} checked={draft.attendanceMode === mode}
                        onChange={() => changeDraft({ ...draft, attendanceMode: mode })} className="h-4 w-4 accent-indigo-600" />{m(`attendance_${mode}`)}</label>)}
            </fieldset>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.showOnTimeline} onChange={event => changeDraft({ ...draft, showOnTimeline: event.target.checked })}
                    className="h-4 w-4 accent-indigo-600" />{m('showOnTimeline')}</label>
            <label className="block text-sm">{m('description')}
                <textarea className={input} rows={2} maxLength={3000} value={draft.description} onChange={event => changeDraft({ ...draft, description: event.target.value })} /></label>
            <div className="flex flex-wrap gap-2">
                <Button disabled={!ready} onClick={() => void save()}>{m('save')}</Button>
                <Button variant="ghost" onClick={() => {
                    if (!onDraft || !formDirty || window.confirm(classPathText(lang, 'discard'))) setEditing(null);
                }}>{m('discard')}</Button>
            </div>
        </fieldset>}
        {failure && <div role="alert" className="space-y-2 text-sm font-medium text-red-600">
            <p>{m(failure)}</p>
            {onDraft && failure === 'conflict' && <Button variant="secondary" disabled={busy} onClick={() => void reloadEditing()}>{classPathText(lang, 'reload')}</Button>}
        </div>}

        {meetings.length > 0 && <ul className="space-y-2">
            {meetings.map(row => <li key={row.id} className="space-y-1 rounded-md border border-slate-200 bg-white p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 basis-full break-words font-semibold text-slate-800 sm:basis-auto">
                        {row.title}{row.status === 'cancelled' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{m('cancelled')}</span>}
                    </p>
                    {row.status === 'scheduled' && <div className="flex flex-wrap gap-1">
                        {row.attendance_mode !== 'student' && <Button variant="secondary" size="sm" aria-expanded={registerOf === row.id}
                            onClick={() => setRegisterOf(registerOf === row.id ? null : row.id)}>{m(registerOf === row.id ? 'hideRegister' : 'register')}</Button>}
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => open(row)}>{m('edit')}</Button>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmCancel(row.id)}>{m('cancelMeeting')}</Button>
                    </div>}
                </div>
                <p className="text-slate-600">{[row.kind === 'individual' ? m('individual') : meetingWhen(row, lang), m(row.mode), row.place ?? row.link,
                    meetingHost(row) ? `${m('with')} ${meetingHost(row)}` : null].filter(Boolean).join(' · ')}</p>
                {/* Attendance means something only once a scheduled meeting has started. */}
                {row.status === 'scheduled' && (row.kind === 'individual' || (row.starts_at && new Date(row.starts_at).getTime() <= Date.now()))
                    && <p className="text-xs text-slate-500">{`${row.attendance_count ?? 0} ${m('attendances')}`}
                        {(row.group_ids?.length ?? 0) > 1 && ` (${(row.group_ids ?? []).map((id, index) =>
                            `${row.group_names?.[index] ?? id}: ${row.attendance_by_group?.[String(id)] ?? 0}`).join(' · ')})`}</p>}
                {(row.group_names?.length ?? 0) > 1 && <p className="text-xs text-slate-600">{`${m('forGroups')}: ${row.group_names!.join(', ')}`}</p>}
                <p className="text-xs text-slate-600">{`${m('attendanceBy')}: ${m(`attendance_${row.attendance_mode}`)}`}</p>
                {registerOf === row.id && row.status === 'scheduled' && row.attendance_mode !== 'student'
                    && <AttendanceRegister lang={lang} meeting={row} onChanged={async () => { await load(); }} />}
                {row.kind === 'individual' && row.status === 'scheduled'
                    && <SlotsEditor lang={lang} meeting={row} busy={busy} send={send} onDraftChange={onDraft ? reportSlotDraft : undefined} />}
                {confirmCancel === row.id && <ConfirmInline question={m('cancelConfirm')} busy={busy}
                    onConfirm={() => void send(`/api/teacher/meetings/${row.id}/cancel`, 'POST', { revision: row.revision }).then(done => { if (done) setConfirmCancel(null); })}
                    onCancel={() => setConfirmCancel(null)} />}
            </li>)}
        </ul>}
    </div>;
}

interface RegisterRow { username: string; name: string; attended: boolean; marked_by_teacher: boolean }

/** The teacher's attendance register: one checkbox per student of the meeting's classes. */
function AttendanceRegister({ lang, meeting, onChanged }: { lang: string; meeting: ClassMeeting; onChanged: () => Promise<void> }) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [rows, setRows] = useState<RegisterRow[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const load = useCallback(async () => {
        try {
            const response = await apiFetch(`/api/teacher/meetings/${meeting.id}/attendance`);
            if (!response.ok) throw new Error('register');
            setRows(((await response.json()) as { students: RegisterRow[] }).students);
            setFailed(false);
        } catch { setFailed(true); }
    }, [meeting.id]);
    useEffect(() => { void load(); }, [load]);
    const toggle = async (row: RegisterRow) => {
        setBusy(row.username);
        try {
            const response = await apiFetch(`/api/teacher/meetings/${meeting.id}/attendance/${encodeURIComponent(row.username)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attended: !row.attended }) });
            if (!response.ok) throw new Error('mark');
            await Promise.all([load(), onChanged()]);
        } catch { setFailed(true); } finally { setBusy(null); }
    };
    return <div className="space-y-1 border-t border-slate-100 pt-2" data-testid="meeting-register">
        <p className="text-xs font-semibold text-slate-700">{m('register')}</p>
        {failed && <p role="alert" className="text-xs font-medium text-red-600">{m('error')}</p>}
        {rows && !rows.length && <p className="text-xs text-slate-600">{m('registerEmpty')}</p>}
        {rows && rows.length > 0 && <ul className="grid gap-x-4 sm:grid-cols-2">
            {rows.map(row => <li key={row.username}>
                <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={row.attended} disabled={busy !== null}
                        onChange={() => void toggle(row)} />
                    <span className="min-w-0 break-words">{row.name}</span>
                    {row.attended && !row.marked_by_teacher && <span className="text-xs text-slate-500">({m('selfMarked')})</span>}
                </label>
            </li>)}
        </ul>}
    </div>;
}

/** #176: the slots of an individual meeting, with who booked each one. */
function SlotsEditor({ lang, meeting, busy, send, onDraftChange }: {
    lang: string; meeting: ClassMeeting; busy: boolean; send: (path: string, method: string, body?: object) => Promise<boolean>;
    onDraftChange?: (id: number, dirty: boolean) => void;
}) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [startsAt, setStartsAt] = useState('');
    const [duration, setDuration] = useState('15');
    useEffect(() => () => { onDraftChange?.(meeting.id, false); }, [meeting.id, onDraftChange]);
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
                <input type="datetime-local" disabled={busy} className={input} value={startsAt} onChange={event => { setStartsAt(event.target.value); onDraftChange?.(meeting.id, Boolean(event.target.value)); }} /></label>
            <label className="block w-28 text-xs">{m('duration')}
                <input type="number" disabled={busy} min={5} max={600} className={input} value={duration} onChange={event => setDuration(event.target.value)} /></label>
            <Button variant="secondary" size="sm" disabled={busy || !fromLocalInput(startsAt)} onClick={() => {
                const start = fromLocalInput(startsAt);
                if (start) void send(`/api/teacher/meetings/${meeting.id}/slots`, 'POST', { starts_at: start, duration_minutes: duration ? Number(duration) : null })
                    .then(done => { if (done) { setStartsAt(''); onDraftChange?.(meeting.id, false); } });
            }}><Plus className="h-4 w-4" aria-hidden />{m('addSlot')}</Button>
        </div>
    </div>;
}
