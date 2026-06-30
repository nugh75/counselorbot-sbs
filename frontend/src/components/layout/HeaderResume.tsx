'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { RotateCcw } from 'lucide-react';
import { getResume, subscribeToResume } from '@/lib/resume';
import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';

// Pulsante "Riprendi" nell'header: compare quando c'è una chat interrotta e
// riporta dritto alla conversazione (/?resume=1). Disponibile da ogni pagina.
export function HeaderResume() {
    const { t } = useI18n();
    const hasResume = useSyncExternalStore(
        subscribeToResume,
        () => (getResume() ? '1' : null),
        () => null,
    );
    if (!hasResume) return null;

    return (
        <Tooltip content={t('header.resume')}>
            <Link href="/?resume=1" className="console-topbar-icon" aria-label={t('header.resume')} title={t('header.resume')}>
                <RotateCcw className="h-4 w-4" />
            </Link>
        </Tooltip>
    );
}
