'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { GoalsPanel } from '@/components/goals/GoalsPanel';
import { useI18n } from '@/lib/i18n-context';
import { goalText } from '@/lib/i18n-goals';

export default function GoalsPage() {
    const { lang } = useI18n();
    return (
        <main className="page-wide space-y-5 px-4 py-8">
            <PageHeader backHref="/profilo" title={goalText(lang, 'goals')} subtitle={goalText(lang, 'intro')} />
            <GoalsPanel />
        </main>
    );
}
