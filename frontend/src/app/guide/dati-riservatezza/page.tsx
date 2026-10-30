'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { PageHeader } from '@/components/ui/PageHeader';

export default function DataPrivacyPage() {
    const { t } = useI18n();
    return (
        <div className="page-narrow space-y-8">
            <PageHeader title={t('app.intro.compact.privacy.title')} />
            {['local', 'external', 'retrieval', 'access'].map(section => (
                <section key={section} className="space-y-2">
                    <h2 className="text-lg font-semibold text-ink">{t(`app.intro.compact.privacy.${section}.title`)}</h2>
                    <p className="leading-relaxed text-ink-muted">{t(`app.intro.compact.privacy.${section}.body`)}</p>
                </section>
            ))}
            <Link href="/?view=intro" className="inline-flex min-h-control items-center text-link underline underline-offset-2">{t('app.intro.compact.privacy.back')}</Link>
        </div>
    );
}
