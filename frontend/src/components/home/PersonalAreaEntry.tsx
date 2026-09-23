'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';

export function PersonalAreaEntry() {
    const { t } = useI18n();
    return (
        <section className="glass-panel space-y-3 p-5" aria-label={t('profile.nav')} data-testid="personal-area-entry">
            <h2 className="text-lg font-bold text-slate-900">{t('profile.nav')}</h2>
            <p className="text-sm leading-relaxed text-slate-600">{t('app.intro.compact.workspace.body')}</p>
            <Link href="/profilo" className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                {t('app.intro.compact.workspace.open')}
            </Link>
        </section>
    );
}
