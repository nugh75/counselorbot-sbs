'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';

export default function DataPrivacyPage() {
    const { t } = useI18n();
    return (
        <div className="page-narrow space-y-7">
            <h1 className="font-display text-2xl font-bold text-slate-900">{t('app.intro.compact.privacy.title')}</h1>
            {['local', 'external', 'access'].map(section => (
                <section key={section} className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900">{t(`app.intro.compact.privacy.${section}.title`)}</h2>
                    <p className="leading-relaxed text-slate-600">{t(`app.intro.compact.privacy.${section}.body`)}</p>
                </section>
            ))}
            <Link href="/?view=intro" className="inline-flex min-h-[44px] items-center font-medium text-indigo-700 underline underline-offset-2">{t('app.intro.compact.privacy.back')}</Link>
        </div>
    );
}
