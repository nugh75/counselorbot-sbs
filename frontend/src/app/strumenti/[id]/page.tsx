'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { QUESTIONNAIRES, QuestionnaireType } from '@/lib/questionnaires';
import { getTestAdministration, AdministrationLocale } from '@/lib/test-administrations';
import { useI18n } from '@/lib/i18n-context';

const AVAILABLE_INSTRUMENTS: QuestionnaireType[] = ['QSA', 'QSAr', 'QPCS', 'QPCC', 'ZTPI', 'QAP', 'SAVICKAS'];
const STRATEGIC_COMPETENCES_URLS: Partial<Record<QuestionnaireType, string>> = {
    QSA: 'https://www.competenzestrategiche.it/QSA/',
    QSAr: 'https://www.competenzestrategiche.it/QSAr/',
    QPCS: 'https://www.competenzestrategiche.it/QPCS/',
    QPCC: 'https://www.competenzestrategiche.it/QPCC/',
    ZTPI: 'https://www.competenzestrategiche.it/ZTPI/',
    QAP: 'https://www.competenzestrategiche.it/QAP/',
};
const QUESTIONNAIRE_SELECTION_HREF = '/?view=questionnaires';

export default function InstrumentDetailsPage() {
    const { t, lang } = useI18n();
    const params = useParams<{ id: string }>();
    const id = params.id as QuestionnaireType;
    const questionnaire = AVAILABLE_INSTRUMENTS.includes(id) ? QUESTIONNAIRES[id] : null;
    const assessmentUrl = lang === 'it' ? STRATEGIC_COMPETENCES_URLS[id] : undefined;
    // Surface the in-app questionnaire under validation. en/es/sv use their own
    // locale; Italian also shows the English version (default) for completeness.
    const inAppLocale: AdministrationLocale | null =
        lang === 'en' || lang === 'es' || lang === 'sv' ? lang
            : lang === 'it' ? 'en'
                : null;
    const inAppAdministration = inAppLocale && getTestAdministration(id, inAppLocale) ? inAppLocale : null;
    const isEnglishFallback = lang === 'it' && inAppAdministration === 'en';

    if (!questionnaire) {
        return (
            <div className="max-w-xl mx-auto glass-panel p-8 text-center space-y-4">
                <h1 className="text-xl font-bold text-slate-900">{t('detail.unavailable.title')}</h1>
                <p className="text-slate-600">{t('detail.unavailable.body')}</p>
                <div className="flex items-center justify-center gap-3">
                    <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('detail.back')} />
                </div>
            </div>
        );
    }

    return (
        <div className="page-narrow space-y-6">
            <div className="flex items-center gap-3">
                <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('detail.back')} />
                <ForwardButton href={`/?start=${questionnaire.id}`} label={t('selector.start')} />
            </div>

            <section className="glass-panel p-6 sm:p-8">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-indigo-700">{t('detail.kicker')}</span>
                <h1 className="font-display mt-1 text-3xl font-bold text-slate-900">{questionnaire.name}</h1>
                <p className="mt-1 text-lg text-slate-700">{t(`q.${questionnaire.id}.fullName`)}</p>
                <p className="mt-3 text-slate-600 leading-relaxed">{t(`q.${questionnaire.id}.description`)}</p>
            </section>

            <div className="grid md:grid-cols-3 gap-6">
                {(['focus', 'path', 'input'] as const).map((topic) => (
                    <div key={topic}>
                        <span className="block h-0.5 w-10 rounded-full bg-indigo-500" />
                        <h2 className="mt-3 text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                            {t(`detail.${topic}.title`)}
                        </h2>
                        <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                            {t(`detail.${questionnaire.id}.${topic}`)}
                        </p>
                    </div>
                ))}
            </div>

            {inAppAdministration && (
                <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 flex flex-col md:flex-row md:items-center gap-5">
                    <div className="flex-1">
                        <h2 className="font-semibold text-amber-950">
                            {t(isEnglishFallback ? 'detail.assessment.inapp.englishTitle' : 'detail.assessment.inapp.title')}
                        </h2>
                        <p className="text-sm text-amber-900 mt-1 leading-relaxed">
                            {t(isEnglishFallback ? 'detail.assessment.inapp.englishBody' : 'detail.assessment.inapp.body')}
                        </p>
                    </div>
                    <Link
                        href={`/somministrazione/${id}/${inAppAdministration}`}
                        className="inline-flex shrink-0 items-center justify-center rounded-md bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 transition-colors"
                    >
                        {t(isEnglishFallback ? 'detail.assessment.inapp.englishLink' : 'detail.assessment.inapp.link')}
                    </Link>
                </section>
            )}

            {assessmentUrl && (
                <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 flex flex-col md:flex-row md:items-center gap-5">
                    <div className="flex-1">
                        <h2 className="font-semibold text-slate-900">{t('detail.assessment.title')}</h2>
                        <p className="text-sm text-slate-700 mt-1 leading-relaxed">{t('detail.assessment.body')}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
                        <div className="rounded-md border border-sky-200 bg-white px-4 py-2 text-sm text-slate-700">
                            {t('detail.assessment.codeLabel')}: <strong className="text-lg text-slate-900">1087</strong>
                        </div>
                        <div className="rounded-md border border-sky-200 bg-white px-4 py-2 text-sm text-slate-700">
                            {t('detail.assessment.passwordLabel')}: <strong className="text-lg text-slate-900">counselor</strong>
                        </div>
                        <a
                            href={assessmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 transition-colors"
                        >
                            {t('detail.assessment.link')}
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                </section>
            )}

            <section className="rounded-xl bg-indigo-50 border border-indigo-100 p-5">
                <p className="text-sm text-indigo-900">{t('detail.ready')}</p>
            </section>
        </div>
    );
}
