'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';

export function CompassEntry({ onOpen }: { onOpen?: () => void }) {
    const { t } = useI18n();
    const className = 'relative flex w-full cursor-pointer flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:flex-row sm:items-center';
    const content = <>
        <Image src="/images/intro/compass.png" alt="" width={144} height={144} sizes="96px" className="h-18 w-18 shrink-0 self-center object-contain sm:h-24 sm:w-24" />
        <div>
            <h3 className="font-display text-lg font-bold text-slate-900">{t('app.intro.action.compass.label')}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('app.intro.action.compass.desc')}</p>
            <span className="mt-3 inline-flex min-h-11 items-center font-semibold text-indigo-700">{t('app.intro.action.compass.open')}</span>
        </div>
    </>;
    return onOpen
        ? <button type="button" onClick={onOpen} className={className} data-testid="compass-entry">{content}</button>
        : <Link href="/bussola" className={className} data-testid="compass-entry">{content}</Link>;
}
