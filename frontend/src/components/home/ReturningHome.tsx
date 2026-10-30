'use client';

// «Attività e percorsi»: catalogo e strumenti personali precedono le attività
// da riprendere. Qui è confluito l'ex catalogo strumenti (avviso dopo il fiocco,
// chat in pausa, consigli, compilazione sul sito, strumenti in arrivo).
// Le aree personali restano nella pagina personale, non in questa home.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CompassEntry } from '@/components/home/CompassEntry';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { resumeLabel } from '@/lib/resume-label';
import { PersonalAreaEntry } from '@/components/home/PersonalAreaEntry';
import { ResumeEntry } from '@/components/layout/ResumeEntry';
import { ResumeLoadError } from '@/components/layout/ResumeLoadError';
import { AlertTriangle, BookOpen, ExternalLink, RotateCcw, Snowflake, Sparkles, X } from 'lucide-react';
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
        if (paths !== undefined) return;
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

    const activePaths = useMemo(() => paths !== undefined ? paths ?? [] : internalPaths ?? [], [paths, internalPaths]);
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
        <div className="flex flex-col gap-6 py-2">
            <section>
                <PageHeader title={t('base.instruments.title')} onBack={onOpenIntro} backLabel={t('base.backToIntro')} />
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
                <section className="flex items-start gap-4 rounded-card border border-brand-line bg-brand-soft p-4" role="status">
                    <Snowflake className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-link">
                            {t('selector.paused.title', { tool: tf(`q.${pausedChat.questionnaireId}.name`, pausedChat.questionnaireId) })}
                        </p>
                        <p className="mt-1 text-sm text-ink-muted">{t('selector.paused.body')}</p>
                    </div>
                    {/* Riprendere ricarica la pagina: la home legge lo snapshot al mount. */}
                    <a
                        href={resumeHref(frozen.find(row => row.session_id === pausedChat.sessionId) ?? { session_id: pausedChat.sessionId })}
                        className="inline-flex min-h-control shrink-0 items-center rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand transition-colors hover:bg-brand-hover"
                    >
                        {t('selector.paused.resume')}
                    </a>
                    {onDismissPausedChat && (
                        <button
                            type="button"
                            onClick={onDismissPausedChat}
                            aria-label={t('selector.paused.dismiss')}
                            className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-control text-link transition-colors hover:bg-brand-soft"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </section>
            )}

            <div id="home-catalog-section" className="flex flex-col gap-6">
            <section>
                <CompassEntry />
                {suggestions.length > 0 && !isUnavailableQuestionnaireLang && (
                    <section className="mt-6" aria-labelledby="home-suggested-title">
                        <h2 id="home-suggested-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
                            <Sparkles className="h-5 w-5 text-link" aria-hidden="true" />
                            {t('selector.suggested.title')}
                        </h2>
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                            {suggestions.map((suggestion) => {
                                const q = activeInstrumentById.get(suggestion.id);
                                if (!q) return null;
                                const paused = suggestion.source === 'paused' ? pausedByTool.get(q.id) : undefined;
                                const className = 'flex flex-col gap-1 rounded-card border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-brand-line';
                                const body = (
                                    <>
                                        <span className="font-semibold text-ink">{tf(`q.${q.id}.name`, q.name)}</span>
                                        <span className="text-sm text-ink-muted">
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
                    <section className="mt-6 flex flex-col gap-4 rounded-card border border-warning-line bg-warning-soft p-6 sm:flex-row sm:items-center">
                        <AlertTriangle className="h-6 w-6 shrink-0 text-warning" />
                        <div className="flex-1">
                            <h2 className="font-semibold text-warning-ink">{t('selector.unavailable.title')}</h2>
                            <p className="mt-1 text-sm leading-relaxed text-warning-ink">{t('selector.unavailable.body')}</p>
                        </div>
                        <Button variant="secondary" onClick={() => setLang('en')} className="shrink-0">
                            {t('selector.unavailable.switchEnglish')}
                        </Button>
                    </section>
                )}
                <nav className="mt-4 flex flex-wrap gap-2" aria-label={t('base.categories.label')}>
                    {dynamicCategories.map((group) => (
                        <a
                            key={group.id}
                            href={`#tools-${group.id}`}
                            className="inline-flex min-h-control items-center rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-muted transition-colors hover:border-brand-line hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            {t(`base.category.${group.id}`)}
                        </a>
                    ))}
                    <Link href="/profilo" className="inline-flex min-h-control items-center rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-muted hover:border-brand-line hover:text-link">{t('app.intro.compact.workspace.title')}</Link>
                </nav>
                {lang !== 'it' && catalogLoading && (
                    <p className="mt-4 text-sm text-ink-muted" role="status">{t('base.catalog.loading')}</p>
                )}
                {lang !== 'it' && catalogError && (
                    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-card border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink" role="alert">
                        <span>{t('base.catalog.error')}</span>
                        <button type="button" onClick={retryCatalog} className="inline-flex min-h-control items-center font-semibold text-warning-ink underline underline-offset-2">
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
                            <div className="flex items-center gap-4">
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
                                    <h2 className="text-lg font-semibold text-ink">{t(`base.category.${group.id}`)}</h2>
                                </div>
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                {group.questionnaireIds.map((id) => activeInstrumentById.get(id)).filter((q): q is QuestionnaireConfig => Boolean(q)).map((q) => {
                                    const done = lastCompiledAt[q.id];
                                    const canCompleteQuestionnaire = lang !== 'it'
                                        && !q.agentOnly
                                        && instrumentCatalog !== null
                                        && instrumentAvailableInLocale(instrumentCatalog, q.id, lang);
                                    const externalAssessmentUrl = lang === 'it' && !q.agentOnly ? STRATEGIC_COMPETENCES_URLS[q.id] : undefined;
                                    const paused = pausedByTool.get(q.id);
                                    return (
                                        <Card as="article" key={q.id} className="flex flex-col gap-4 text-left hover:border-brand-line">
                                            <div>
                                                <span className="flex items-center gap-2">
                                                    <span className={cn('h-2 w-2 rounded-full', done ? 'bg-brand' : 'bg-line-strong')} />
                                                    <span className="font-semibold text-ink">{tf(`q.${q.id}.name`, q.name)}</span>
                                                    {canCompleteQuestionnaire && (
                                                        <span className="rounded-full bg-warning-soft px-2 py-1 text-2xs font-semibold text-warning">{t('selector.experimentalBadge')}</span>
                                                    )}
                                                    {paused && (
                                                        <span className="rounded-full bg-brand-soft px-2 py-1 text-2xs font-semibold text-link">
                                                            {paused.updated_at ? t('selector.badge.pausedOn', { date: formatDate(paused.updated_at) }) : t('selector.badge.paused')}
                                                        </span>
                                                    )}
                                                </span>
                                                <h3 className="mt-1 text-sm leading-snug text-ink-muted">{tf(`q.${q.id}.fullName`, q.fullName)}</h3>
                                            </div>
                                            <p className="grow text-sm leading-relaxed text-ink-muted">{tf(`q.${q.id}.description`, q.description)}</p>
                                            <span className="font-mono text-xs text-ink-muted">
                                                {done ? t('base.instrument.doneOn', { date: formatDate(done) }) : t('base.instrument.todo')}
                                            </span>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {paused && (
                                                    <a href={resumeHref(paused)} className="inline-flex min-h-control items-center gap-2 rounded-control border border-brand-line bg-brand-soft px-4 py-2 text-sm font-semibold text-link transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
                                                        <Snowflake className="h-4 w-4" aria-hidden="true" />{t('selector.paused.resume')}
                                                    </a>
                                                )}
                                                {externalAssessmentUrl && (
                                                    <a href={externalAssessmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-control items-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-body transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
                                                        {t('selector.openStrategic')}<ExternalLink className="h-4 w-4" />
                                                    </a>
                                                )}
                                                {canCompleteQuestionnaire && (
                                                    <Link href={`/somministrazione/${q.id}/${lang}`} className="inline-flex min-h-control items-center rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
                                                        {t('selector.completeQuestionnaire')}
                                                    </Link>
                                                )}
                                                <Button variant={canCompleteQuestionnaire ? 'secondary' : 'primary'} onClick={() => onStartInstrument(q)}>
                                                    {t(q.agentOnly ? 'base.instrument.startPath' : 'base.instrument.analyze')}
                                                </Button>
                                                <Link href={`/strumenti/${q.id}`} className="inline-flex min-h-control items-center gap-2 rounded-control px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
                                                    <BookOpen className="h-4 w-4" />{t('selector.learn')}
                                                </Link>
                                            </div>
                                            {externalAssessmentUrl && (
                                                <p className="text-xs text-ink-muted">{t('selector.externalCredentials')}</p>
                                            )}
                                        </Card>
                                    );
                                })}

                            </div>
                        </section>
                        );
                    })}
                </div>
            </section>
            <div className="space-y-6">
            <PersonalAreaEntry />
            {(resumeCount > 0 || resumeEntries.error) && (
                <section data-testid="home-resume">
                    <div className="flex items-center gap-4">
                        <div className="relative h-14 w-14 shrink-0">
                            <Image src="/images/cards/critical_puzzle.png" alt="" width={56} height={56} className="h-full w-full object-contain" />
                        </div>
                        <h2 className="text-lg font-semibold text-ink">{t('frozen.resumeTitle')}</h2>
                    </div>
                    <ResumeLoadError entries={resumeEntries} />
                    <div className="mt-4 space-y-2">
                        {frozen.map((row) => (
                            <ResumeEntry key={row.session_id} deletable={!row.path_id} target={{ kind: 'session', sessionId: row.session_id }} label={resumeLabel(row.questionnaire_type, row.label, tf)}>
                                <a
                                    href={resumeHref(row)}
                                    className="flex min-h-control items-center gap-4 rounded-card border border-line bg-surface p-4 text-sm font-semibold text-ink shadow-card transition-colors hover:border-brand-line"
                                >
                                    <RotateCcw className="h-4 w-4 shrink-0 text-link" />
                                    <span className="truncate">{resumeLabel(row.questionnaire_type, row.label, tf)}</span>
                                </a>
                            </ResumeEntry>
                        ))}
                        {localResume && (
                            <ResumeEntry target={{ kind: 'session', sessionId: localResume.sessionId }} label={`${t('header.resume')} · ${resumeLabel(localResume.instrument, null, tf)}`}>
                                <a
                                    href={LOCAL_RESUME_HREF}
                                    className="flex min-h-control items-center gap-4 rounded-card border border-line bg-surface p-4 text-sm font-semibold text-ink shadow-card transition-colors hover:border-brand-line"
                                >
                                    <RotateCcw className="h-4 w-4 shrink-0 text-link" />
                                    <span className="truncate">{t('header.resume')} · {resumeLabel(localResume.instrument, null, tf)}</span>
                                </a>
                            </ResumeEntry>
                        )}
                        {pqblResume && (
                            <ResumeEntry target={{ kind: 'pqbl' }} label={`${t('header.resume')} · ${t('pqbl.card.title')}`}>
                                <a
                                    href={PQBL_RESUME_HREF}
                                    className="flex min-h-control items-center gap-4 rounded-card border border-line bg-surface p-4 text-sm font-semibold text-ink shadow-card transition-colors hover:border-brand-line"
                                >
                                    <RotateCcw className="h-4 w-4 shrink-0 text-link" />
                                    <span className="truncate">{t('header.resume')} · {t('pqbl.card.title')}</span>
                                </a>
                            </ResumeEntry>
                        )}
                    </div>
                </section>
            )}

            {!isUnavailableQuestionnaireLang && upcoming.length > 0 && (
                <section className="flex flex-col gap-4 rounded-card border border-dashed border-line bg-surface/60 px-6 py-4 lg:flex-row lg:items-center">
                    <div className="shrink-0 lg:w-52">
                        <h2 className="text-sm font-semibold text-ink-body">{t('selector.upcoming.title')}</h2>
                        <p className="mt-1 text-xs text-ink-muted">{t('selector.upcoming.subtitle')}</p>
                    </div>
                    <div className="grid flex-1 gap-2 sm:grid-cols-3">
                        {upcoming.map((q) => (
                            <div key={q.id} className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface px-4 py-2">
                                <span className="text-sm font-semibold text-ink-muted">{q.name}</span>
                                <span className="rounded-full bg-surface-raised px-2 py-1 text-2xs font-semibold text-ink-muted">{t('selector.soon')}</span>
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
