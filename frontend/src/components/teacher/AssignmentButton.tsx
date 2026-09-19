'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { assignmentText } from '@/lib/i18n-assignments';

type Source = { kind: 'goal' | 'strategy' | 'reading'; id: number; title: string; groupId?: number | null };
type Group = { id: number; name: string; participants: { username: string; name: string }[] };
const input = 'w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm';

function AssignmentDialog({ source, close, saved }: { source: Source; close: () => void; saved: () => void }) {
    const { lang } = useI18n(); const l = (key: Parameters<typeof assignmentText>[1]) => assignmentText(lang, key);
    const dialog = useRef<HTMLDialogElement>(null); const heading = useId();
    const [groups, setGroups] = useState<Group[]>([]); const [groupId, setGroupId] = useState('');
    const [recipient, setRecipient] = useState(''); const [instructions, setInstructions] = useState('');
    const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState(false);
    const request = useRef<{ body: string; id: string } | null>(null);
    const group = groups.find(row => String(row.id) === groupId);
    const load = useCallback(async () => {
        setLoading(true); setFailed(false);
        try {
            const res = await apiFetch('/api/teacher/assignment-targets');
            if (!res.ok) throw new Error('targets unavailable');
            const rows: Group[] = await res.json();
            setGroups(rows.filter(row => row.participants.length && (!source.groupId || row.id === source.groupId)));
        } catch { setFailed(true); } finally { setLoading(false); }
    }, [source.groupId]);
    useEffect(() => { dialog.current?.showModal(); void load(); }, [load]);
    return <dialog ref={dialog} aria-labelledby={heading} onClose={close} onCancel={event => { if (busy) event.preventDefault(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/40">
        <h2 id={heading} className="mb-4 break-words text-xl font-bold">{l('assign')}: {source.title}</h2>
        {loading && <p role="status">{l('loading')}</p>}
        {failed && <p role="alert" className="mb-3 text-sm text-red-600">{l('error')} <button type="button" onClick={() => void load()} className="underline">{l('retry')}</button></p>}
        {!loading && !failed && !groups.length && <p>{l('emptyTargets')}</p>}
        <form onSubmit={async event => {
            event.preventDefault(); if (!group || busy) return;
            const body = { source_kind: source.kind, source_id: source.id, group_id: group.id, recipient_username: recipient || null, instructions, language: lang };
            const signature = JSON.stringify(body);
            if (request.current?.body !== signature) request.current = { body: signature, id: crypto.randomUUID() };
            setBusy(true); setFailed(false);
            try {
                const res = await apiFetch('/api/teacher/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, request_id: request.current.id }) });
                if (!res.ok) throw new Error('assignment failed');
                window.dispatchEvent(new Event('teacher-assignments-changed')); saved(); close();
            } catch { setFailed(true); } finally { setBusy(false); }
        }}>
            <fieldset disabled={busy || loading} className="space-y-4">
                <label className="block text-sm font-medium">{l('group')}<select aria-label={l('group')} autoFocus required className={input} value={groupId} onChange={e => { setGroupId(e.target.value); setRecipient(''); }}><option value="">{l('choose')}</option>{groups.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                {group && <>
                    <label className="block text-sm font-medium">{l('recipient')}<select aria-label={l('recipient')} className={input} value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">{l('all')} ({group.participants.length})</option>{group.participants.map(person => <option key={person.username} value={person.username}>{person.name} ({person.username})</option>)}</select></label>
                    <p className="text-sm text-slate-600">{l('recipients')}: {recipient ? 1 : group.participants.length}. {l('current')}</p>
                </>}
                <label className="block text-sm font-medium">{l('instructions')}<textarea rows={3} maxLength={3000} className={input} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
                <div className="flex flex-wrap gap-3">
                    <button disabled={!group || busy} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{l('send')}</button>
                    <button type="button" onClick={close} className="rounded-md border border-slate-300 px-4 py-2 text-sm">{l('cancel')}</button>
                </div>
            </fieldset>
        </form>
    </dialog>;
}

export function AssignmentButton(source: Source) {
    const { lang } = useI18n(); const [open, setOpen] = useState(false); const [sent, setSent] = useState(false);
    return <>
        <button type="button" onClick={() => { setSent(false); setOpen(true); }} className="rounded-md border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">{assignmentText(lang, 'assign')}</button>
        {sent && <span role="status" className="text-sm text-slate-600">{assignmentText(lang, 'saved')}</span>}
        {open && createPortal(<AssignmentDialog source={source} close={() => setOpen(false)} saved={() => setSent(true)} />, document.body)}
    </>;
}
