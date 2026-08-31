'use client';

// Guida all'interfaccia: una pagina statica e tradotta che spiega, sezione per
// sezione, le schermate principali di CounselorBot. I testi vivono in i18n
// (chiavi `guide.*`) nelle sei lingue.

import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/lib/i18n-context';

const SECTION_COUNT = 9;

export default function GuidePage() {
    const { t } = useI18n();
    const sections = Array.from({ length: SECTION_COUNT }, (_, i) => i + 1);

    return (
        <div className="page-narrow space-y-8">
            <PageHeader title={t('guide.title')} subtitle={t('guide.subtitle')} backHref="/" backLabel={t('guide.back')} />

            <ol className="space-y-4">
                {sections.map((n) => (
                    <li key={n} className="glass-panel flex gap-4 p-5 text-left">
                        <span className="font-mono text-sm font-semibold text-ochre-500 shrink-0 pt-0.5">
                            {String(n).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                            <h2 className="font-bold text-slate-900">{t(`guide.section${n}.title`)}</h2>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                                {t(`guide.section${n}.body`)}
                            </p>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
