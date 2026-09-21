'use client';

import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { GoalsPanel } from '@/components/goals/GoalsPanel';
import { useI18n } from '@/lib/i18n-context';
import { goalText } from '@/lib/i18n-goals';

export default function GoalsPage() {
    const { lang } = useI18n();
    return (
        <main className="page-wide space-y-5 px-4 py-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">{goalText(lang, 'goals')}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">{goalText(lang, 'intro')}</p>
                </div>
                <PreviousPageButton fallbackHref="/profilo" />
            </div>
            <GoalsPanel />
        </main>
    );
}
