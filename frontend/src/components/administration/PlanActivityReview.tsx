'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { pathActivityText } from '@/lib/i18n-path-activity';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { SessionReport } from '@/components/qsa/SessionReport';
import { Button } from '@/components/ui/Button';

export function PlanActivityReview({sessionId, instrument}: {sessionId: string; instrument: string}) {
    const {lang} = useI18n();
    const [messages, setMessages] = useState<{role: string; text: string}[]>([]);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        void apiFetch(`/api/user/questionnaire-result/${encodeURIComponent(sessionId)}/conversation`, {signal: controller.signal})
            .then(async response => {
                if (!response.ok) throw new Error('conversation');
                const rows = await response.json();
                if (!Array.isArray(rows) || rows.some(row => typeof row.text !== 'string')) throw new Error('conversation');
                if (!controller.signal.aborted) { setError(false); setMessages(rows); }
            }).catch(() => { if (!controller.signal.aborted) setError(true); });
        return () => controller.abort();
    }, [sessionId, retry]);
    return <div className="space-y-4">
        <SessionReport sessionId={sessionId} questionnaireType={instrument} />
        <details className="rounded-xl border border-slate-200 p-3 text-left">
            <summary className="cursor-pointer py-2 font-semibold">{pathActivityText(lang, 'conversation')}</summary>
            {error && <p role="alert">{pathActivityText(lang, 'error')} <Button onClick={() => setRetry(value => value + 1)}>{pathActivityText(lang, 'retry')}</Button></p>}
            <div className="space-y-3">{messages.map((message, index) => <div key={index}
                className={`min-w-0 rounded-lg p-3 ${message.role === 'student' ? 'ml-4 bg-indigo-50' : 'border border-slate-200 bg-white'}`}>
                <ChatMarkdown content={message.text} locale={lang} errorMessage={pathActivityText(lang, 'error')} />
            </div>)}</div>
        </details>
    </div>;
}
