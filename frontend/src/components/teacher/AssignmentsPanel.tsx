'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { assignmentText } from '@/lib/i18n-assignments';
import { learningText } from '@/lib/i18n-assignment-work';
import { AssignmentWork, AssignmentSubmissions } from './AssignmentWork';

// F31: l'interfaccia è esportata per il blocco "Assegnazioni della classe"
// dentro la scheda gruppo di /docente/classi (GroupAssignments).
export interface Assignment {
    intent?: 'proposal' | 'requested'; due_date?: string | null; response_prompt?: string;
    id: number; author_name: string; group_name: string; source_kind: 'goal' | 'strategy' | 'reading';
    recipient_username?: string | null; recipient_count?: number; instructions: string; created_at: string; revoked_at: string | null;
    progress?: { planned: boolean; shared: boolean; feedback_available: boolean };
    snapshot: { title: string; description: string; details: string; creators?: string[]; year?: number; content_warning?: string; where_to_find?: string; source_reference?: string };
}

// F27 (audit, lotto 5A): la pagina mostra una lista breve con filtri per gruppo,
// tipo e stato; una sola scheda dettaglio aperta per volta. L'anteprima completa
// resta dentro il dettaglio aperto, non in sequenza per ogni assegnazione.
export function AssignmentsPanel({ teacher = false, showHeading = true }: { teacher?: boolean; showHeading?: boolean }) {
    const { lang } = useI18n(); const l = (key: Parameters<typeof assignmentText>[1]) => assignmentText(lang, key);
    const w = (key: Parameters<typeof learningText>[1]) => learningText(lang, key);
    const [rows, setRows] = useState<Assignment[]>([]); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState<number | null>(null);
    // F27: filtri gruppo, tipo, finalità (richiesta/proposta) e stato.
    const [groupFilter, setGroupFilter] = useState('');
    const [kindFilter, setKindFilter] = useState('');
    const [intentFilter, setIntentFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    // F27: lo studente apre un dettaglio alla volta. Un hash #assignment-N apre quella.
    // La vista docente resta sempre espansa per consultare subito invii, destinatari e riscontri.
    const [openId, setOpenId] = useState<number | null>(null);
    const toggle = (id: number) => setOpenId(current => current === id ? null : id);
    const load = useCallback(async () => {
        setLoading(true); setFailed(false);
        try { const res = await apiFetch(`/api/${teacher ? 'teacher' : 'user'}/assignments`); if (!res.ok) throw new Error('unavailable'); setRows(await res.json()); }
        catch { setFailed(true); } finally { setLoading(false); }
    }, [teacher]);
    useEffect(() => { void load(); if (teacher) window.addEventListener('teacher-assignments-changed', load); return () => window.removeEventListener('teacher-assignments-changed', load); }, [load, teacher]);
    // F27: un link diretto #assignment-N apre quel dettaglio anche se la lista cambia.
    useEffect(() => {
        const check = () => {
            const match = window.location.hash.match(/^#assignment-(\d+)$/);
            if (match) setOpenId(Number(match[1]));
        };
        check(); window.addEventListener('hashchange', check); return () => window.removeEventListener('hashchange', check);
    }, []);
    // F30: il collegamento dal gruppo porta ?group=Nome e preimposta il filtro.
    useEffect(() => {
        const group = new URLSearchParams(window.location.search).get('group');
        if (group) setGroupFilter(group);
    }, []);
    const groups = useMemo(() => [...new Set(rows.map(row => row.group_name))], [rows]);
    const visible = useMemo(() => rows.filter(row =>
        (!groupFilter || row.group_name === groupFilter)
        && (!kindFilter || row.source_kind === kindFilter)
        && (!intentFilter || (row.intent || 'proposal') === intentFilter)
        && (!statusFilter
            || (statusFilter === 'new' && !row.progress?.planned)
            || (statusFilter === 'planned' && row.progress?.planned && !row.progress?.shared)
            || (statusFilter === 'shared' && row.progress?.shared)
            || (statusFilter === 'feedback' && row.progress?.feedback_available))),
    [rows, groupFilter, kindFilter, intentFilter, statusFilter]);
    return <section aria-label={l(teacher ? 'sent' : 'received')} className="space-y-4">
        {showHeading && <h2 className="text-xl font-bold text-slate-900">{l(teacher ? 'sent' : 'received')}</h2>}
        {!teacher && <p className="text-sm text-slate-600">{w('visibility')}</p>}
        {loading && <p role="status">{l('loading')}</p>}
        {failed && <p role="alert">{l('error')} <button onClick={() => void load()} className="text-indigo-700 underline">{l('retry')}</button></p>}
        {!loading && !failed && rows.length > 2 && (
            <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label={`${w('filterGroup')}, ${w('filterKind')}, ${w('intent')}, ${w('filterStatus')}`}>
                {!teacher && <select aria-label={w('filterGroup')} value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="min-h-11 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">{w('filterAllGroups')}</option>
                    {groups.map(name => <option key={name} value={name}>{name}</option>)}
                </select>}
                <select aria-label={w('filterKind')} value={kindFilter} onChange={e => setKindFilter(e.target.value)} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">{w('filterAllKinds')}</option>
                    {(['goal', 'strategy', 'reading'] as const).map(kind => <option key={kind} value={kind}>{l(kind)}</option>)}
                </select>
                <select aria-label={w('intent')} value={intentFilter} onChange={e => setIntentFilter(e.target.value)} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">{w('filterAllIntents')}</option>
                    <option value="proposal">{w('proposal')}</option>
                    <option value="requested">{w('requested')}</option>
                </select>
                {!teacher && <select aria-label={w('filterStatus')} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">{w('filterAllStates')}</option>
                    <option value="new">{w('new')}</option>
                    <option value="planned">{w('planned')}</option>
                    <option value="shared">{w('statusShared')}</option>
                    <option value="feedback">{w('statusFeedback')}</option>
                </select>}
            </div>
        )}
        {!loading && !failed && !visible.length && <p className="text-sm text-slate-600">{l(teacher ? 'emptySent' : 'emptyReceived')}</p>}
        {!failed && visible.map(row => {
            const open = teacher || openId === row.id;
            return <article key={row.id} id={`assignment-${row.id}`} className="scroll-mt-24 space-y-3 break-words rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-slate-600">{l(row.source_kind)} · {row.group_name} · {new Date(row.created_at).toLocaleDateString(lang)}</p>
                    {!teacher && <button type="button" aria-expanded={open} onClick={() => toggle(row.id)} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{open ? w('closeDetail') : w('openDetail')}</button>}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{row.snapshot.title}</h3>
                <p className="text-sm font-medium text-indigo-700">{w(row.intent || 'proposal')}{row.due_date && <> · <time dateTime={row.due_date}>{new Date(row.due_date).toLocaleDateString(lang)}</time></>}</p>
                {row.progress?.shared && row.progress.feedback_available && !teacher && <p className="text-sm font-medium text-emerald-700">{w('statusFeedback')}</p>}
                {open && <>
                    {row.response_prompt && <p className="whitespace-pre-wrap text-sm"><strong>{w('responsePrompt')}: </strong>{row.response_prompt}</p>}
                    <p className="text-sm text-slate-600">{l('from')}: {row.author_name}</p>
                    {teacher && <p className="text-sm text-slate-600">{l('recipients')}: {row.recipient_username || l('all')} ({row.recipient_count})</p>}
                    {row.instructions && <p className="whitespace-pre-wrap rounded-md bg-indigo-50 p-3 text-slate-800">{row.instructions}</p>}
                    {row.snapshot.content_warning && <p className="whitespace-pre-wrap text-amber-700">{row.snapshot.content_warning}</p>}
                    {row.snapshot.creators?.length ? <p>{row.snapshot.creators.join(', ')}{row.snapshot.year ? ` · ${row.snapshot.year}` : ''}</p> : null}
                    {row.snapshot.description && <p className="whitespace-pre-wrap">{row.snapshot.description}</p>}
                    {row.snapshot.details && <p className="whitespace-pre-wrap text-sm">{row.snapshot.details}</p>}
                    {row.snapshot.where_to_find && <p className="whitespace-pre-wrap text-sm">{l('where')}: {row.snapshot.where_to_find}</p>}
                    {row.snapshot.source_reference && <p className="whitespace-pre-wrap text-sm text-slate-600">{l('source')}: {row.snapshot.source_reference}</p>}
                    {!teacher && <AssignmentWork assignmentId={row.id} authorName={row.author_name} />}
                    {teacher && !row.revoked_at && <AssignmentSubmissions assignmentId={row.id} />}
                    {teacher && (row.revoked_at ? <p>{l('revoked')}</p> : <button type="button" disabled={busy !== null} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50" onClick={async () => {
                        if (!window.confirm(l('confirmRevoke'))) return;
                        setBusy(row.id); setFailed(false);
                        try { const res = await apiFetch(`/api/teacher/assignments/${row.id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('revoke failed'); await load(); }
                        catch { setFailed(true); } finally { setBusy(null); }
                    }}>{l('revoke')}</button>)}
                </>}
            </article>;
        })}
    </section>;
}
