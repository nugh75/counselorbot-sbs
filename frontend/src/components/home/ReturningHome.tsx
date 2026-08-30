'use client';

// Schermata iniziale di chi è già passato di qui: al posto della presentazione
// mostra il percorso — sessioni riprendibili, strumenti con il loro stato,
// taccuino, counselor e le scelte ricordate. Le fasi restano quelle di prima:
// da qui si entra nella stessa catena, con le decisioni già prese al loro posto.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { RotateCcw } from 'lucide-react';
import { QUESTIONNAIRE_LIST, QuestionnaireConfig, QuestionnaireType } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';
import { fetchCounselors, getSelectedCounselorId, subscribeToCounselor } from '@/lib/counselor';
import { clearFlowPrefs, getExperiencePref, getInputMethodPref, subscribeToFlowPrefs } from '@/lib/session-prefs';
import { LOCAL_RESUME_HREF, resumeHref, useResumeEntries } from '@/lib/use-resume-entries';

const STARTABLE: QuestionnaireType[] = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

interface Props {
    // Ultima compilazione per strumento, in ISO; assente = mai compilato.
    lastCompiledAt: Partial<Record<QuestionnaireType, string>>;
    notebookUpdatedAt: string | null;
    onStartInstrument: (questionnaire: QuestionnaireConfig) => void;
    onBrowseInstruments: () => void;
    onReviewNotebook: () => void;
    onChangeCounselor: () => void;
    onOpenIntro: () => void;
}

export function ReturningHome({
    lastCompiledAt,
    notebookUpdatedAt,
    onStartInstrument,
    onBrowseInstruments,
    onReviewNotebook,
    onChangeCounselor,
    onOpenIntro,
}: Props) {
    const { t, lang } = useI18n();
    const { frozen, localResume, count: resumeCount } = useResumeEntries();
    const [counselorInfo, setCounselorInfo] = useState<{ id: number; name: string } | null>(null);
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
            <header>
                <h1 className="font-display text-3xl font-bold text-slate-900">{t('base.title')}</h1>
                <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">{t('base.subtitle')}</p>
            </header>

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
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {t('base.instruments.title')}
                    </h2>
                    <button
                        type="button"
                        onClick={onBrowseInstruments}
                        className="text-sm font-medium text-indigo-700 hover:underline"
                    >
                        {t('base.browseAll')}
                    </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {instruments.map((q) => {
                        const done = lastCompiledAt[q.id];
                        return (
                            <button
                                key={q.id}
                                type="button"
                                onClick={() => onStartInstrument(q)}
                                className="glass-panel flex flex-col items-start gap-1 p-4 text-left transition-colors hover:border-indigo-300"
                            >
                                <span className="flex items-center gap-2">
                                    <span
                                        className={cn(
                                            'h-1.5 w-1.5 rounded-full',
                                            done ? 'bg-teal-500' : 'bg-slate-300',
                                        )}
                                    />
                                    <span className="font-bold text-slate-900">{q.name}</span>
                                </span>
                                <span className="text-sm leading-snug text-slate-600">{t(`q.${q.id}.fullName`)}</span>
                                <span className="mt-1 font-mono text-xs text-slate-500">
                                    {done ? t('base.instrument.doneOn', { date: formatDate(done) }) : t('base.instrument.todo')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
                <div>
                    <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                    <h3 className="mt-3 text-base font-bold text-slate-900">{t('base.notebook.title')}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {notebookUpdatedAt
                            ? t('base.notebook.updatedOn', { date: formatDate(notebookUpdatedAt) })
                            : t('base.notebook.empty')}
                    </p>
                    <button
                        type="button"
                        onClick={onReviewNotebook}
                        className="mt-1.5 text-sm font-medium text-indigo-700 hover:underline"
                    >
                        {t('base.notebook.action')}
                    </button>
                </div>

                <div>
                    <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                    <h3 className="mt-3 text-base font-bold text-slate-900">{t('base.counselor.title')}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {counselorName ?? t('base.counselor.none')}
                    </p>
                    <button
                        type="button"
                        onClick={onChangeCounselor}
                        className="mt-1.5 text-sm font-medium text-indigo-700 hover:underline"
                    >
                        {t('base.counselor.change')}
                    </button>
                </div>

                <div>
                    <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                    <h3 className="mt-3 text-base font-bold text-slate-900">{t('base.prefs.title')}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {prefsSummary || t('base.prefs.none')}
                    </p>
                    {prefsSummary && (
                        <button
                            type="button"
                            onClick={clearFlowPrefs}
                            className="mt-1.5 text-sm font-medium text-indigo-700 hover:underline"
                        >
                            {t('base.prefs.reset')}
                        </button>
                    )}
                </div>
            </section>

            <footer className="border-t border-slate-100 pt-6">
                <button
                    type="button"
                    onClick={onOpenIntro}
                    className="text-sm font-medium text-slate-500 hover:text-indigo-700"
                >
                    {t('base.about')}
                </button>
            </footer>
        </div>
    );
}
