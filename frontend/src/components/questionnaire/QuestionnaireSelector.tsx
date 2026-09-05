'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { QUESTIONNAIRE_LIST, QuestionnaireType, QuestionnaireConfig } from '@/lib/questionnaires';
import { AlertTriangle, BookOpen, Check, ChevronDown, ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { instrumentAvailableInLocale } from '@/lib/instrument-availability';
import { STRATEGIC_COMPETENCES_URLS } from '@/lib/questionnaire-sources';
import { ACTIVE_QUESTIONNAIRE_IDS, TOOL_CATEGORIES } from '@/lib/tool-catalog';
import { useInstrumentCatalog } from '@/lib/use-instrument-catalog';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';

interface QuestionnaireSelectorProps {
    onSelect: (questionnaire: QuestionnaireConfig) => void;
    onBack?: () => void;
    // Strumenti già compilati dallo studente: la card lo dice, così non si
    // rifà una scelta senza sapere cosa c'è già.
    completed?: QuestionnaireType[];
}

export function QuestionnaireSelector({ onSelect, onBack, completed = [] }: QuestionnaireSelectorProps) {
    const { t, lang, setLang } = useI18n();
    const router = useRouter();
    const [expanded, setExpanded] = useState<string | null>(null);
    // Selezione come nel CounselorSelector: si clicca la card per evidenziarla,
    // poi si avanza con la freccia in alto (nessuna azione "vai" per card).
    // La chiave è l'id strumento per i questionari, oppure 'pqbl' per la pagina
    // di allenamento da PDF.
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const { rows: instrumentCatalog, loading: catalogLoading, error: catalogError, retry: retryCatalog } = useInstrumentCatalog();
    const active = ACTIVE_QUESTIONNAIRE_IDS.map((id) => QUESTIONNAIRE_LIST.find((q) => q.id === id)).filter((q): q is QuestionnaireConfig => Boolean(q));
    const upcoming = QUESTIONNAIRE_LIST.filter((q) => !ACTIVE_QUESTIONNAIRE_IDS.includes(q.id));
    // Competenze Strategiche = strumenti con assessment sul sito / in-app; Interviste = agentOnly (Savickas).
    const csQuestionnaires = active.filter((q) => !q.agentOnly);
    // Idea non e' un'intervista e non ha un questionario dietro: sta per conto
    // suo, e resta disponibile anche nelle lingue in cui i questionari non ci sono.
    const focusTools = active.filter((q) => q.id === 'IDEA');
    const interviews = active.filter((q) => q.agentOnly && q.id !== 'IDEA');
    const hasPqbl = TOOL_CATEGORIES.some((group) => group.standaloneIds.includes('pqbl'));
    const isItalian = lang === 'it';
    const isAdministrationLang = instrumentCatalog?.some((row) => row.available_locales.includes(lang)) ?? false;
    const isUnavailableQuestionnaireLang = !isItalian && instrumentCatalog !== null && !isAdministrationLang;

    const handleContinue = () => {
        if (!selectedKey) return;
        if (selectedKey === 'pqbl') { router.push('/pqbl'); return; }
        const q = active.find((item) => item.id === selectedKey);
        if (q) onSelect(q);
    };

    // Card strumento, senza icona: testa (nome + badge + nome esteso), descrizione,
    // dettaglio espandibile, azioni ed eventuali credenziali sito.
    const renderCard = (q: QuestionnaireConfig) => {
        const hasInAppAdministration = !q.agentOnly
            && instrumentCatalog !== null
            && instrumentAvailableInLocale(instrumentCatalog, q.id, lang);
        const externalAssessmentUrl = isItalian && !q.agentOnly ? STRATEGIC_COMPETENCES_URLS[q.id] : undefined;
        const hasExternalAssessment = Boolean(externalAssessmentUrl);
        const isExpanded = expanded === q.id;
        const isSelected = selectedKey === q.id;
        const unavailableInCurrentLanguage = !isItalian
            && !q.agentOnly
            && instrumentCatalog !== null
            && !hasInAppAdministration;
        const primaryBadge = hasInAppAdministration
            ? t('selector.badge.inApp')
            : hasExternalAssessment
                ? t('selector.badge.external')
                : unavailableInCurrentLanguage
                    ? t('selector.badge.unavailableLanguage')
                    : q.agentOnly
                    ? t(q.id === 'IDEA' ? 'selector.badge.freeChat' : 'selector.badge.agent')
                    : t('selector.badge.results');
        return (
            <article
                key={q.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => setSelectedKey(q.id)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedKey(q.id);
                    }
                }}
                className={cn(
                    'glass-panel p-4 flex flex-col gap-3 relative cursor-pointer transition-colors',
                    isSelected ? 'ring-2 ring-indigo-400 border-indigo-300' : 'hover:border-indigo-200',
                )}
            >
                {isSelected && (
                    <div className="absolute right-3 top-3 rounded-full bg-indigo-600 p-1 text-white">
                        <Check className="h-3.5 w-3.5" />
                    </div>
                )}
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-800">{q.name}</h3>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-2xs font-bold rounded-full">
                            {t('selector.active')}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-2xs font-bold rounded-full">
                            {primaryBadge}
                        </span>
                        {hasInAppAdministration && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-2xs font-bold rounded-full">
                                {t('selector.experimentalBadge')}
                            </span>
                        )}
                        {completed.includes(q.id) && (
                            <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-2xs font-bold rounded-full">
                                {t('selector.badge.done')}
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
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    {hasInAppAdministration && (
                        <Link
                            href={`/somministrazione/${q.id}/${lang}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            {t('selector.completeQuestionnaire')}
                        </Link>
                    )}
                    {!hasInAppAdministration && hasExternalAssessment && (
                        <a
                            href={externalAssessmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            {t('selector.openStrategic')}
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    <Link
                        href={`/strumenti/${q.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors"
                    >
                        <BookOpen className="w-4 h-4" />
                        {t('selector.learn')}
                    </Link>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : q.id); }}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors"
                    >
                        <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
                        {isExpanded ? t('selector.hide') : t('selector.expand')}
                    </button>
                </div>
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
                {hasExternalAssessment && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                            <span className="font-semibold text-sky-700">{t('detail.assessment.codeLabel')}</span>
                            <span className="ml-2 font-bold">1087</span>
                        </div>
                        <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                            <span className="font-semibold text-sky-700">{t('detail.assessment.passwordLabel')}</span>
                            <span className="ml-2 font-bold">counselor</span>
                        </div>
                    </div>
                )}
            </article>
        );
    };

    return (
        <div className="space-y-8">
            <div className="sticky top-20 z-20 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700" aria-live="polite">
                    {selectedKey === 'pqbl' ? t('pqbl.card.title') : active.find((q) => q.id === selectedKey)?.name || t('flow.select')}
                </p>
                <ForwardButton onClick={handleContinue} disabled={!selectedKey} label={t('counselor.continue')} />
            </div>

            {!isItalian && catalogLoading && (
                <p className="text-sm text-slate-500" role="status">{t('base.catalog.loading')}</p>
            )}
            {!isItalian && catalogError && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                    <span>{t('base.catalog.error')}</span>
                    <button type="button" onClick={retryCatalog} className="font-semibold text-amber-950 underline underline-offset-2">
                        {t('base.catalog.retry')}
                    </button>
                </div>
            )}

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
                        className="inline-flex shrink-0 items-center rounded-md bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 transition-colors"
                    >
                        {t('selector.unavailable.switchEnglish')}
                    </button>
                </section>
            )}

            {/* 0. Mettere a fuoco un'idea */}
            {focusTools.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-bold text-slate-900">{t('selector.section.focus')}</h2>
                    <div className="grid md:grid-cols-2 gap-3">
                        {focusTools.map(renderCard)}
                    </div>
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
                    </div>
                </section>
            )}

            {/* 3. Strumenti attivi (pQBL da PDF) */}
            {hasPqbl && <section className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{t('selector.section.active')}</h2>
                <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedKey === 'pqbl'}
                    onClick={() => setSelectedKey('pqbl')}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedKey('pqbl');
                        }
                    }}
                    className={cn(
                        'glass-panel p-5 flex flex-col sm:flex-row sm:items-center gap-4 relative cursor-pointer transition-colors',
                        selectedKey === 'pqbl' ? 'ring-2 ring-indigo-400 border-indigo-300' : 'border border-indigo-100 hover:border-indigo-200',
                    )}
                >
                    {selectedKey === 'pqbl' && (
                        <div className="absolute right-3 top-3 rounded-full bg-indigo-600 p-1 text-white">
                            <Check className="h-3.5 w-3.5" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800">{t('pqbl.card.title')}</h3>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-2xs font-bold rounded-full">
                                {t('pqbl.card.badge')}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{t('pqbl.card.desc')}</p>
                    </div>
                </div>
            </section>}

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
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-2xs font-bold rounded-full">
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
