'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n-context';

export function PersonalAreaEntry() {
    const { t } = useI18n();
    return (
        <section className="glass-panel space-y-3 p-5" aria-label={t('app.intro.compact.workspace.title')} data-testid="personal-area-entry">
            <div className="flex items-center gap-3"><Image src="/images/intro/tools.png" alt="" width={56} height={56} /><h2 className="text-lg font-bold text-slate-900">{t('app.intro.compact.workspace.title')}</h2></div>
            <p className="text-sm leading-relaxed text-slate-600">{t('app.intro.compact.workspace.body')}</p>
            <Link href="/profilo" className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                {t('app.intro.compact.workspace.open')}
            </Link>
        </section>
    );
}
