'use client';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { assignmentText } from '@/lib/i18n-assignments';
import type { Assignment } from './AssignmentsPanel';

// F31: dentro la scheda gruppo/classe di /docente/classi, un blocco in sola
// lettura con le assegnazioni di quel gruppo. Il fetch parte solo alla prima
// apertura del dettaglio; la creazione e la gestione restano in
// /docente/assegnazioni, raggiunta con filtro ?group= preimpostato (F30).
export function GroupAssignments({ groupName }: { groupName: string }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof assignmentText>[1]) => assignmentText(lang, key);
    const [rows, setRows] = useState<Assignment[] | null>(null);
    const [failed, setFailed] = useState(false);
    const manageHref = `/docente/assegnazioni?group=${encodeURIComponent(groupName)}`;
    const groupRows = (rows ?? []).filter(row => row.group_name === groupName);
    return (
        <details
            className="mt-2 rounded-control border border-line bg-surface-sunken p-4"
            onToggle={event => {
                if (!(event.target as HTMLDetailsElement).open || rows !== null || failed) return;
                apiFetch('/api/teacher/assignments')
                    .then(res => { if (!res.ok) throw new Error('unavailable'); return res.json(); })
                    .then(setRows)
                    .catch(() => setFailed(true));
            }}
        >
            <summary className="cursor-pointer text-xs font-semibold text-ink-muted">{l('groupAssignments')}</summary>
            <div className="mt-2 space-y-1">
                {failed && <p className="text-xs text-ink-muted">{l('error')}</p>}
                {!failed && rows === null && <p role="status" className="text-xs text-ink-muted">{l('loading')}</p>}
                {!failed && rows !== null && groupRows.length === 0 && (
                    <p className="text-xs text-ink-muted">{l('groupAssignmentsEmpty')}</p>
                )}
                {groupRows.map(row => (
                    <Link key={row.id} href={`${manageHref}#assignment-${row.id}`}
                        className="flex min-h-control items-center break-words rounded-control bg-surface px-2 py-2 text-xs hover:bg-brand-soft">
                        <span className="font-semibold text-ink-body">{l(row.source_kind)}</span>
                        {' · '}
                        <span className="text-ink">{row.snapshot.title}</span>
                        <span className="block text-ink-muted">
                            {l('recipients')}: {row.recipient_username || l('all')} ({row.recipient_count})
                            {row.due_date && <> · <time dateTime={row.due_date}>{new Date(row.due_date).toLocaleDateString(lang)}</time></>}
                        </span>
                    </Link>
                ))}
                <Link href={manageHref} className="inline-block text-xs font-semibold text-link underline underline-offset-2 hover:text-link">
                    {l('groupAssignmentsManage')}
                </Link>
            </div>
        </details>
    );
}
