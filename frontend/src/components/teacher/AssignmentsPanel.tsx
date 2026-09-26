'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { assignmentText } from '@/lib/i18n-assignments';
import { learningText } from '@/lib/i18n-assignment-work';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
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
//
// Restyling ("strumento misurato", docs/design.md): glass-panel per ogni scheda,
// eyebrow con tipo · gruppo · data, finalità e stato come chip distinte (la
// parola resta il canale, non il colore), conferma di revoca in linea
// (ConfirmInline, nessun window.confirm), Callout per avviso e indicazioni.
const chip = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold';
export function AssignmentsPanel({ teacher = false, showHeading = true }: { teacher?: boolean; showHeading?: boolean }) {
    const { lang } = useI18n(); const l = (key: Parameters<typeof assignmentText>[1]) => assignmentText(lang, key);
    const w = (key: Parameters<typeof learningText>[1]) => learningText(lang, key);
    const [rows, setRows] = useState<Assignment[]>([]); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState<number | null>(null);
    // F27: filtri gruppo, tipo, finalità (richiesta/proposta) e stato. Con almeno
    // tre schede sono la prima riga della schermata: barra di inquiry, non una
    // fila di select anonimi.
    const [groupFilter, setGroupFilter] = useState('');
    const [kindFilter, setKindFilter] = useState('');
    const [intentFilter, setIntentFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    // F27: lo studente apre un dettaglio alla volta. Un hash #assignment-N apre quella.
    // La vista docente resta sempre espansa per consultare subito invii, destinatari e riscontri.
    const [openId, setOpenId] = useState<number | null>(null);
    // Lotto 5B: la revoca conferma in linea, sulla scheda stessa.
    const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
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
        {!teacher && <Callout variant="info" className="text-sm">{w('visibility')}</Callout>}
        {loading && <p role="status" className="text-sm text-slate-500">{l('loading')}</p>}
        {failed && <Callout variant="danger" title={l('error')} className="text-sm">
            <Button variant="secondary" size="sm" onClick={() => void load()}>{l('retry')}</Button>
        </Callout>}
        {!loading && !failed && (rows.length > 2 || groupFilter) && (
            <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label={`${w('filterGroup')}, ${w('filterKind')}, ${w('intent')}, ${w('filterStatus')}`}>
                {/* F30 fix: la select gruppo serve anche al docente — arrivo con
                    ?group= preimpostato dalla scheda classe senza modo di togliere il filtro. */}
                <select aria-label={w('filterGroup')} value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="min-h-11 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">{w('filterAllGroups')}</option>
                    {groups.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
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
        {!loading && !failed && !visible.length && <p className="text-sm text-slate-600">{rows.length > 0 && (groupFilter || kindFilter || intentFilter || statusFilter) ? w('filterEmpty') : l(teacher ? 'emptySent' : 'emptyReceived')}</p>}
        {!failed && visible.map(row => {
            const open = teacher || openId === row.id;
            return <article key={row.id} id={`assignment-${row.id}`} className="glass-panel scroll-mt-24 space-y-3 break-words p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l(row.source_kind)} · {row.group_name} · {new Date(row.created_at).toLocaleDateString(lang)}</p>
                    {!teacher && <Button variant="secondary" size="sm" type="button" aria-expanded={open} onClick={() => toggle(row.id)}>{open ? w('closeDetail') : w('openDetail')}</Button>}
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <h3 className="font-bold text-slate-900">{row.snapshot.title}</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`${chip} border-slate-200 bg-slate-100 text-slate-700`}>{w(row.intent || 'proposal')}</span>
                        {row.due_date && <span className={`${chip} border-slate-200 bg-white text-slate-700`}><time dateTime={row.due_date}>{new Date(row.due_date).toLocaleDateString(lang)}</time></span>}
                        {!teacher && row.progress?.shared && row.progress.feedback_available && <span className={`${chip} border-emerald-200 bg-emerald-50 text-emerald-700`}>{w('statusFeedback')}</span>}
                        {row.revoked_at && <span className={`${chip} border-slate-200 bg-slate-100 text-slate-500 line-through`}>{l('revoked')}</span>}
                    </div>
                </div>
                {open && <>
                    {row.response_prompt && <p className="whitespace-pre-wrap text-sm"><strong>{w('responsePrompt')}: </strong>{row.response_prompt}</p>}
                    <p className="text-sm text-slate-600">{l('from')}: {row.author_name}</p>
                    {teacher && <p className="text-sm text-slate-600">{l('recipients')}: {row.recipient_username || l('all')} ({row.recipient_count})</p>}
                    {row.instructions && <Callout variant="info" className="text-sm">
                        <p className="font-semibold">{l('instructions')}</p>
                        <p className="whitespace-pre-wrap">{row.instructions}</p>
                    </Callout>}
                    {row.snapshot.content_warning && <Callout variant="warning" className="text-sm">{row.snapshot.content_warning}</Callout>}
                    {row.snapshot.creators?.length ? <p>{row.snapshot.creators.join(', ')}{row.snapshot.year ? ` · ${row.snapshot.year}` : ''}</p> : null}
                    {row.snapshot.description && <p className="whitespace-pre-wrap">{row.snapshot.description}</p>}
                    {row.snapshot.details && <p className="whitespace-pre-wrap text-sm">{row.snapshot.details}</p>}
                    {row.snapshot.where_to_find && <p className="whitespace-pre-wrap text-sm">{l('where')}: {row.snapshot.where_to_find}</p>}
                    {row.snapshot.source_reference && <p className="whitespace-pre-wrap text-sm text-slate-600">{l('source')}: {row.snapshot.source_reference}</p>}
                    {!teacher && <AssignmentWork assignmentId={row.id} authorName={row.author_name} />}
                    {teacher && !row.revoked_at && <AssignmentSubmissions assignmentId={row.id} />}
                    {teacher && !row.revoked_at && (confirmRevoke === row.id
                        ? <ConfirmInline question={l('confirmRevoke')} busy={busy !== null}
                            onConfirm={async () => {
                                setBusy(row.id); setFailed(false);
                                try { const res = await apiFetch(`/api/teacher/assignments/${row.id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('revoke failed'); setConfirmRevoke(null); await load(); }
                                catch { setFailed(true); } finally { setBusy(null); }
                            }}
                            onCancel={() => setConfirmRevoke(null)} />
                        : <Button variant="secondary" size="sm" type="button" disabled={busy !== null} onClick={() => setConfirmRevoke(row.id)}>{l('revoke')}</Button>)}
                </>}
            </article>;
        })}
    </section>;
}
