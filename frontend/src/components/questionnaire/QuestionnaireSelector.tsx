'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { QUESTIONNAIRE_LIST, QuestionnaireType, QuestionnaireConfig } from '@/lib/questionnaires';
import { AlertTriangle, ArrowRight, BookOpen, ClipboardList, MessageSquare } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const ACTIVE_QUESTIONNAIRES: QuestionnaireType[] = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

interface QuestionnaireSelectorProps {
    onSelect: (questionnaire: QuestionnaireConfig) => void;
}

export function QuestionnaireSelector({ onSelect }: QuestionnaireSelectorProps) {
    const { t, lang } = useI18n();
    const available = QUESTIONNAIRE_LIST.filter((q) => ACTIVE_QUESTIONNAIRES.includes(q.id));
    const upcoming = QUESTIONNAIRE_LIST.filter((q) => !ACTIVE_QUESTIONNAIRES.includes(q.id));

    return (
        <div className="space-y-6">
            <section className="glass-panel rounded-xl p-5 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex-1 max-w-3xl">
                        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700 mb-3">
                            <ClipboardList className="w-4 h-4" />
                            {t('selector.kicker')}
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('selector.title')}</h1>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                            {t('selector.intro')}
                        </p>
                    </div>
                    <Link
                        href="/questionario"
                        className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 hover:border-indigo-200 hover:bg-indigo-50 transition-colors lg:max-w-64"
                    >
                        <MessageSquare className="w-5 h-5 shrink-0 text-indigo-600" />
                        <div>
                            <div className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700">
                                {t('feedback.cta.title')}
                            </div>
                            <div className="text-xs text-slate-500">{t('feedback.cta.sub')}</div>
                        </div>
                    </Link>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">{t('selector.available.title')}</h2>
                    <p className="text-sm text-slate-500 mt-1">{t('selector.available.subtitle')}</p>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                    {available.map((q) => (
                        <article
                            key={q.id}
                            className="glass-panel rounded-xl p-4 flex flex-col gap-3"
                        >
                            <div className="flex items-start gap-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-md flex items-center justify-center text-2xl shrink-0",
                                    q.color.replace('bg-', 'bg-opacity-20 bg-'),
                                )}>
                                    {q.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-slate-800">{q.name}</h3>
                                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full">
                                            {t('selector.active')}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-600 mt-1">
                                        {t(`q.${q.id}.fullName`)}
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed grow">
                                {t(`q.${q.id}.description`)}
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                                <button
                                    onClick={() => onSelect(q)}
                                    className="group inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                                >
                                    {t('selector.start')}
                                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                </button>
                                <Link
                                    href={`/strumenti/${q.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors"
                                >
                                    <BookOpen className="w-4 h-4" />
                                    {t('selector.learn')}
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {(lang === 'en' || lang === 'sv') && (
                <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <AlertTriangle className="w-7 h-7 shrink-0 text-amber-700" />
                    <div className="flex-1">
                        <h2 className="font-bold text-amber-950">{t('administration.entry.title')}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-amber-900">{t('administration.entry.body')}</p>
                    </div>
                    <Link
                        href="/somministrazione"
                        className="inline-flex shrink-0 items-center gap-2 rounded-md bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 transition-colors"
                    >
                        {t('administration.entry.button')}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </section>
            )}

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
        </div>
    );
}
