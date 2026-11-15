'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/lib/i18n-context';

export default function NotFound() {
    const { t } = useI18n();
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <PageHeader title={t('notFound.title')} />
            <p className="text-ink-body">{t('notFound.body')}</p>
            <Link href="/profilo" className="inline-flex min-h-control items-center rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover">{t('error.back')}</Link>
        </div>
    );
}
