'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Target } from 'lucide-react';
import { goalApi, type CatalogEntry } from '@/lib/goals';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { useI18n } from '@/lib/i18n-context';

type GoalTarget = { groupId: number; username?: string } | { practiceNotebookId: number };

// Read-only catalog goals the teacher wrote for a class, a student or a test student (#905).
// Teacher-only: targets never reach students. Flat block, no box.
export function TargetedGoals({ target }: { target: GoalTarget }) {
    const { lang } = useI18n();
    const l = (key: GoalTextKey) => goalText(lang, key);
    const headingId = useId();
    const query = 'practiceNotebookId' in target
        ? `practice_notebook_id=${target.practiceNotebookId}`
        : `group_id=${target.groupId}${target.username ? `&username=${encodeURIComponent(target.username)}` : ''}`;
    // Result tagged with its query: a new target shows "loading" without a reset in the effect.
    const [result, setResult] = useState<{ query: string; rows: CatalogEntry[] | null }>({ query: '', rows: null });
    useEffect(() => {
        let current = true;
        goalApi<CatalogEntry[]>(`/teacher/goal-catalog/targeted?${query}`)
            .then(data => { if (current) setResult({ query, rows: data }); })
            .catch(() => { if (current) setResult({ query, rows: null }); });
        return () => { current = false; };
    }, [query]);
    const rows = result.query === query ? result.rows : null;
    const failed = result.query === query && result.rows === null;
    const kind = 'practiceNotebookId' in target ? 'targetedPractice' : target.username ? 'targetedStudent' : 'targetedClass';
    return <section aria-labelledby={headingId} data-targeted-goals className="space-y-2 border-t border-line pt-4">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-ink"><Target className="h-4 w-4" aria-hidden />{l(kind)}</h3>
        <p className="text-xs text-ink-muted">{l('practiceNotebookId' in target ? 'targetedPracticeHelp' : 'targetedHelp')}</p>
        {failed ? <p className="text-sm text-ink-muted">{l('targetedUnavailable')}</p>
            : rows === null ? <p className="text-sm text-ink-muted">{l('loading')}</p>
            : rows.length === 0 ? <p className="text-sm text-ink-muted">{l('targetedEmpty')}</p>
            : <ul className="divide-y divide-line">{rows.map(row => <li key={row.id} className="py-2">
                <p className="break-words text-sm font-medium text-ink">{row.data.title} <span className="font-normal text-ink-muted">· {l(row.status as GoalTextKey)}</span></p>
                {row.data.description && <p className="line-clamp-2 text-sm text-ink-muted">{row.data.description}</p>}
            </li>)}</ul>}
        <Link href="/docente/catalogo-obiettivi" className="text-sm text-link underline">{l('catalog')}</Link>
    </section>;
}
