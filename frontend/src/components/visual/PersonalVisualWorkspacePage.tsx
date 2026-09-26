'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { PersonalTimeline } from '@/components/visual/PersonalTimeline';
import { VisualTools, type WorkTab } from '@/components/visual/VisualTools';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';

// Lotto 2 dell'audit Area personale: la testata comune 0.3 su ogni pagina.
const TAB_SLUGS = { timeline: 'timeline', board: 'azioni', cards: 'carte', comparison: 'confronto' } as const;

export function PersonalVisualWorkspacePage({ tab }: { tab: WorkTab }) {
    const params = useSearchParams();
    const { lang } = useI18n();
    const eventId = tab === 'timeline' ? params.get('event') || undefined : undefined;
    const openCreate = tab === 'board' && params.get('new') === '1';
    const request = useMemo(() => ({ tab, nonce: 1, eventId }), [eventId, tab]);

    useEffect(() => {
        document.title = `${visualLabel(lang, tab)} - CounselorBot`;
    }, [lang, tab]);

    if (tab === 'timeline') return <main className="page-narrow space-y-4 p-4">
        <PersonalAreaHeader slug="timeline" />
        {/* Il pannello «Obiettivi collegati» è omesso: l'accesso agli obiettivi
            è già garantito dalla barra (+ Obiettivo) e dalle voci nell'elenco. */}
        <PersonalTimeline locale={lang} />
    </main>;

    return <main className="page-narrow space-y-4 p-4">
        <PersonalAreaHeader slug={TAB_SLUGS[tab]} />
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
