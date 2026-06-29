'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { QUESTIONNAIRE_LIST, QuestionnaireType, QuestionnaireConfig } from '@/lib/questionnaires';
import { AlertTriangle, ArrowRight, BookOpen, ChevronDown, ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';

const ACTIVE_QUESTIONNAIRES: QuestionnaireType[] = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];
const ADMINISTRATION_LANGS = ['en', 'es', 'sv'] as const;
const STRATEGIC_COMPETENCES_URLS: Partial<Record<QuestionnaireType, string>> = {
    QSA: 'https://www.competenzestrategiche.it/QSA/',
    QSAr: 'https://www.competenzestrategiche.it/QSAr/',
    QPCS: 'https://www.competenzestrategiche.it/QPCS/',
    QPCC: 'https://www.competenzestrategiche.it/QPCC/',
    ZTPI: 'https://www.competenzestrategiche.it/ZTPI/',
    QAP: 'https://www.competenzestrategiche.it/QAP/',
};

interface QuestionnaireSelectorProps {
    onSelect: (questionnaire: QuestionnaireConfig) => void;
    onBack?: () => void;
}

export function QuestionnaireSelector({ onSelect, onBack }: QuestionnaireSelectorProps) {
    const { t, lang, setLang } = useI18n();
    const [expanded, setExpanded] = useState<string | null>(null);
    const active = QUESTIONNAIRE_LIST.filter((q) => ACTIVE_QUESTIONNAIRES.includes(q.id));
    const upcoming = QUESTIONNAIRE_LIST.filter((q) => !ACTIVE_QUESTIONNAIRES.includes(q.id));
    // Competenze Strategiche = strumenti con assessment sul sito / in-app; Interviste = agentOnly (Savickas).
    const csQuestionnaires = active.filter((q) => !q.agentOnly);
    const interviews = active.filter((q) => q.agentOnly);
    const isItalian = lang === 'it';
    const isAdministrationLang = ADMINISTRATION_LANGS.includes(lang as 'en' | 'es' | 'sv');
    const isUnavailableQuestionnaireLang = lang === 'fr' || lang === 'de';

    // Card strumento, senza icona: testa (nome + badge + nome esteso), descrizione,
    // eventuali credenziali sito, dettaglio espandibile e azioni.
    const renderCard = (q: QuestionnaireConfig) => {
        const hasInAppAdministration = isAdministrationLang && !q.agentOnly;
        const externalAssessmentUrl = isItalian && !q.agentOnly ? STRATEGIC_COMPETENCES_URLS[q.id] : undefined;
        const hasExternalAssessment = Boolean(externalAssessmentUrl);
        const isExpanded = expanded === q.id;
        const primaryBadge = hasInAppAdministration
            ? t('selector.badge.inApp')
            : hasExternalAssessment
                ? t('selector.badge.external')
                : q.agentOnly
                    ? t('selector.badge.agent')
                    : t('selector.badge.results');
        return (
            <article key={q.id} className="glass-panel p-4 flex flex-col gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-800">{q.name}</h3>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full">
                            {t('selector.active')}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full">
                            {primaryBadge}
                        </span>
                        {hasInAppAdministration && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full">
                                {t('selector.experimentalBadge')}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-medium text-slate-600 mt-1">
                        {t(`q.${q.id}.fullName`)}
                    </p>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed grow">
                    {t(`q.${q.id}.description`)}
                </p>
                {hasExternalAssessment && (
                    <p className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
                        {t('selector.externalCredentials')}
                    </p>
                )}
                {isExpanded && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-600 space-y-2">
                        <div>
                            <span className="font-semibold text-slate-800">{t('detail.focus.title')}: </span>
                            {t(`detail.${q.id}.focus`)}
                        </div>
                        <div>
                            <span className="font-semibold text-slate-800">{t('detail.input.title')}: </span>
                            {t(`detail.${q.id}.input`)}
                        </div>
                        <div>
                            <span className="font-semibold text-slate-800">{t('detail.path.title')}: </span>
                            {t(`detail.${q.id}.path`)}
                        </div>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    {hasInAppAdministration ? (
                        <Link
                            href={`/somministrazione/${q.id}/${lang}`}
                            className="group inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                        >
                            {t('selector.completeQuestionnaire')}
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    ) : hasExternalAssessment ? (
                        <a
                            href={externalAssessmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                        >
                            {t('selector.openStrategic')}
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    ) : (
                        <button
                            onClick={() => onSelect(q)}
                            className="group inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                        >
                            {q.agentOnly ? t('selector.startInterview') : t('selector.enterResults')}
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                        </button>
                    )}
                    {(hasInAppAdministration || hasExternalAssessment) && (
                        <button
                            onClick={() => onSelect(q)}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            {t('selector.haveResults')}
                        </button>
                    )}
                    <Link
                        href={`/strumenti/${q.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors"
                    >
                        <BookOpen className="w-4 h-4" />
                        {t('selector.learn')}
                    </Link>
                    <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : q.id)}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors"
                    >
                        <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
                        {isExpanded ? t('selector.hide') : t('selector.expand')}
                    </button>
                </div>
            </article>
        );
    };

    return (
        <div className="space-y-8">
            {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}

            {isUnavailableQuestionnaireLang && (
                <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <AlertTriangle className="w-7 h-7 shrink-0 text-amber-700" />
                    <div className="flex-1">
                        <h2 className="font-bold text-amber-950">{t('selector.unavailable.title')}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-amber-900">{t('selector.unavailable.body')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setLang('en')}
                        className="inline-flex shrink-0 items-center gap-2 rounded-md bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 transition-colors"
                    >
                        {t('selector.unavailable.switchEnglish')}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </section>
            )}

            {/* 1. Questionari Competenze Strategiche */}
            {!isUnavailableQuestionnaireLang && (
                <section className="space-y-4">
                    <h2 className="text-xl font-bold text-slate-900">{t('selector.section.cs')}</h2>
                    <div className="grid md:grid-cols-2 gap-3">
                        {csQuestionnaires.map(renderCard)}
                    </div>
                </section>
            )}

            {/* 2. Interviste (Savickas) */}
            {!isUnavailableQuestionnaireLang && interviews.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-bold text-slate-900">{t('selector.section.interviews')}</h2>
                    <div className="grid md:grid-cols-2 gap-3">
                        {interviews.map(renderCard)}
                        <article className="glass-panel p-4 flex flex-col gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-bold text-slate-800">Cambiamenti del profilo</h3>
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full">
                                        {t('selector.badge.agent')}
                                    </span>
                                </div>
                                <p className="text-sm font-medium text-slate-600 mt-1">Riflessione sul tuo profilo nel tempo</p>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed grow">
                                Rivedi come e cambiato il tuo profilo e salva una riflessione personale.
                            </p>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Link
                                    href="/profilo/cambiamenti"
                                    className="group inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                                >
                                    Usa lo strumento
                                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                </Link>
                            </div>
                        </article>
                    </div>
                </section>
            )}

            {/* 3. Strumenti attivi (pQBL da PDF) */}
            <section className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{t('selector.section.active')}</h2>
                <div className="glass-panel p-5 flex flex-col sm:flex-row sm:items-center gap-4 border border-emerald-100">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800">{t('pqbl.card.title')}</h3>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full">
                                {t('pqbl.card.badge')}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{t('pqbl.card.desc')}</p>
                    </div>
                    <Link
                        href="/pqbl"
                        className="group inline-flex shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                    >
                        {t('pqbl.card.cta')}
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </section>

            {/* 4. In arrivo */}
            {!isUnavailableQuestionnaireLang && (
                <section className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="lg:w-52 shrink-0">
                        <h2 className="text-sm font-semibold text-slate-700">{t('selector.upcoming.title')}</h2>
                        <p className="text-xs text-slate-500 mt-1">{t('selector.upcoming.subtitle')}</p>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2 flex-1">
                        {upcoming.map((q) => (
                            <div key={q.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                                <span className="text-sm font-semibold text-slate-600">{q.name}</span>
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full">
                                    {t('selector.soon')}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
