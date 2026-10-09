'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { assignmentText } from '@/lib/i18n-assignments';
import { learningText } from '@/lib/i18n-assignment-work';
import { Button } from '@/components/ui/Button';

// #143: every assignment is anchored to a published catalog goal; strategies and
// readings can only travel with it as optional attachments. Creation lives on
// /docente/assegnazioni, not on the catalog pages.
type Group = { id: number; name: string; participants: { username: string; name: string }[] };
type GoalEntry = { id: number; group_id: number | null; status: string; data: { title: string } };
type StrategyRow = { id: number; slug: string; name_it?: string | null; status: string; is_active: boolean };
type ReadingRow = { id: number; title: string; status: string; is_active: boolean };
type AttachmentOption = { kind: 'strategy' | 'reading'; id: number; title: string };
const input = 'w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm';

// TF6 (#153): the path builder opens the same dialog for its class only. A fixed
// class delivers to the whole class, the only kind a path step can reference.
type Created = { id: number };
export function AssignmentDialog({ close, saved, classId }: { close: () => void; saved: (created: Created) => void; classId?: number }) {
    const { lang } = useI18n(); const l = (key: Parameters<typeof assignmentText>[1]) => assignmentText(lang, key);
    const dialog = useRef<HTMLDialogElement>(null); const heading = useId();
    const [groups, setGroups] = useState<Group[]>([]); const [goals, setGoals] = useState<GoalEntry[]>([]);
    const [attachments, setAttachments] = useState<AttachmentOption[]>([]);
    const [groupId, setGroupId] = useState(classId ? String(classId) : ''); const [goalId, setGoalId] = useState('');
    const [selectedAttachments, setSelectedAttachments] = useState<string[]>([]);
    const [recipient, setRecipient] = useState(''); const [instructions, setInstructions] = useState('');
    const [intent, setIntent] = useState('proposal'); const [dueDate, setDueDate] = useState(''); const [responsePrompt, setResponsePrompt] = useState('');
    const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState(false);
    const request = useRef<{ body: string; id: string } | null>(null);
    const group = groups.find(row => String(row.id) === groupId);
    const visibleGoals = goals.filter(row => !group || row.group_id == null || row.group_id === group.id);
    const load = useCallback(async () => {
        setLoading(true); setFailed(false);
        try {
            const [targets, catalog, strategies, readings] = await Promise.all([
                apiFetch('/api/teacher/assignment-targets'),
                apiFetch('/api/teacher/goal-catalog'),
                apiFetch('/api/admin/certified-strategies'),
                apiFetch('/api/admin/certified-readings'),
            ]);
            if (!targets.ok || !catalog.ok || !strategies.ok || !readings.ok) throw new Error('unavailable');
            const rows: Group[] = await targets.json();
            const catalogRows: GoalEntry[] = await catalog.json();
            const strategyRows: StrategyRow[] = await strategies.json();
            const readingRows: ReadingRow[] = await readings.json();
            setGroups(rows);
            setGoals(catalogRows.filter(row => row.status === 'published'));
            setAttachments([
                ...strategyRows.filter(row => row.status === 'certified' && row.is_active)
                    .map(row => ({ kind: 'strategy' as const, id: row.id, title: row.name_it || row.slug })),
                ...readingRows.filter(row => row.status === 'certified' && row.is_active)
                    .map(row => ({ kind: 'reading' as const, id: row.id, title: row.title })),
            ]);
        } catch { setFailed(true); } finally { setLoading(false); }
    }, []);
    useEffect(() => { dialog.current?.showModal(); void load(); }, [load]);
    return <dialog ref={dialog} aria-labelledby={heading} onClose={close} onCancel={event => { if (busy) event.preventDefault(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/40">
        <h2 id={heading} className="mb-4 break-words text-xl font-bold">{l('newAssignment')}</h2>
        {loading && <p role="status">{l('loading')}</p>}
        {failed && <p role="alert" className="mb-3 text-sm text-red-600">{l('error')} <button type="button" onClick={() => void load()} className="underline">{l('retry')}</button></p>}
        {!loading && !failed && !groups.length && <p>{l('emptyTargets')}</p>}
        <form onSubmit={async event => {
            event.preventDefault(); if (!group || !goalId || busy) return;
            const body = { source_kind: 'goal', source_id: Number(goalId), group_id: group.id, recipient_username: recipient || null, instructions, language: lang,
                attachments: selectedAttachments.map(value => { const [source_kind, id] = value.split(':'); return { source_kind, source_id: Number(id) }; }),
                intent, due_date: dueDate || null, response_prompt: responsePrompt };
            const signature = JSON.stringify(body);
            if (request.current?.body !== signature) request.current = { body: signature, id: crypto.randomUUID() };
            setBusy(true); setFailed(false);
            try {
                const res = await apiFetch('/api/teacher/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, request_id: request.current.id }) });
                if (!res.ok) throw new Error('assignment failed');
                const created: Created = await res.json();
                window.dispatchEvent(new Event('teacher-assignments-changed')); saved(created); close();
            } catch { setFailed(true); } finally { setBusy(false); }
        }}>
            <fieldset disabled={busy || loading} className="space-y-4">
                <label className="block text-sm font-medium">{l('group')}<select aria-label={l('group')} autoFocus required disabled={classId !== undefined} className={input} value={groupId} onChange={e => { setGroupId(e.target.value); setRecipient(''); }}><option value="">{l('choose')}</option>{groups.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                <label className="block text-sm font-medium">{l('goal')}<select aria-label={l('goal')} required className={input} value={goalId} onChange={e => setGoalId(e.target.value)}><option value="">{l('chooseGoal')}</option>{visibleGoals.map(row => <option key={row.id} value={row.id}>{row.data.title}</option>)}</select></label>
                {group && classId === undefined && <>
                    <label className="block text-sm font-medium">{l('recipient')}<select aria-label={l('recipient')} className={input} value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">{l('all')} ({group.participants.length})</option>{group.participants.map(person => <option key={person.username} value={person.username}>{person.name} ({person.username})</option>)}</select></label>
                    <p className="text-sm text-slate-600">{l('recipients')}: {recipient ? 1 : group.participants.length}. {!recipient && l('current')}</p>
                </>}
                {group && classId !== undefined && <p className="text-sm text-slate-600">{l('recipients')}: {l('all')} ({group.participants.length}). {l('current')}</p>}
                <label className="block text-sm font-medium">{l('attachments')}<select multiple aria-label={l('attachments')} size={Math.min(6, Math.max(2, attachments.length))} className={input} value={selectedAttachments} onChange={e => setSelectedAttachments(Array.from(e.target.selectedOptions, option => option.value))}>{attachments.map(item => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{l(item.kind)} · {item.title}</option>)}</select></label>
                <label className="block text-sm font-medium">{l('instructions')}<textarea rows={3} maxLength={3000} className={input} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
                <label className="block text-sm font-medium">{learningText(lang, 'intent')}<select className={input} value={intent} onChange={e => setIntent(e.target.value)}>{(['proposal', 'requested'] as const).map(value => <option key={value} value={value}>{learningText(lang, value)}</option>)}</select></label>
                <label className="block text-sm font-medium">{learningText(lang, 'dueDate')}<input type="date" className={input} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
                <label className="block text-sm font-medium">{learningText(lang, 'responsePrompt')}<textarea rows={2} maxLength={1500} className={input} value={responsePrompt} onChange={e => setResponsePrompt(e.target.value)} /></label>
                <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={!group || !goalId || busy}>{l('send')}</Button>
                    <Button type="button" variant="secondary" onClick={close}>{l('cancel')}</Button>
                </div>
            </fieldset>
        </form>
    </dialog>;
}

export function NewAssignmentButton() {
    const { lang } = useI18n(); const [open, setOpen] = useState(false); const [sent, setSent] = useState(false);
    return <>
        <Button type="button" onClick={() => { setSent(false); setOpen(true); }}>{assignmentText(lang, 'newAssignment')}</Button>
        {sent && <span role="status" className="text-sm text-slate-600">{assignmentText(lang, 'saved')}</span>}
        {open && createPortal(<AssignmentDialog close={() => setOpen(false)} saved={() => setSent(true)} />, document.body)}
    </>;
}
