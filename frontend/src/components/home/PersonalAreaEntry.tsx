'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n-context';
import { Card } from '@/components/ui/Card';

export function PersonalAreaEntry() {
    const { t } = useI18n();
    return (
        <section aria-label={t('app.intro.compact.workspace.title')} data-testid="personal-area-entry">
            <div className="flex items-center gap-4">
                <div className="relative h-14 w-14 shrink-0">
                    <Image src="/images/intro/tools.png" alt="" width={56} height={56} className="h-full w-full object-contain" />
                </div>
                <h2 className="text-lg font-semibold text-ink">{t('app.intro.compact.workspace.title')}</h2>
            </div>
            <Card className="mt-4 space-y-4 p-6">
                <p className="text-sm leading-relaxed text-ink-muted">{t('app.intro.compact.workspace.body')}</p>
                <Link href="/profilo" className="inline-flex min-h-control items-center rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover">
                    {t('app.intro.compact.workspace.open')}
                </Link>
            </Card>
        </section>
    );
}
