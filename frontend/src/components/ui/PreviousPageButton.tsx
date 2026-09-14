'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from './BackButton';

export function PreviousPageButton({ fallbackHref, beforeBack }: {
    fallbackHref: string;
    beforeBack?: () => Promise<unknown>;
}) {
    const router = useRouter();
    const { t } = useI18n();
    return <BackButton label={t('nav.back')} onClick={() => {
        void (async () => {
            try { await beforeBack?.(); }
            catch { return; }
            if (window.history.state?.cbPreviousPage && window.history.length > 1) router.back();
            else router.replace(fallbackHref);
        })();
    }} />;
}
