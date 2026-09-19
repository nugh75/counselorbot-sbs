'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { goalApi as request } from '@/lib/goals';
import { useI18n } from '@/lib/i18n-context';
import { learningText } from '@/lib/i18n-assignment-work';
import { assignmentText } from '@/lib/i18n-assignments';

type Entry = { id: number; snapshot: { title: string }; intent: 'proposal' | 'requested'; due_date: string | null;
    progress?: { planned: boolean; shared: boolean; feedback_available: boolean } };

export function AssignmentJourney() {
    const { lang } = useI18n(); const [rows, setRows] = useState<Entry[]>([]); const [failed, setFailed] = useState(false);
    const load = useCallback(() => { void request<Entry[]>('/user/assignments').then(data => { setRows(data); setFailed(false); }).catch(() => setFailed(true)); }, []);
    useEffect(() => { load(); window.addEventListener('personal-assignments-changed', load); return () => window.removeEventListener('personal-assignments-changed', load); }, [load]);
    const pending = [...rows].sort((a, b) => Number(Boolean(b.progress?.feedback_available)) - Number(Boolean(a.progress?.feedback_available)) || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    if (!rows.length && !failed) return null;
    return <section className="space-y-2 border-t border-indigo-200 pt-3" aria-label={learningText(lang, 'journey')}>
        <h3 className="text-sm font-bold">{learningText(lang, 'journey')}</h3>
        {failed && <p role="alert" className="text-sm">{assignmentText(lang, 'error')} <button type="button" onClick={load} className="underline">{assignmentText(lang, 'retry')}</button></p>}
        <ul className="space-y-2">{pending.slice(0, 3).map(row => <li key={row.id} className="text-sm">
            <Link className="inline-block py-1 text-indigo-700 underline" href={`/profilo/assegnazioni#assignment-${row.id}`}>{row.snapshot.title}</Link>
            <span className="block text-slate-600">{learningText(lang, row.progress?.feedback_available ? 'feedback' : row.progress?.shared ? 'shared' : row.progress?.planned ? 'planned' : 'new')} · {learningText(lang, row.intent || 'proposal')}{row.due_date && ` · ${row.due_date}`}</span>
        </li>)}</ul>
        <Link className="inline-block py-2 text-sm text-indigo-700 underline" href="/profilo/assegnazioni">{assignmentText(lang, 'received')}</Link>
    </section>;
}
