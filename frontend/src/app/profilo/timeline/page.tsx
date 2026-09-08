'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import { VisualTools } from '@/components/visual/VisualTools';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';

function TimelinePage() {
    const params = useSearchParams();
    const { lang, t } = useI18n();
    const [sessions, setSessions] = useState<Array<{ session_id: string; questionnaire_type: string; submitted_at: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        void apiFetch('/api/user/questionnaire-results', { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error('load');
            const data = await response.json();
            if (!controller.signal.aborted) setSessions(data);
        }).catch(() => {
            if (!controller.signal.aborted) setFailed(true);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [attempt]);
    const sessionId = params.get('session') || '';
    const eventId = params.get('event') || undefined;
    const request = useMemo(() => ({ tab: 'timeline' as const, nonce: 1, eventId }), [eventId]);
    return <main className="page-narrow space-y-4 p-4">
        <h1 className="text-2xl font-bold">{visualLabel(lang, 'timeline')}</h1>
        <Link className="block text-indigo-700 underline" href="/profilo">{t('profile.title')}</Link>
        <a className="text-indigo-700 underline" href="/profilo/portfolio">{visualLabel(lang, 'openPortfolio')}</a>
        {!sessionId && <section className="space-y-3" aria-busy={loading}>
            <h2 className="font-semibold">{visualLabel(lang, 'chooseSession')}</h2>
            {loading && <p role="status">{t('common.loading')}</p>}
            {failed && <div role="alert"><p>{visualLabel(lang, 'loadError')}</p><button type="button" className="min-h-11 underline" onClick={() => { setLoading(true); setFailed(false); setAttempt(n => n + 1); }}>{visualLabel(lang, 'retry')}</button></div>}
            {!loading && !failed && sessions.length === 0 && <p>{visualLabel(lang, 'noTimelineSessions')} <Link href="/" className="underline">{t('profile.backToHomeToLogin')}</Link></p>}
            {!failed && sessions.map(session => <Link key={session.session_id} className="block rounded-xl border border-slate-200 p-4 hover:bg-indigo-50" href={`/profilo/timeline?session=${encodeURIComponent(session.session_id)}`}>
                {session.questionnaire_type} · {new Date(session.submitted_at).toLocaleString(lang)}
            </Link>)}
        </section>}
        {sessionId && <VisualTools key={sessionId} sessionId={sessionId} locale={lang} request={request} />}
    </main>;
}

export default function Page() {
    return <Suspense><TimelinePage /></Suspense>;
}
