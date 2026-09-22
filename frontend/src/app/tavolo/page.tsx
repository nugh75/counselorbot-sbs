'use client';

// L'elenco dei tavoli salvati. Lo strumento vive qui e nell'area personale:
// non si entra dal flusso di una conversazione, si apre un tavolo e ci si sta.

import { useI18n } from '@/lib/i18n-context';
import { TavoloList } from '@/components/tavolo/TavoloList';
import { tavoloLabel } from '@/lib/i18n-tavolo';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';

export default function TavoliPage() {
    const { lang } = useI18n();
    return (
        <main className="mx-auto max-w-3xl space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-slate-900">{tavoloLabel('all', lang)}</h1>
                <PreviousPageButton fallbackHref="/profilo/tavolo" />
            </div>
            <TavoloList />
        </main>
    );
}
