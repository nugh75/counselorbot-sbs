'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { VisualTools } from '@/components/visual/VisualTools';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';

function TimelinePage() {
    const params = useSearchParams();
    const { lang, t } = useI18n();
    const eventId = params.get('event') || undefined;
    const request = useMemo(() => ({ tab: 'timeline' as const, nonce: 1, eventId }), [eventId]);
    return <main className="page-narrow space-y-4 p-4">
        <h1 className="text-2xl font-bold">{visualLabel(lang, 'timeline')}</h1>
        <p>{visualLabel(lang, 'personalTimelineHelp')}</p>
        <nav className="flex flex-wrap gap-4">
            <Link className="text-indigo-700 underline" href="/profilo">{t('profile.title')}</Link>
            <Link className="text-indigo-700 underline" href="/profilo/portfolio">{visualLabel(lang, 'openPortfolio')}</Link>
            <Link className="text-indigo-700 underline" href="/profilo/orientamento">{t('referrals.area.title')}</Link>
        </nav>
        <VisualTools personal locale={lang} request={request} legacySession={params.get('session') || undefined} />
    </main>;
}

export default function Page() {
    return <Suspense><TimelinePage /></Suspense>;
}
