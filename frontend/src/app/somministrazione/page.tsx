'use client';

import Link from 'next/link';
import { ArrowRight, Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { Callout } from '@/components/ui/Callout';
import type { Lang } from '@/lib/i18n';
import { INSTRUMENT_NAMES, INSTRUMENT_ITEM_COUNTS, AdministrationInstrument } from '@/lib/test-administrations';

const instruments: { id: AdministrationInstrument }[] = [
    { id: 'QSA' },
    { id: 'QSAr' },
    { id: 'ZTPI' },
    { id: 'QPCS' },
    { id: 'QPCC' },
    { id: 'QAP' },
];

const BLOCKED_COPY: Record<Lang, { title: string; body: string; back: string }> = {
    it: {
        title: 'Somministrazioni di test',
        body: 'Questa pagina è disponibile solo con interfaccia in inglese, spagnolo o svedese. Seleziona English, Español o Svenska dal menu della lingua.',
        back: 'Torna a CounselorBot',
    },
    en: {
        title: 'Test administrations',
        body: 'This page is only available when using the English, Spanish or Swedish interface. Select English, Español or Svenska from the language menu.',
        back: 'Back to CounselorBot',
    },
    es: {
        title: 'Administraciones de prueba',
        body: 'Esta página solo está disponible con la interfaz en inglés, español o sueco. Selecciona English, Español o Svenska en el menú de idioma.',
        back: 'Volver a CounselorBot',
    },
    fr: {
        title: 'Passations de test',
        body: "Cette page est disponible uniquement avec l'interface en anglais, espagnol ou suédois. Sélectionnez English, Español ou Svenska dans le menu de langue.",
        back: 'Retour à CounselorBot',
    },
    de: {
        title: 'Testdurchführungen',
        body: 'Diese Seite ist nur mit englischer, spanischer oder schwedischer Benutzeroberfläche verfügbar. Wählen Sie im Sprachmenü English, Español oder Svenska.',
        back: 'Zurück zu CounselorBot',
    },
    sv: {
        title: 'Testgenomföranden',
        body: 'Den här sidan är bara tillgänglig med engelskt, spanskt eller svenskt gränssnitt. Välj English, Español eller Svenska i språkmenyn.',
        back: 'Tillbaka till CounselorBot',
    },
};

const PAGE_COPY = {
    en: {
        badge: 'Test administrations',
        title: 'English',
        intro: 'Select an instrument to test its questionnaire administration interface.',
        warningTitle: 'Important:',
        warningBody: 'These administrations are provided only for testing instrument adaptations. The profile produced after submission is an experimental raw-frequency preview, not a validated or normative result.',
        draft: 'Item wording and factor structures are provisional working drafts requiring scientific and linguistic review before any pilot or validation collection.',
        items: 'items',
        open: 'English test version',
        back: 'Back to CounselorBot',
    },
    sv: {
        badge: 'Testgenomföranden',
        title: 'Svenska',
        intro: 'Välj ett instrument för att testa dess gränssnitt för frågeformuläret.',
        warningTitle: 'Viktigt:',
        warningBody: 'Dessa genomföranden tillhandahålls endast för att testa instrumentanpassningar. Profilen som visas efter inskickning är en experimentell förhandsvisning av råa frekvenser, inte ett validerat eller normativt resultat.',
        draft: 'Påståendenas formulering och faktorstrukturer är preliminära arbetsutkast som kräver vetenskaplig och språklig granskning före pilot- eller valideringsinsamling.',
        items: 'påståenden',
        open: 'Svensk testversion',
        back: 'Tillbaka till CounselorBot',
    },
    es: {
        badge: 'Administraciones de prueba',
        title: 'Español',
        intro: 'Selecciona un instrumento para probar su interfaz de administracion.',
        warningTitle: 'Importante:',
        warningBody: 'Estas administraciones sirven para probar adaptaciones de instrumentos. El perfil producido tras el envio es una vista experimental, no un resultado validado o normativo.',
        draft: 'La redaccion de los items y las estructuras factoriales son versiones de trabajo que requieren revision cientifica y linguistica antes de cualquier recogida piloto o de validacion.',
        items: 'items',
        open: 'Version espanola de prueba',
        back: 'Volver a CounselorBot',
    },
};

export default function TestAdministrationsPage() {
    const { lang } = useI18n();

    if (lang !== 'en' && lang !== 'es' && lang !== 'sv') {
        const copy = BLOCKED_COPY[lang];
        return (
            <div className="page-narrow space-y-6">
                <header className="glass-panel p-6 sm:p-8 space-y-3">
                    <h1 className="text-2xl font-bold text-slate-900">{copy.title}</h1>
                    <p className="text-slate-600">{copy.body}</p>
                </header>
                <Link href="/" className="inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                    {copy.back}
                </Link>
            </div>
        );
    }

    const copy = PAGE_COPY[lang];

    return (
        <div className="page-narrow space-y-6">
            <header className="glass-panel p-6 sm:p-8 space-y-3">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    <Languages className="w-4 h-4" />
                    {copy.badge}
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{copy.title}</h1>
                <p className="text-slate-600">{copy.intro}</p>
            </header>

            <Callout variant="warning" title={copy.warningTitle}>{copy.warningBody}</Callout>

            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
                {copy.draft}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
                {instruments.map(({ id }) => {
                    const name = INSTRUMENT_NAMES[id];
                    const itemCount = INSTRUMENT_ITEM_COUNTS[id];
                    const title = name[lang];
                    return (
                        <section key={id} className="glass-panel p-5 space-y-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{id}</h2>
                                <p className="mt-1 text-sm text-slate-700">{title}</p>
                                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {itemCount} {copy.items}
                                </p>
                            </div>
                            <div className="flex flex-col gap-2">
                                {lang === 'en' && (
                                    <Link
                                        href={`/somministrazione/${id}/en`}
                                        className="inline-flex items-center justify-between rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                                    >
                                        {copy.open}
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                )}
                                {lang === 'es' && (
                                    <Link
                                        href={`/somministrazione/${id}/es`}
                                        className="inline-flex items-center justify-between rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                                    >
                                        {copy.open}
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                )}
                                {lang === 'sv' && (
                                    <Link
                                        href={`/somministrazione/${id}/sv`}
                                        className="inline-flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                                    >
                                        {copy.open}
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>

            <Link href="/" className="inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                {copy.back}
            </Link>
        </div>
    );
}
