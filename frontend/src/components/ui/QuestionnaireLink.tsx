'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { instrumentAvailableInLocale } from '@/lib/instrument-availability';
import { questionnaireSource } from '@/lib/questionnaire-sources';
import { useInstrumentCatalog } from '@/lib/use-instrument-catalog';

// "Non ho ancora i punteggi": la risposta a quella domanda viveva solo nella
// card di scelta dello strumento e nella scheda, cioe' prima della scelta. Chi
// arriva dalla Bussola quella schermata non la vede mai (`/?start=<id>` entra
// dritto nel flusso), e chi e' gia' dentro non ha piu' modo di tornarci.
//
// Il ramo italiano manda al sito con le credenziali; le altre cinque lingue
// alla somministrazione in app. Per gli strumenti agent-only non c'e' nulla da
// compilare e il pannello non compare.
export function QuestionnaireLink({ instrument, className }: { instrument: string; className?: string }) {
    const { t, lang } = useI18n();
    const { rows } = useInstrumentCatalog();
    const source = questionnaireSource(instrument, lang);

    if (!source) return null;
    // Stessa condizione della card di scelta: la somministrazione in app compare
    // solo per le lingue in cui lo strumento e' davvero disponibile.
    if (source.kind === 'in-app' && (rows === null || !instrumentAvailableInLocale(rows, instrument, lang))) {
        return null;
    }

    return (
        <div className={`glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${className ?? ''}`}>
            <p className="text-sm text-slate-600">{t('questionnaire.source.hint')}</p>

            {source.kind === 'external' ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className="font-mono text-xs text-slate-600">
                        {t('detail.assessment.codeLabel')}: <strong className="text-slate-900">{source.code}</strong>
                        {' · '}
                        {t('detail.assessment.passwordLabel')}: <strong className="text-slate-900">{source.password}</strong>
                    </span>
                    <a
                        href={source.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-indigo-700"
                    >
                        {t('selector.openStrategic')}
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </div>
            ) : (
                <Link
                    href={source.href}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-indigo-700"
                >
                    {t('selector.completeQuestionnaire')}
                </Link>
            )}
        </div>
    );
}
