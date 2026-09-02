'use client';

import { useI18n } from '@/lib/i18n-context';

// Primo elemento focalizzabile della pagina. La topbar arriva a dodici icone e
// va attraversata tutta a ogni cambio pagina: senza questo salto la tastiera non
// ha una scorciatoia verso il contenuto. Invisibile finché non riceve il fuoco.
export function SkipLink() {
    const { t } = useI18n();
    return (
        <a
            href="#contenuto"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:inline-flex focus:h-11 focus:items-center focus:rounded-md focus:bg-indigo-600 focus:px-4 focus:text-sm focus:font-semibold focus:text-white"
        >
            {t('nav.skipToContent')}
        </a>
    );
}
