'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Callout } from '@/components/ui/Callout';
import type { PromptHealthProblem } from '@/lib/prompt-health';
import { cn } from '@/lib/utils';
import { SEVERITY_TEXT, useFindingMessage } from './PromptCompare';

/** Storico dei problemi: ogni problema mai trovato con il suo numero univoco. Solo lettura. */
export function PromptHealthHistory() {
    const { t, lang } = useI18n();
    const message = useFindingMessage();
    const [problems, setProblems] = useState<PromptHealthProblem[] | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        apiFetch('/api/admin/prompt-health/problems')
            .then(response => { if (!response.ok) throw new Error('load'); return response.json(); })
            .then(data => setProblems(data.problems)).catch(() => setError(true));
    }, []);
    const date = (value: string | null) => value ? new Date(value).toLocaleString(lang) : '—';
    return <div className="space-y-3">
        <p className="text-sm text-ink-muted">{t('admin.promptHealth.history.help')}</p>
        {error && <Callout variant="danger">{t('admin.promptHealth.history.loadError')}</Callout>}
        {problems?.length === 0 && <Callout variant="info">{t('admin.promptHealth.history.empty')}</Callout>}
        {problems && problems.length > 0 && <ol className="space-y-2" aria-label={t('admin.promptHealth.history.title')}>
            {problems.map(problem => <li key={problem.number} className="rounded-control border border-line bg-surface p-3 text-sm text-ink-body">
                <p className="break-words">
                    <span className="font-mono font-semibold text-ink-strong">{t('admin.promptHealth.problem.number', { number: problem.number })}</span>
                    {' · '}<span className={cn('font-semibold', SEVERITY_TEXT[problem.severity])}>{t(`admin.promptHealth.severity.${problem.severity}`)}</span>
                    {' · '}<span className="font-semibold">{message(problem)}</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                    {problem.status === 'open' ? t('admin.promptHealth.history.open') : t('admin.promptHealth.history.resolved', { date: date(problem.resolved_at) })}
                    {problem.ack && ` · ${t('admin.promptHealth.ack.marked')}`}
                    {` · ${t(`admin.promptHealth.history.source.${problem.source}`)}`}
                    {` · ${t('admin.promptHealth.history.firstSeen', { date: date(problem.first_seen_at) })}`}
                    {` · ${t('admin.promptHealth.history.lastSeen', { date: date(problem.last_seen_at) })}`}
                </p>
                {problem.sentences.length > 0 && <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                    {problem.sentences.map((sentence, index) => <li key={index} className="break-words">«{sentence.text}»</li>)}
                </ul>}
            </li>)}
        </ol>}
    </div>;
}
