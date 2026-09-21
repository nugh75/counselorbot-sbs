'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from './BackButton';

export function PreviousPageButton({
    fallbackHref,
    beforeBack,
    label,
    variant = 'icon',
    className,
}: {
    fallbackHref: string;
    beforeBack?: () => Promise<unknown>;
    label?: string;
    variant?: 'icon' | 'labelled';
    className?: string;
}) {
    const router = useRouter();
    const { t } = useI18n();
    return (
        <BackButton
            label={label ?? t('nav.back')}
            variant={variant}
            className={className}
            onClick={() => {
                void (async () => {
                    try { await beforeBack?.(); }
                    catch { return; }
                    if (
                        window.history.state?.cbPreviousPage &&
                        window.history.state.cbPreviousPage !== window.location.pathname &&
                        window.history.length > 1
                    ) {
                        router.back();
                    } else {
                        router.replace(fallbackHref);
                    }
                })();
            }}
        />
    );
}
