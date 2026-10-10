'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { classMeetingText, type ClassMeetingTextKey } from '@/lib/i18n-class-meetings';
import { fromLocalInput, meetingWhen, parseMeeting, parseMeetings, toLocalInput, type ClassMeeting } from '@/lib/class-meetings';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmInline } from '@/components/ui/ConfirmInline';

const input = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm';

interface Draft { title: string; description: string; startsAt: string; duration: string; mode: 'in_person' | 'online'; place: string; link: string }
const emptyDraft: Draft = { title: '', description: '', startsAt: '', duration: '60', mode: 'in_person', place: '', link: '' };

function draftOf(meeting: ClassMeeting): Draft {
    return { title: meeting.title, description: meeting.description ?? '', startsAt: toLocalInput(meeting.starts_at),
        duration: meeting.duration_minutes ? String(meeting.duration_minutes) : '', mode: meeting.mode,
        place: meeting.place ?? '', link: meeting.link ?? '' };
}

/**
 * #175: the meetings of one class or group. The teacher creates, edits and
 * cancels them here and picks one as a path step.
 */
export function ClassMeetingsManager({ lang, groupId, usedIds, onAdd, addLabel }: {
    lang: string; groupId: number; usedIds: number[]; onAdd: (meeting: ClassMeeting) => void; addLabel: string;
}) {
    const m = (key: ClassMeetingTextKey) => classMeetingText(lang, key);
    const [meetings, setMeetings] = useState<ClassMeeting[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selected, setSelected] = useState('');
    const [editing, setEditing] = useState<ClassMeeting | 'new' | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<'error' | 'conflict' | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            const response = await apiFetch(`/api/teacher/groups/${groupId}/meetings`);
            if (!response.ok) throw new Error('meetings');
            setMeetings(parseMeetings(await response.json()));
            setLoadFailed(false);
        } catch { setLoadFailed(true); }
    }, [groupId]);
    useEffect(() => { void load(); }, [load]);

    const open = (target: ClassMeeting | 'new') => {
        setEditing(target);
        setDraft(target === 'new' ? emptyDraft : draftOf(target));
        setFailure(null);
    };

    const save = async () => {
        const startsAt = fromLocalInput(draft.startsAt);
        if (!startsAt || !draft.title.trim()) { setFailure('error'); return; }
        setBusy(true);
        setFailure(null);
        const body = { title: draft.title.trim(), description: draft.description.trim() || null, starts_at: startsAt,
            duration_minutes: draft.duration ? Number(draft.duration) : null, mode: draft.mode,
            place: draft.mode === 'in_person' ? draft.place.trim() || null : null,
            link: draft.mode === 'online' ? draft.link.trim() || null : null };
        try {
            const response = editing === 'new'
                ? await apiFetch(`/api/teacher/groups/${groupId}/meetings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                : await apiFetch(`/api/teacher/meetings/${(editing as ClassMeeting).id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, revision: (editing as ClassMeeting).revision }) });
            if (!response.ok) { setFailure(response.status === 409 ? 'conflict' : 'error'); return; }
            const saved = parseMeeting(await response.json());
            await load();
            if (saved && editing === 'new') setSelected(String(saved.id));
            setEditing(null);
        } catch { setFailure('error'); } finally { setBusy(false); }
    };

    const cancelMeeting = async (meeting: ClassMeeting) => {
        setBusy(true);
        setFailure(null);
        try {
            const response = await apiFetch(`/api/teacher/meetings/${meeting.id}/cancel`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: meeting.revision }) });
            if (!response.ok) { setFailure(response.status === 409 ? 'conflict' : 'error'); return; }
            setConfirmCancel(null);
            await load();
        } catch { setFailure('error'); } finally { setBusy(false); }
    };

    const selectable = meetings.filter(row => row.status === 'scheduled' && !usedIds.includes(row.id));
    return <div className="space-y-3" data-testid="class-meetings">
        {loadFailed && <Callout variant="danger">{m('loadError')} <Button variant="secondary" onClick={() => void load()}>{m('retry')}</Button></Callout>}
        {!loadFailed && !meetings.length && <p className="text-sm text-slate-600">{m('empty')}</p>}
        <div className="flex flex-wrap items-end gap-2">
            <label className="block w-full text-sm sm:w-auto">{m('meeting')}
                <select value={selected} onChange={event => setSelected(event.target.value)} className={`${input} sm:w-auto`}>
                    <option value="">{m('choose')}</option>
                    {selectable.map(row => <option key={row.id} value={row.id}>{`${row.title} · ${meetingWhen(row, lang)}`}</option>)}
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
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">{m('startsAt')}
                    <input type="datetime-local" className={input} value={draft.startsAt} onChange={event => setDraft({ ...draft, startsAt: event.target.value })} /></label>
                <label className="block text-sm">{m('duration')}
                    <input type="number" min={5} max={600} className={input} value={draft.duration} onChange={event => setDraft({ ...draft, duration: event.target.value })} /></label>
            </div>
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
                <Button disabled={!draft.title.trim() || !draft.startsAt || (draft.mode === 'in_person' ? !draft.place.trim() : !draft.link.trim())}
                    onClick={() => void save()}>{m('save')}</Button>
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
                <p className="text-slate-600">{`${meetingWhen(row, lang)} · ${m(row.mode)} · ${row.place ?? row.link ?? ''}`}</p>
                {/* Attendance means something only once a scheduled meeting has started. */}
                {row.status === 'scheduled' && new Date(row.starts_at).getTime() <= Date.now()
                    && <p className="text-xs text-slate-500">{`${row.attendance_count ?? 0} ${m('attendances')}`}</p>}
                {confirmCancel === row.id && <ConfirmInline question={m('cancelConfirm')} busy={busy}
                    onConfirm={() => void cancelMeeting(row)} onCancel={() => setConfirmCancel(null)} />}
            </li>)}
        </ul>}
    </div>;
}
