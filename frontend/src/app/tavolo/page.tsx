'use client';

// L'elenco dei tavoli salvati. Lo strumento vive qui e nell'area personale:
// non si entra dal flusso di una conversazione, si apre un tavolo e ci si sta.

import { useI18n } from '@/lib/i18n-context';
import { TavoloList } from '@/components/tavolo/TavoloList';
import { tavoloLabel } from '@/lib/i18n-tavolo';

export default function TavoliPage() {
    const { lang } = useI18n();
    return (
        <main className="mx-auto max-w-3xl space-y-4 p-4">
            <h1 className="text-lg font-semibold text-slate-800">{tavoloLabel('all', lang)}</h1>
            <TavoloList />
        </main>
    );
}
