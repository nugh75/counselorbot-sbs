'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { useSearchParams } from 'next/navigation';
import { JourneyOverview } from '@/components/goals/JourneyOverview';
import { VisualTools } from '@/components/visual/VisualTools';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';

function TimelinePage() {
    const params = useSearchParams();
    const { lang, t } = useI18n();
    const eventId = params.get('event') || undefined;
    const requestedTab = params.get('tab');
    const tab: 'board' | 'cards' | 'comparison' | 'timeline' = requestedTab === 'board' || requestedTab === 'cards' || requestedTab === 'comparison' ? requestedTab : 'timeline';
    const request = useMemo(() => ({ tab, nonce: 1, eventId }), [eventId, tab]);
    return <main className="page-narrow space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">{visualLabel(lang, tab)}</h1>
                <p className="mt-1 text-sm text-slate-500">{visualLabel(lang, tab === 'timeline' ? 'personalTimelineHelp' : `${tab}Purpose`)}</p>
            </div>
            <PreviousPageButton fallbackHref="/profilo" />
        </div>
        <nav className="flex flex-wrap gap-4">
            <Link className="text-indigo-700 underline" href="/profilo/portfolio">{visualLabel(lang, 'openPortfolio')}</Link>
            <Link className="text-indigo-700 underline" href="/profilo/orientamento">{t('referrals.area.title')}</Link>
        </nav>
        <JourneyOverview kind={tab === 'timeline' ? 'event' : tab === 'board' ? 'action' : tab === 'cards' ? 'card' : 'comparison'} />
        <VisualTools personal locale={lang} request={request} legacySession={params.get('session') || undefined} />
    </main>;
}

export default function Page() {
    return <Suspense><TimelinePage /></Suspense>;
}
