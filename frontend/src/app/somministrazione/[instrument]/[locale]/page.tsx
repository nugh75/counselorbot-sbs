'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n-context';
import type { Lang } from '@/lib/i18n';
import { QuestionnaireRunner } from '@/components/administration/QuestionnaireRunner';
import { getTestAdministration, AdministrationInstrument } from '@/lib/test-administrations';

const INVALID_COPY: Record<Lang, { title: string; body: string; back: string }> = {
    it: { title: 'Somministrazione non disponibile', body: 'Scegli uno strumento valido in inglese, spagnolo o svedese.', back: 'Torna alle somministrazioni di test' },
    en: { title: 'Test administration unavailable', body: 'Choose a valid instrument in English, Spanish or Swedish.', back: 'Back to test administrations' },
    es: { title: 'Administración no disponible', body: 'Elige un instrumento válido en inglés, español o sueco.', back: 'Volver a las administraciones de prueba' },
    fr: { title: 'Passation indisponible', body: 'Choisissez un instrument valide en anglais, espagnol ou suédois.', back: 'Retour aux passations de test' },
    de: { title: 'Testdurchführung nicht verfügbar', body: 'Wählen Sie ein gültiges Instrument auf Englisch, Spanisch oder Schwedisch.', back: 'Zurück zu den Testdurchführungen' },
    sv: { title: 'Testgenomförande inte tillgängligt', body: 'Välj ett giltigt instrument på engelska, spanska eller svenska.', back: 'Tillbaka till testgenomföranden' },
};

export default function AdministrationPage() {
    const { lang } = useI18n();
    const params = useParams<{ instrument: string; locale: string }>();
    const copy = getTestAdministration(params.instrument, params.locale);
    const valid: AdministrationInstrument[] = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];

    if (
        !copy
        || !valid.includes(params.instrument as AdministrationInstrument)
        || (params.locale !== 'en' && params.locale !== 'es' && params.locale !== 'sv')
    ) {
        const text = INVALID_COPY[lang];
        return (
            <section className="glass-panel max-w-xl mx-auto rounded-xl p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-slate-900">{text.title}</h1>
                <p className="text-slate-600">{text.body}</p>
                <Link href="/somministrazione" className="font-semibold text-indigo-700 hover:text-indigo-900">
                    {text.back}
                </Link>
            </section>
        );
    }

    return <QuestionnaireRunner copy={copy} instrument={params.instrument as AdministrationInstrument} locale={params.locale as 'en' | 'es' | 'sv'} />;
}
