'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { JourneyOverview } from '@/components/goals/JourneyOverview';
import { PageHeader } from '@/components/ui/PageHeader';
import { VisualTools, type WorkTab } from '@/components/visual/VisualTools';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';

const GOAL_KIND: Record<WorkTab, 'action' | 'card' | 'comparison' | 'event'> = {
    board: 'action',
    cards: 'card',
    comparison: 'comparison',
    timeline: 'event',
};

export function PersonalVisualWorkspacePage({ tab }: { tab: WorkTab }) {
    const params = useSearchParams();
    const { lang } = useI18n();
    const eventId = tab === 'timeline' ? params.get('event') || undefined : undefined;
    const openCreate = tab === 'board' && params.get('new') === '1';
    const request = useMemo(() => ({ tab, nonce: 1, eventId }), [eventId, tab]);

    useEffect(() => {
        document.title = `${visualLabel(lang, tab)} - CounselorBot`;
    }, [lang, tab]);

    return <main className="page-narrow space-y-4 p-4">
        <PageHeader title={visualLabel(lang, tab)} />
        <JourneyOverview kind={GOAL_KIND[tab]} />
        <VisualTools
            personal
            hideTrigger
            fixedTab={tab}
            pageBackHref="/profilo"
            locale={lang}
            request={request}
            legacySession={params.get('session') || undefined}
            openCreate={openCreate}
        />
    </main>;
}
