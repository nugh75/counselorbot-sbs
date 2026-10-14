'use client';

import { useId, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { classCompilationsText } from '@/lib/i18n-class-compilations';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useTeacherResource } from './useTeacherResource';

export interface StudentResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string | null;
}

function parseConversation(payload: unknown): Array<{ role: string; text: string }> {
    if (!Array.isArray(payload)) throw new Error('invalid conversation');
    return payload;
}

function StudentConversation({ path }: { path: string }) {
    const { lang, t } = useI18n();
    const resource = useTeacherResource(path, parseConversation);
    const l = (key: Parameters<typeof classCompilationsText>[1]) => classCompilationsText(lang, key);
    if (resource.forbidden) return <Callout variant="danger">{teacherAreaText(lang, 'forbidden')}</Callout>;
    if (resource.loading) return <p role="status">{t('common.loading')}</p>;
    if (resource.failed) return <Callout variant="danger"><p>{l('conversationError')}</p><Button variant="secondary" onClick={() => void resource.reload()}>{t('setup.retry')}</Button></Callout>;
    return <div className="max-h-64 space-y-2 overflow-y-auto break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        {resource.data?.length === 0 && <p>{l('noConversation')}</p>}
        {resource.data?.map((message, index) => <p key={index} className="whitespace-pre-wrap">
            <span className="font-semibold">{message.role === 'student' ? l('student') : 'AI'}:</span>{' '}{message.text}
        </p>)}
    </div>;
}

// Shared by class/plan participants and the dashboard. Same scores and same
// scoped transcript API; no notebook, notes or message forms in this component.
export function StudentResultItem({ base, username, result }: { base: string; username: string; result: StudentResult }) {
    const { lang } = useI18n();
    const [open, setOpen] = useState(false);
    const id = useId();
    const l = (key: Parameters<typeof classCompilationsText>[1]) => classCompilationsText(lang, key);
    return <div className="min-w-0 space-y-2 text-sm text-slate-700">
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
            <div><dt className="sr-only">{l('instrument')}</dt><dd className="font-semibold">{result.questionnaire_type}</dd></div>
            {result.submitted_at && <div><dt className="sr-only">{l('date')}</dt><dd><time dateTime={result.submitted_at}>{new Date(result.submitted_at).toLocaleString(lang)}</time></dd></div>}
        </dl>
        {result.scores && <p className="break-words font-mono text-xs text-slate-600">
            {Object.entries(result.scores).sort(([a], [b]) => a.localeCompare(b)).map(([code, value]) => `${code}=${value}`).join(' ')}
        </p>}
        <Button type="button" variant="ghost" className="min-h-[44px] max-w-full whitespace-normal px-2 text-left" aria-expanded={open} aria-controls={id}
            onClick={() => setOpen(!open)}>
            <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />{l('conversation')}
            <span className="sr-only">{username} · {result.questionnaire_type}</span>
        </Button>
        <div id={id} hidden={!open}>{open && <StudentConversation key={`${base}/${username}/${result.session_id}`} path={`${base}/students/${encodeURIComponent(username)}/conversation/${encodeURIComponent(result.session_id)}`} />}</div>
    </div>;
}
