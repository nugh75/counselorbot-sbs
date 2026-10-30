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
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:h-control focus:items-center focus:rounded-control focus:bg-brand focus:px-4 focus:text-sm focus:font-semibold focus:text-ink-on-brand"
        >
            {t('nav.skipToContent')}
        </a>
    );
}
