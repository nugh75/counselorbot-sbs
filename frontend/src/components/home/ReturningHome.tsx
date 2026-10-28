'use client';

// «Attività e percorsi»: catalogo e strumenti personali precedono le attività
// da riprendere. Qui è confluito l'ex catalogo strumenti (avviso dopo il fiocco,
// chat in pausa, consigli, compilazione sul sito, strumenti in arrivo).
// Le aree personali restano nella pagina personale, non in questa home.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CompassEntry } from '@/components/home/CompassEntry';
import { resumeLabel } from '@/lib/resume-label';
import { PersonalAreaEntry } from '@/components/home/PersonalAreaEntry';
import { ResumeEntry } from '@/components/layout/ResumeEntry';
import { ResumeLoadError } from '@/components/layout/ResumeLoadError';
import { AlertTriangle, ArrowLeft, BookOpen, ExternalLink, RotateCcw, Snowflake, Sparkles, X } from 'lucide-react';
import { QUESTIONNAIRE_LIST, QuestionnaireConfig, QuestionnaireType } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';
import { LOCAL_RESUME_HREF, PQBL_RESUME_HREF, resumeHref, useResumeEntries } from '@/lib/use-resume-entries';
import { instrumentAvailableInLocale } from '@/lib/instrument-availability';
import { getDynamicToolCategories, resolveActiveStudentTools, TEACHER_AREA_INSTRUMENT_IDS } from '@/lib/tool-catalog';
import { STRATEGIC_COMPETENCES_URLS } from '@/lib/questionnaire-sources';
import { isClassContentHidden, isToolAllowed } from '@/lib/user-access';
import { latestPausedByTool, suggestTools, type PausedChat } from '@/lib/catalog-status';
import { fetchOrientationSession, fetchOrientationStatus, type OrientationRecommendation } from '@/lib/orientation-api';
import { useInstrumentCatalog } from '@/lib/use-instrument-catalog';
import { useUserAccess } from '@/lib/use-user-access';
import { ClassPathHeroList } from '@/components/profile/ClassPathHeroList';
import { parseStudentClassPaths, selectCurrentClassPath, type StudentClassPath } from '@/lib/class-paths';
import { classPathText } from '@/lib/i18n-class-paths';
import { apiFetch } from '@/lib/auth';

interface Props {
    // Ultima compilazione per strumento, in ISO; assente = mai compilato.
    lastCompiledAt: Partial<Record<QuestionnaireType, string>>;
    onStartInstrument: (questionnaire: QuestionnaireConfig) => void;
    onOpenIntro: () => void;
    paths?: StudentClassPath[] | null;
    onRefreshPaths?: () => Promise<void> | void;
    // Chat appena congelata col fiocco: si atterra qui e l'avviso dice come tornarci.
    pausedChat?: PausedChat | null;
    onDismissPausedChat?: () => void;
}

export function ReturningHome({
    lastCompiledAt,
    onStartInstrument,
    onOpenIntro,
    paths,
    onRefreshPaths,
    pausedChat = null,
    onDismissPausedChat,
}: Props) {
    const { t, tf, lang, setLang } = useI18n();
    const resumeEntries = useResumeEntries();
    const { frozen, localResume, pqbl: pqblResume, count: resumeCount } = resumeEntries;
    const { rows: instrumentCatalog, loading: catalogLoading, error: catalogError, retry: retryCatalog } = useInstrumentCatalog();
    const { access } = useUserAccess();
    const formatDate = (iso: string) => new Date(iso).toLocaleDateString(lang);

    const [internalPaths, setInternalPaths] = useState<StudentClassPath[] | null>(paths ?? null);

    useEffect(() => {
        if (paths !== undefined) {
            setInternalPaths(paths);
            return;
        }
        let alive = true;
        apiFetch('/api/user/paths')
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (alive) setInternalPaths(parseStudentClassPaths(data));
            })
            .catch(() => {
                if (alive) setInternalPaths([]);
            });
        return () => { alive = false; };
    }, [paths]);

    const handleReloadPaths = async () => {
        if (onRefreshPaths) {
            await onRefreshPaths();
        } else {
            try {
                const res = await apiFetch('/api/user/paths');
                if (res.ok) {
                    const data = await res.json();
                    setInternalPaths(parseStudentClassPaths(data));
                }
            } catch {
                // ignore
            }
        }
    };

    const activePaths = internalPaths ?? paths ?? [];
    const currentPath = useMemo(() => selectCurrentClassPath(activePaths), [activePaths]);

    const activeTools = useMemo(() => {
        return resolveActiveStudentTools(instrumentCatalog, lang, access);
    }, [instrumentCatalog, lang, access]);

    const activeInstrumentById = useMemo(() => {
        return new Map(activeTools.map((q) => [q.id, q]));
    }, [activeTools]);

    const dynamicCategories = useMemo(() => {
        return getDynamicToolCategories(activeTools, instrumentCatalog);
    }, [activeTools, instrumentCatalog]);

    // Elementi dell'ex catalogo strumenti, confluito qui.
    const pausedByTool = useMemo(() => latestPausedByTool(frozen), [frozen]);
    // Strumenti indicati dall'ultima Bussola: senza Bussola (o senza login) la
    // richiesta fallisce e i consigli usano solo le chat in pausa.
    const [orientation, setOrientation] = useState<OrientationRecommendation[]>([]);
    useEffect(() => {
        let alive = true;
        void (async () => {
            try {
                const status = await fetchOrientationStatus();
                const sessionId = status.latest_session_id ?? status.in_progress_session_id;
                if (!sessionId) return;
                const session = await fetchOrientationSession(sessionId);
                if (alive) setOrientation(session.recommendations);
            } catch { /* nessun segnale dalla Bussola */ }
        })();
        return () => { alive = false; };
    }, []);
    const suggestions = useMemo(() => suggestTools({
        activeIds: activeTools.map((q) => q.id),
        completed: Object.keys(lastCompiledAt),
        paused: frozen,
        orientation,
    }), [activeTools, lastCompiledAt, frozen, orientation]);
    const upcoming = useMemo(() => {
        const activeIds = new Set(activeTools.map((q) => q.id));
        return QUESTIONNAIRE_LIST.filter(
            (q) => isToolAllowed(access, q.id)
                && !activeIds.has(q.id)
                && !(TEACHER_AREA_INSTRUMENT_IDS as readonly string[]).includes(q.id)
        );
    }, [activeTools, access]);
    const isAdministrationLang = instrumentCatalog?.some((row) => row.available_locales.includes(lang)) ?? false;
    const isUnavailableQuestionnaireLang = lang !== 'it' && instrumentCatalog !== null && !isAdministrationLang;
    return (
        <div className="flex flex-col gap-5 py-2">
            <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onOpenIntro}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span>{t('base.backToIntro')}</span>
                        </button>
                        <h1 className="font-display text-3xl font-bold text-slate-900">{t('base.instruments.title')}</h1>
                    </div>
                </div>
            </section>

            {!isClassContentHidden(access) && currentPath && (
                <section aria-labelledby="home-class-path-title">
                    <h2 id="home-class-path-title" className="sr-only">
                        {classPathText(lang, 'yourClassPath')}
                    </h2>
                    <ClassPathHeroList paths={activePaths} onReload={handleReloadPaths} collapsed />
                </section>
            )}

            {pausedChat && (
                <section className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3" role="status">
                    <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-indigo-900">
                            {t('selector.paused.title', { tool: tf(`q.${pausedChat.questionnaireId}.name`, pausedChat.questionnaireId) })}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-600">{t('selector.paused.body')}</p>
                    </div>
                    {/* Riprendere ricarica la pagina: la home legge lo snapshot al mount. */}
                    <a
                        href={resumeHref({ session_id: pausedChat.sessionId })}
                        className="inline-flex min-h-[44px] shrink-0 items-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                    >
                        {t('selector.paused.resume')}
                    </a>
                    {onDismissPausedChat && (
                        <button
                            type="button"
                            onClick={onDismissPausedChat}
                            aria-label={t('selector.paused.dismiss')}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-indigo-700 transition-colors hover:bg-indigo-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </section>
            )}

            <div id="home-catalog-section" className="flex flex-col gap-5">
            <section>
                <CompassEntry />
                {suggestions.length > 0 && !isUnavailableQuestionnaireLang && (
                    <section className="mt-5" aria-labelledby="home-suggested-title">
                        <h2 id="home-suggested-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                            <Sparkles className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                            {t('selector.suggested.title')}
                        </h2>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                            {suggestions.map((suggestion) => {
                                const q = activeInstrumentById.get(suggestion.id);
                                if (!q) return null;
                                const paused = suggestion.source === 'paused' ? pausedByTool.get(q.id) : undefined;
                                const className = 'glass-panel flex flex-col gap-1 p-4 text-left transition-colors hover:border-indigo-300';
                                const body = (
                                    <>
                                        <span className="font-bold text-slate-900">{tf(`q.${q.id}.name`, q.name)}</span>
                                        <span className="text-sm text-slate-500">
                                            {suggestion.source === 'paused' ? t('selector.suggested.paused') : suggestion.reason}
                                        </span>
                                    </>
                                );
                                return paused
                                    ? <a key={q.id} href={resumeHref(paused)} className={className}>{body}</a>
                                    : <button key={q.id} type="button" onClick={() => onStartInstrument(q)} className={className}>{body}</button>;
                            })}
                        </div>
                    </section>
                )}
                {isUnavailableQuestionnaireLang && (
                    <section className="mt-5 flex flex-col gap-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-5 sm:flex-row sm:items-center">
                        <AlertTriangle className="h-7 w-7 shrink-0 text-amber-700" />
                        <div className="flex-1">
                            <h2 className="font-bold text-amber-950">{t('selector.unavailable.title')}</h2>
                            <p className="mt-1 text-sm leading-relaxed text-amber-900">{t('selector.unavailable.body')}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setLang('en')}
                            className="inline-flex min-h-[44px] shrink-0 items-center rounded-md bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-800"
                        >
                            {t('selector.unavailable.switchEnglish')}
                        </button>
                    </section>
                )}
                <nav className="mt-4 flex flex-wrap gap-2" aria-label={t('base.categories.label')}>
                    {dynamicCategories.map((group) => (
                        <a
                            key={group.id}
                            href={`#tools-${group.id}`}
                            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                            {t(`base.category.${group.id}`)}
                        </a>
                    ))}
                    <Link href="/profilo" className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700">{t('app.intro.compact.workspace.title')}</Link>
                </nav>
                {lang !== 'it' && catalogLoading && (
                    <p className="mt-3 text-sm text-slate-500" role="status">{t('base.catalog.loading')}</p>
                )}
                {lang !== 'it' && catalogError && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                        <span>{t('base.catalog.error')}</span>
                        <button type="button" onClick={retryCatalog} className="font-semibold text-amber-950 underline underline-offset-2">
                            {t('base.catalog.retry')}
                        </button>
                    </div>
                )}
                <div className="mt-6 space-y-8">
                    {dynamicCategories.map((group) => {
                        const categoryImage = group.id === 'assessment'
                            ? '/images/intro/profiles.png'
                            : '/images/intro/paths.png';
                        return (
                        <section key={group.id} id={`tools-${group.id}`} className="scroll-mt-24">
                            <div className="flex items-center gap-3.5">
                                <div className="relative h-14 w-14 shrink-0">
                                    <Image
                                        src={categoryImage}
                                        alt=""
                                        width={56}
                                        height={56}
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">{t(`base.category.${group.id}`)}</h2>
                                </div>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {group.questionnaireIds.map((id) => activeInstrumentById.get(id)).filter((q): q is QuestionnaireConfig => Boolean(q)).map((q) => {
                                    const done = lastCompiledAt[q.id];
                                    const canCompleteQuestionnaire = lang !== 'it'
                                        && !q.agentOnly
                                        && instrumentCatalog !== null
                                        && instrumentAvailableInLocale(instrumentCatalog, q.id, lang);
                                    const externalAssessmentUrl = lang === 'it' && !q.agentOnly ? STRATEGIC_COMPETENCES_URLS[q.id] : undefined;
                                    const paused = pausedByTool.get(q.id);
                                    return (
                                        <article key={q.id} className="glass-panel flex flex-col gap-3 p-5 text-left transition-colors hover:border-indigo-300">
                                            <div>
                                                <span className="flex items-center gap-2">
                                                    <span className={cn('h-1.5 w-1.5 rounded-full', done ? 'bg-teal-500' : 'bg-slate-300')} />
                                                    <span className="font-bold text-slate-900">{tf(`q.${q.id}.name`, q.name)}</span>
                                                    {canCompleteQuestionnaire && (
                                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-bold text-amber-700">{t('selector.experimentalBadge')}</span>
                                                    )}
                                                    {paused && (
                                                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-2xs font-bold text-indigo-700">
                                                            {paused.updated_at ? t('selector.badge.pausedOn', { date: formatDate(paused.updated_at) }) : t('selector.badge.paused')}
                                                        </span>
                                                    )}
                                                </span>
                                                <h3 className="mt-1 text-sm font-medium leading-snug text-slate-600">{tf(`q.${q.id}.fullName`, q.fullName)}</h3>
                                            </div>
                                            <p className="grow text-sm leading-relaxed text-slate-500">{tf(`q.${q.id}.description`, q.description)}</p>
                                            <span className="font-mono text-xs text-slate-500">
                                                {done ? t('base.instrument.doneOn', { date: formatDate(done) }) : t('base.instrument.todo')}
                                            </span>
                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                {paused && (
                                                    <a href={resumeHref(paused)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-800 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2">
                                                        <Snowflake className="h-4 w-4" aria-hidden="true" />{t('selector.paused.resume')}
                                                    </a>
                                                )}
                                                {externalAssessmentUrl && (
                                                    <a href={externalAssessmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2">
                                                        {t('selector.openStrategic')}<ExternalLink className="h-4 w-4" />
                                                    </a>
                                                )}
                                                {canCompleteQuestionnaire && (
                                                    <Link href={`/somministrazione/${q.id}/${lang}`} className="inline-flex min-h-[44px] items-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2">
                                                        {t('selector.completeQuestionnaire')}
                                                    </Link>
                                                )}
                                                <button type="button" onClick={() => onStartInstrument(q)} className={cn('inline-flex min-h-[44px] items-center rounded-md px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2', canCompleteQuestionnaire ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                                                    {t(q.agentOnly ? 'base.instrument.startPath' : 'base.instrument.analyze')}
                                                </button>
                                                <Link href={`/strumenti/${q.id}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2">
                                                    <BookOpen className="h-4 w-4" />{t('selector.learn')}
                                                </Link>
                                            </div>
                                            {externalAssessmentUrl && (
                                                <p className="text-xs text-slate-500">{t('selector.externalCredentials')}</p>
                                            )}
                                        </article>
                                    );
                                })}

                            </div>
                        </section>
                        );
                    })}
                </div>
            </section>
            <div className="space-y-5">
            <PersonalAreaEntry />
            {(resumeCount > 0 || resumeEntries.error) && (
                <section data-testid="home-resume">
                    <div className="flex items-center gap-3.5">
                        <div className="relative h-14 w-14 shrink-0">
                            <Image src="/images/cards/critical_puzzle.png" alt="" width={56} height={56} className="h-full w-full object-contain" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900">{t('frozen.resumeTitle')}</h2>
                    </div>
                    <ResumeLoadError entries={resumeEntries} />
                    <div className="mt-3 space-y-2">
                        {frozen.map((row) => (
                            <ResumeEntry key={row.session_id} target={{ kind: 'session', sessionId: row.session_id }} label={resumeLabel(row.questionnaire_type, row.label, tf)}>
                                <a
                                    href={resumeHref(row)}
                                    className="glass-panel flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-indigo-300"
                                >
                                    <RotateCcw className="h-4 w-4 shrink-0 text-indigo-600" />
                                    <span className="truncate">{resumeLabel(row.questionnaire_type, row.label, tf)}</span>
                                </a>
                            </ResumeEntry>
                        ))}
                        {localResume && (
                            <ResumeEntry target={{ kind: 'session', sessionId: localResume.sessionId }} label={`${t('header.resume')} · ${resumeLabel(localResume.instrument, null, tf)}`}>
                                <a
                                    href={LOCAL_RESUME_HREF}
                                    className="glass-panel flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-indigo-300"
                                >
                                    <RotateCcw className="h-4 w-4 shrink-0 text-indigo-600" />
                                    <span className="truncate">{t('header.resume')} · {resumeLabel(localResume.instrument, null, tf)}</span>
                                </a>
                            </ResumeEntry>
                        )}
                        {pqblResume && (
                            <ResumeEntry target={{ kind: 'pqbl' }} label={`${t('header.resume')} · ${t('pqbl.card.title')}`}>
                                <a
                                    href={PQBL_RESUME_HREF}
                                    className="glass-panel flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-indigo-300"
                                >
                                    <RotateCcw className="h-4 w-4 shrink-0 text-indigo-600" />
                                    <span className="truncate">{t('header.resume')} · {t('pqbl.card.title')}</span>
                                </a>
                            </ResumeEntry>
                        )}
                    </div>
                </section>
            )}

            {!isUnavailableQuestionnaireLang && upcoming.length > 0 && (
                <section className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-200 bg-white/60 px-5 py-4 lg:flex-row lg:items-center">
                    <div className="shrink-0 lg:w-52">
                        <h2 className="text-sm font-semibold text-slate-700">{t('selector.upcoming.title')}</h2>
                        <p className="mt-1 text-xs text-slate-500">{t('selector.upcoming.subtitle')}</p>
                    </div>
                    <div className="grid flex-1 gap-2 sm:grid-cols-3">
                        {upcoming.map((q) => (
                            <div key={q.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                                <span className="text-sm font-semibold text-slate-600">{q.name}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-bold text-slate-500">{t('selector.soon')}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            </div>
            </div>
        </div>
    );
}
