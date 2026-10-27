'use client';

import { useResumeEntries, resumeHref, LOCAL_RESUME_HREF, PQBL_RESUME_HREF } from '@/lib/use-resume-entries';
import { resumeLabel } from '@/lib/resume-label';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaText, personalAreaName } from '@/lib/i18n-personal-area';
import { Button } from '@/components/ui/Button';

export function InProgressChats() {
    const { lang, tf } = useI18n();
    const entries = useResumeEntries();
    const frozen = entries.frozen.filter(row => !row.practice_notebook_id);
    const local = entries.localResume && !entries.frozen.some(row => row.session_id === entries.localResume?.sessionId) ? entries.localResume : null;
    return <section aria-labelledby="in-progress-chats" className="glass-panel space-y-3 p-5">
        <h2 id="in-progress-chats" className="text-lg font-bold text-slate-800">{personalAreaText(lang, 'inProgressChats')}</h2>
        {entries.loading && <p role="status">{personalAreaText(lang, 'loading')}</p>}
        {entries.error && <div role="alert">{personalAreaText(lang, 'error')}{' '}
            <Button variant="ghost" onClick={entries.retry}>{personalAreaText(lang, 'retry')}</Button></div>}
        {!entries.loading && !entries.error && !frozen.length && !local && !entries.pqbl && <p className="text-sm text-slate-600">{personalAreaText(lang, 'noChats')}</p>}
        <ul className="divide-y divide-slate-200">
            {frozen.map(row => <li key={row.session_id}>
                <a className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm font-semibold text-indigo-700" href={resumeHref(row)}>
                    <span className="min-w-0 break-words">{resumeLabel(row.questionnaire_type, row.label, tf)}</span>
                    {row.updated_at && <time className="shrink-0 font-normal text-slate-600" dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleDateString(lang)}</time>}
                </a>
            </li>)}
            {local && <li><a href={LOCAL_RESUME_HREF} className="flex min-h-11 items-center text-sm text-indigo-700">{resumeLabel(local.instrument, null, tf)}</a></li>}
            {entries.pqbl && <li><a href={PQBL_RESUME_HREF} className="flex min-h-11 items-center text-sm text-indigo-700">{personalAreaName(lang, 'pqbl')}</a></li>}
        </ul>
    </section>;
}
