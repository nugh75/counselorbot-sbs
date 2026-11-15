'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    const { t } = useI18n();
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <PageHeader title={t('error.title')} />
            <p className="text-ink-body">{t('error.body')}</p>
            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => retry()}>{t('error.retry')}</Button>
                <Link href="/profilo" className="inline-flex min-h-control items-center rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-body hover:bg-surface-raised">{t('error.back')}</Link>
            </div>
        </div>
    );
}
