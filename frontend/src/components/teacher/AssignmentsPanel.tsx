'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { assignmentText } from '@/lib/i18n-assignments';

interface Assignment {
    id: number; author_name: string; group_name: string; source_kind: 'goal' | 'strategy' | 'reading';
    recipient_username?: string | null; recipient_count?: number; instructions: string; created_at: string; revoked_at: string | null;
    snapshot: { title: string; description: string; details: string; creators?: string[]; year?: number; content_warning?: string; where_to_find?: string; source_reference?: string };
}

export function AssignmentsPanel({ teacher = false, showHeading = true }: { teacher?: boolean; showHeading?: boolean }) {
    const { lang } = useI18n(); const l = (key: Parameters<typeof assignmentText>[1]) => assignmentText(lang, key);
    const [rows, setRows] = useState<Assignment[]>([]); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState<number | null>(null);
    const load = useCallback(async () => {
        setLoading(true); setFailed(false);
        try { const res = await apiFetch(`/api/${teacher ? 'teacher' : 'user'}/assignments`); if (!res.ok) throw new Error('unavailable'); setRows(await res.json()); }
        catch { setFailed(true); } finally { setLoading(false); }
    }, [teacher]);
    useEffect(() => { void load(); if (teacher) window.addEventListener('teacher-assignments-changed', load); return () => window.removeEventListener('teacher-assignments-changed', load); }, [load, teacher]);
    return <section aria-label={l(teacher ? 'sent' : 'received')} className="space-y-4">
        {showHeading && <h2 className="text-xl font-bold text-slate-900">{l(teacher ? 'sent' : 'received')}</h2>}
        {loading && <p role="status">{l('loading')}</p>}
        {failed && <p role="alert">{l('error')} <button onClick={() => void load()} className="text-indigo-700 underline">{l('retry')}</button></p>}
        {!loading && !failed && !rows.length && <p className="text-sm text-slate-600">{l(teacher ? 'emptySent' : 'emptyReceived')}</p>}
        {!failed && rows.map(row => <article key={row.id} className="space-y-3 break-words rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <p className="text-sm text-slate-600">{l(row.source_kind)} · {row.group_name} · {new Date(row.created_at).toLocaleDateString(lang)}</p>
            <h3 className="text-lg font-bold text-slate-900">{row.snapshot.title}</h3>
            <p className="text-sm text-slate-600">{l('from')}: {row.author_name}</p>
            {teacher && <p className="text-sm text-slate-600">{l('recipients')}: {row.recipient_username || l('all')} ({row.recipient_count})</p>}
            {row.instructions && <p className="whitespace-pre-wrap rounded-md bg-indigo-50 p-3 text-slate-800">{row.instructions}</p>}
            {row.snapshot.content_warning && <p className="whitespace-pre-wrap text-amber-700">{row.snapshot.content_warning}</p>}
            {row.snapshot.creators?.length ? <p>{row.snapshot.creators.join(', ')}{row.snapshot.year ? ` · ${row.snapshot.year}` : ''}</p> : null}
            {row.snapshot.description && <p className="whitespace-pre-wrap">{row.snapshot.description}</p>}
            {row.snapshot.details && <p className="whitespace-pre-wrap text-sm">{row.snapshot.details}</p>}
            {row.snapshot.where_to_find && <p className="whitespace-pre-wrap text-sm">{l('where')}: {row.snapshot.where_to_find}</p>}
            {row.snapshot.source_reference && <p className="whitespace-pre-wrap text-sm text-slate-600">{l('source')}: {row.snapshot.source_reference}</p>}
            {teacher && (row.revoked_at ? <p>{l('revoked')}</p> : <button type="button" disabled={busy !== null} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50" onClick={async () => {
                if (!window.confirm(l('confirmRevoke'))) return;
                setBusy(row.id); setFailed(false);
                try { const res = await apiFetch(`/api/teacher/assignments/${row.id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('revoke failed'); await load(); }
                catch { setFailed(true); } finally { setBusy(null); }
            }}>{l('revoke')}</button>)}
        </article>)}
    </section>;
}
