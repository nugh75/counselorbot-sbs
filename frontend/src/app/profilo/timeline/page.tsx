'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { VisualTools } from '@/components/visual/VisualTools';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';

function TimelinePage() {
    const params = useSearchParams();
    const { lang } = useI18n();
    const sessionId = params.get('session') || '';
    const eventId = params.get('event') || undefined;
    const request = useMemo(() => ({ tab: 'timeline' as const, nonce: 1, eventId }), [eventId]);
    return <main className="page-narrow space-y-4 p-4">
        <h1 className="text-2xl font-bold">{visualLabel(lang, 'timeline')}</h1>
        <a className="text-indigo-700 underline" href="/profilo/portfolio">{visualLabel(lang, 'openPortfolio')}</a>
        {sessionId && <VisualTools sessionId={sessionId} locale={lang} request={request} />}
    </main>;
}

export default function Page() {
    return <Suspense><TimelinePage /></Suspense>;
}
