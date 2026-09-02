'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
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
//
// Impaginazione verticale, e non una riga con i blocchi affiancati: il pannello
// vive sia a piena larghezza (inserimento punteggi) sia dentro una card della
// Bussola larga ~340px in una griglia a tre colonne. Li' l'impaginazione
// orizzontale collassava e le etichette in mono andavano a capo una parola per
// riga. Il mono resta sui due valori, che sono dati, non sulle etichette.
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

    const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-indigo-700';

    return (
        <div className={cn('rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2', className)}>
            <p className="text-sm text-slate-600">{t('questionnaire.source.hint')}</p>

            {source.kind === 'external' ? (
                <>
                    <a href={source.href} target="_blank" rel="noopener noreferrer" className={action}>
                        {t('selector.openStrategic')}
                        <ExternalLink className="h-4 w-4 shrink-0" />
                    </a>
                    <p className="text-xs leading-relaxed text-slate-500">
                        {t('detail.assessment.codeLabel')}: <strong className="font-mono text-slate-900">{source.code}</strong>
                        {' · '}
                        {t('detail.assessment.passwordLabel')}: <strong className="font-mono text-slate-900">{source.password}</strong>
                    </p>
                </>
            ) : (
                <Link href={source.href} className={action}>
                    {t('selector.completeQuestionnaire')}
                </Link>
            )}
        </div>
    );
}
