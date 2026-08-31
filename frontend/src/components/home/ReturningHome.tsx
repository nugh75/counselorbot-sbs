'use client';

// Schermata iniziale di chi è già passato di qui: mostra subito le scelte attive,
// le sessioni riprendibili e l'intero catalogo degli strumenti con descrizioni.
// Le aree personali restano nella pagina personale, non in questa home.

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BookOpen, RotateCcw } from 'lucide-react';
import { QUESTIONNAIRE_LIST, QuestionnaireConfig, QuestionnaireType } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';
import { fetchCounselors, getSelectedCounselorId, subscribeToCounselor } from '@/lib/counselor';
import { clearFlowPrefs, getExperiencePref, getInputMethodPref, subscribeToFlowPrefs } from '@/lib/session-prefs';
import { LOCAL_RESUME_HREF, resumeHref, useResumeEntries } from '@/lib/use-resume-entries';
import { CompassMark } from '@/components/ui/CompassMark';
import { fetchInstruments, type InstrumentSummary } from '@/lib/instruments-api';
import { instrumentAvailableInLocale } from '@/lib/instrument-availability';

const STARTABLE: QuestionnaireType[] = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP', 'IDEA'];

interface Props {
    // Ultima compilazione per strumento, in ISO; assente = mai compilato.
    lastCompiledAt: Partial<Record<QuestionnaireType, string>>;
    onStartInstrument: (questionnaire: QuestionnaireConfig) => void;
    onChangeCounselor: () => void;
    onOpenIntro: () => void;
}

export function ReturningHome({
    lastCompiledAt,
    onStartInstrument,
    onChangeCounselor,
    onOpenIntro,
}: Props) {
    const { t, lang } = useI18n();
    const { frozen, localResume, count: resumeCount } = useResumeEntries();
    const [counselorInfo, setCounselorInfo] = useState<{ id: number; name: string } | null>(null);
    const [instrumentCatalog, setInstrumentCatalog] = useState<InstrumentSummary[] | null>(null);
    const counselorId = useSyncExternalStore(
        subscribeToCounselor,
        () => getSelectedCounselorId(),
        () => null,
    );
    const prefsVersion = useSyncExternalStore(
        subscribeToFlowPrefs,
        () => `${getInputMethodPref() ?? ''}|${getExperiencePref() ?? ''}`,
        () => '|',
    );
    const [method, experience] = prefsVersion.split('|');

    useEffect(() => {
        let alive = true;
        fetchInstruments()
            .then((rows) => { if (alive) setInstrumentCatalog(rows); })
            .catch(() => { if (alive) setInstrumentCatalog([]); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (counselorId == null) return;
        let alive = true;
        fetchCounselors(lang)
            .then((rows) => {
                if (!alive) return;
                const name = rows.find((c) => c.id === counselorId)?.name;
                if (name) setCounselorInfo({ id: counselorId, name });
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [counselorId, lang]);

    const counselorName = counselorInfo?.id === counselorId ? counselorInfo.name : null;
    const formatDate = (iso: string) => new Date(iso).toLocaleDateString(lang);
    const instruments = QUESTIONNAIRE_LIST.filter((q) => STARTABLE.includes(q.id));
    const prefsSummary = [
        method === 'manual' ? t('method.manual.title') : method === 'upload' ? t('method.upload.title') : null,
        experience === 'standard' ? t('guided.mode.guided') : experience === 'opencode' ? t('guided.mode.sandbox') : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className="space-y-10 py-2">
            <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="font-display text-3xl font-bold text-slate-900">{t('base.title')}</h1>
                    <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">{t('base.subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={onOpenIntro}
                    className="inline-flex shrink-0 items-center gap-2 self-start rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                >
                    <CompassMark className="h-5 w-5" />
                    {t('base.about')}
                </button>
            </header>

            <section className="grid gap-4 border-y border-slate-100 py-6 sm:grid-cols-2">
                <div>
                    <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                    <h2 className="mt-3 text-base font-bold text-slate-900">{t('base.counselor.title')}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {counselorName ?? t('base.counselor.none')}
                    </p>
                    <button
                        type="button"
                        onClick={onChangeCounselor}
                        className="mt-1.5 text-sm font-medium text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                    >
                        {t('base.counselor.change')}
                    </button>
                </div>

                <div>
                    <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                    <h2 className="mt-3 text-base font-bold text-slate-900">{t('base.prefs.title')}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {prefsSummary || t('base.prefs.none')}
                    </p>
                    {prefsSummary && (
                        <button
                            type="button"
                            onClick={clearFlowPrefs}
                            className="mt-1.5 text-sm font-medium text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                        >
                            {t('base.prefs.reset')}
                        </button>
                    )}
                </div>
            </section>

            {resumeCount > 0 && (
                <section>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {t('frozen.resumeTitle')}
                    </h2>
                    <div className="mt-3 space-y-2">
                        {frozen.map((row) => (
                            <a
                                key={row.session_id}
                                href={resumeHref(row)}
                                className="glass-panel flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-indigo-300"
                            >
                                <RotateCcw className="h-4 w-4 shrink-0 text-indigo-600" />
                                <span className="truncate">{row.label || row.questionnaire_type}</span>
                            </a>
                        ))}
                        {localResume && (
                            <a
                                href={LOCAL_RESUME_HREF}
                                className="glass-panel flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-indigo-300"
                            >
                                <RotateCcw className="h-4 w-4 shrink-0 text-indigo-600" />
                                <span className="truncate">{t('header.resume')} · {localResume.instrument}</span>
                            </a>
                        )}
                    </div>
                </section>
            )}

            <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('base.instruments.title')}
                </h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {instruments.map((q) => {
                        const done = lastCompiledAt[q.id];
                        const canCompleteQuestionnaire = (
                            lang !== 'it'
                            && !q.agentOnly
                            && instrumentCatalog !== null
                            && instrumentAvailableInLocale(instrumentCatalog, q.id, lang)
                        );
                        return (
                            <article
                                key={q.id}
                                className="glass-panel flex flex-col gap-3 p-5 text-left transition-colors hover:border-indigo-300"
                            >
                                <div>
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span
                                            className={cn(
                                                'h-1.5 w-1.5 rounded-full',
                                                done ? 'bg-teal-500' : 'bg-slate-300',
                                            )}
                                        />
                                        <span className="font-bold text-slate-900">{q.name}</span>
                                        {done && (
                                            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                                                {t('selector.badge.done')}
                                            </span>
                                        )}
                                    </span>
                                    <h3 className="mt-1 text-sm font-medium leading-snug text-slate-600">
                                        {t(`q.${q.id}.fullName`)}
                                    </h3>
                                </div>
                                <p className="grow text-sm leading-relaxed text-slate-500">
                                    {t(`q.${q.id}.description`)}
                                </p>
                                <span className="font-mono text-xs text-slate-500">
                                    {done ? t('base.instrument.doneOn', { date: formatDate(done) }) : t('base.instrument.todo')}
                                </span>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    {canCompleteQuestionnaire && (
                                        <Link
                                            href={`/somministrazione/${q.id}/${lang}`}
                                            className="inline-flex items-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                                        >
                                            {t('selector.completeQuestionnaire')}
                                        </Link>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onStartInstrument(q)}
                                        className={cn(
                                            'inline-flex items-center rounded-md px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                                            canCompleteQuestionnaire
                                                ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                                : 'bg-indigo-600 text-white hover:bg-indigo-700',
                                        )}
                                    >
                                        {t('selector.useTool')}
                                    </button>
                                    <Link
                                        href={`/strumenti/${q.id}`}
                                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                                    >
                                        <BookOpen className="h-4 w-4" />
                                        {t('selector.learn')}
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
