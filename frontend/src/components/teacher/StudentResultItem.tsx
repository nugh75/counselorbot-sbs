'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { classCompilationsText } from '@/lib/i18n-class-compilations';
import { readingText } from '@/lib/i18n-reading';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { QUESTIONNAIRES, isReusableProfile, type QuestionnaireType } from '@/lib/questionnaires';
import { ProfileVisualization } from '@/components/qsa/ProfileVisualization';
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

type Detail = StudentResult & {
    username: string;
    summary: string | null;
    conversation: Array<{ role: string; text: string }>;
    reading: { strengths: string[]; growth_areas: string[]; note: string; updated_at: string | null } | null;
};
type Props = { base: string; username: string; result: StudentResult };

function StudentResultDetails({ path, username, result }: { path: string; username: string; result: StudentResult }) {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof classCompilationsText>[1]) => classCompilationsText(lang, key);
    const parse = useCallback((payload: unknown): Detail => {
        const data = payload as Detail;
        if (!data || data.id !== result.id || data.username !== username || data.session_id !== result.session_id
            || data.questionnaire_type !== result.questionnaire_type || !Array.isArray(data.conversation)) throw new Error('invalid result detail');
        return data;
    }, [result.id, result.session_id, result.questionnaire_type, username]);
    const resource = useTeacherResource(`${path}?lang=${lang}`, parse);
    const [downloading, setDownloading] = useState(false);
    const [pdfError, setPdfError] = useState(false);
    const [accessLost, setAccessLost] = useState(false);
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => { pending.current?.abort(); }, []);

    const download = async () => {
        if (pending.current) return;
        const controller = new AbortController();
        pending.current = controller;
        setDownloading(true);
        setPdfError(false);
        try {
            const response = await apiFetch(`${path}/pdf?lang=${lang}`, { signal: controller.signal });
            if (controller.signal.aborted) return;
            if ([401, 403, 404].includes(response.status)) { setAccessLost(true); return; }
            if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw new Error('download failed');
            const blob = await response.blob();
            if (controller.signal.aborted) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `counselorbot_${result.questionnaire_type}_${result.id}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch {
            if (!controller.signal.aborted) setPdfError(true);
        } finally {
            if (!controller.signal.aborted) { setDownloading(false); pending.current = null; }
        }
    };

    if (resource.forbidden || accessLost) return <Callout variant="danger">{teacherAreaText(lang, 'forbidden')}</Callout>;
    if (resource.loading) return <p role="status">{t('common.loading')}</p>;
    if (resource.failed || !resource.data) return <Callout variant="danger"><p>{l('detailError')}</p><Button variant="secondary" onClick={() => void resource.reload()}>{t('setup.retry')}</Button></Callout>;
    const data = resource.data;
    const questionnaire = QUESTIONNAIRES[data.questionnaire_type as QuestionnaireType];
    const legacy = data.questionnaire_type === 'QPCC' && !isReusableProfile('QPCC', data.scores);
    const reading = data.reading;
    const hasReading = reading && (reading.strengths.length || reading.growth_areas.length || reading.note.trim());

    return <div className="min-w-0 space-y-5 rounded-lg border border-slate-200 bg-white p-3 sm:p-4" data-student-result-detail>
        <Button type="button" variant="secondary" onClick={() => void download()} disabled={downloading} aria-busy={downloading} className="min-h-[44px] max-w-full whitespace-normal">
            <Download className="h-4 w-4 shrink-0" aria-hidden />{t('completed.downloadPdf')}
        </Button>
        {pdfError && <Callout variant="danger">{l('pdfError')}</Callout>}
        <section className="space-y-2" aria-label={t('profile.factorBreakdown')}>
            <h3 className="font-semibold text-slate-800">{t('profile.factorBreakdown')}</h3>
            {legacy ? <p>{t('q.QPCC.legacyProfile')}</p> : data.scores && Object.keys(data.scores).length > 0 && questionnaire
                ? <ProfileVisualization scores={data.scores} questionnaire={questionnaire} />
                : <p className="text-slate-500">{l('noScores')}</p>}
        </section>
        <section className="space-y-2" aria-label={t('profile.sessionSummary.title')}>
            <h3 className="font-semibold text-slate-800">{t('profile.sessionSummary.title')}</h3>
            {data.summary ? <div className="prose prose-sm max-w-full overflow-x-auto break-words text-slate-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{data.summary}</ReactMarkdown></div>
                : <p className="text-slate-500">{t('profile.sessionSummary.pending')}</p>}
        </section>
        <section className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50 p-3" aria-label={l('studentReading')}>
            <h3 className="font-semibold text-slate-800">{l('studentReading')}</h3>
            {hasReading && reading ? <>
                <dl className="space-y-3">
                    {(['strengths', 'growth_areas'] as const).map(key => <div key={key}>
                        <dt className="font-semibold">{readingText(lang, key === 'strengths' ? 'strengths' : 'growth')}</dt>
                        <dd>{reading[key].length ? <ul className="list-inside list-disc break-words">{reading[key].map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>{l('notProvided')}</p>}</dd>
                    </div>)}
                    <div><dt className="font-semibold">{readingText(lang, 'note')}</dt><dd className="whitespace-pre-wrap break-words">{reading.note.trim() ? reading.note : l('notProvided')}</dd></div>
                </dl>
                {reading.updated_at && <p className="text-xs text-slate-600">{l('updated')}{' '}<time dateTime={reading.updated_at}>{new Date(reading.updated_at).toLocaleString(lang)}</time></p>}
            </> : <p>{l('noReading')}</p>}
        </section>
        <section className="space-y-2" aria-label={l('conversation')}>
            <h3 className="font-semibold text-slate-800">{l('conversation')}</h3>
            <div className="max-h-96 space-y-3 overflow-y-auto break-words rounded-md border border-slate-200 bg-slate-50 p-3">
                {!data.conversation.length && <p>{l('noConversation')}</p>}
                {data.conversation.map((message, index) => <div key={index}>
                    <p className="font-semibold">{message.role === 'student' ? l('student') : 'CounselorBot'}</p>
                    <div className="prose prose-sm max-w-full overflow-x-auto text-slate-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>
                </div>)}
            </div>
        </section>
    </div>;
}

function ResultItem({ base, username, result }: Props) {
    const { lang } = useI18n();
    const [open, setOpen] = useState(false);
    const id = useId();
    const l = (key: Parameters<typeof classCompilationsText>[1]) => classCompilationsText(lang, key);
    const path = `${base}/students/${encodeURIComponent(username)}/results/${result.id}`;
    return <div className="min-w-0 space-y-2 text-sm text-slate-700">
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
            <div><dt className="sr-only">{l('instrument')}</dt><dd className="font-semibold">{result.questionnaire_type}</dd></div>
            {result.submitted_at && <div><dt className="sr-only">{l('date')}</dt><dd><time dateTime={result.submitted_at}>{new Date(result.submitted_at).toLocaleString(lang)}</time></dd></div>}
        </dl>
        {result.scores && <p className="break-words font-mono text-xs text-slate-600">
            {Object.entries(result.scores).sort(([a], [b]) => a.localeCompare(b)).map(([code, value]) => `${code}=${value}`).join(' ')}
        </p>}
        <Button type="button" variant="ghost" className="min-h-[44px] max-w-full whitespace-normal px-2 text-left" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            <FileText className="h-4 w-4 shrink-0" aria-hidden />{l('detail')}
            <span className="sr-only">{username} · {result.questionnaire_type}{result.submitted_at ? ` · ${new Date(result.submitted_at).toLocaleString(lang)}` : ''}</span>
        </Button>
        <div id={id} hidden={!open}>{open && <StudentResultDetails path={path} username={username} result={result} />}</div>
    </div>;
}

// Remount all local reads and downloads when the selected identity changes.
export function StudentResultItem(props: Props) {
    const { lang } = useI18n();
    return <ResultItem key={`${props.base}/${props.username}/${props.result.id}/${lang}`} {...props} />;
}
