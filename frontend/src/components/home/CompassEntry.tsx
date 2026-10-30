'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';

export function CompassEntry({ onOpen }: { onOpen?: () => void }) {
    const { t } = useI18n();
    const { access, loading } = useUserAccess();
    if (loading || !isToolAllowed(access, 'bussola')) return null;
    const className = 'relative flex w-full cursor-pointer flex-col gap-4 rounded-card border border-line bg-surface p-6 text-left transition-colors hover:border-brand-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:flex-row sm:items-center';
    const content = <>
        <Image src="/images/intro/compass.png" alt="" width={144} height={144} sizes="96px" className="h-18 w-18 shrink-0 self-center object-contain sm:h-24 sm:w-24" />
        <div>
            <h3 className="font-display text-lg font-semibold text-ink">{t('app.intro.action.compass.label')}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('app.intro.action.compass.desc')}</p>
            <span className="mt-4 inline-flex min-h-control items-center font-semibold text-link">{t('app.intro.action.compass.open')}</span>
        </div>
    </>;
    return onOpen
        ? <button type="button" onClick={onOpen} className={className} data-testid="compass-entry">{content}</button>
        : <Link href="/bussola" className={className} data-testid="compass-entry">{content}</Link>;
}
