'use client';

// Catalogo dell'Area studente, con gli strumenti consentiti nella vista attiva.

import { useEffect, useMemo, useState } from 'react';
import { CompassEntry } from '@/components/home/CompassEntry';
import { Button } from '@/components/ui/Button';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import ToolIllustration from '@/components/ui/ToolIllustration';
import { AlertTriangle, Snowflake, X } from 'lucide-react';
import { QUESTIONNAIRE_LIST, QuestionnaireConfig } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { resumeHref, useResumeEntries } from '@/lib/use-resume-entries';
import { getDynamicToolCategories, resolveActiveStudentTools, TEACHER_AREA_INSTRUMENT_IDS } from '@/lib/tool-catalog';
import { isToolAllowed } from '@/lib/user-access';
import { latestPausedByTool, suggestTools, type PausedChat } from '@/lib/catalog-status';
import { fetchOrientationSession, fetchOrientationStatus, type OrientationRecommendation } from '@/lib/orientation-api';
import { useInstrumentCatalog } from '@/lib/use-instrument-catalog';
import { useUserAccess } from '@/lib/use-user-access';

interface Props {
    id: string;
    // Ultima compilazione per strumento, in ISO; assente = mai compilato.
    lastCompiledAt: Partial<Record<string, string>>;
    // Chat appena congelata col fiocco: l'avviso dice come tornarci.
    pausedChat?: PausedChat | null;
    onDismissPausedChat?: () => void;
}

export function InstrumentCatalog({
    id,
    lastCompiledAt,
    pausedChat = null,
    onDismissPausedChat,
}: Props) {
    const { t, tf, lang, setLang } = useI18n();
    const { frozen: sessions } = useResumeEntries();
    const frozen = useMemo(() => sessions.filter(row => !row.practice_notebook_id), [sessions]);
    const { rows: instrumentCatalog, loading: catalogLoading, error: catalogError, retry: retryCatalog } = useInstrumentCatalog();
    const { access } = useUserAccess();
    const formatDate = (iso: string) => new Date(iso).toLocaleDateString(lang);

    const activeTools = useMemo(() => {
        return resolveActiveStudentTools(instrumentCatalog, lang, access);
    }, [instrumentCatalog, lang, access]);

    const activeInstrumentById = useMemo(() => {
        return new Map(activeTools.map((q) => [q.id, q]));
    }, [activeTools]);

    const dynamicCategories = useMemo(() => {
        return getDynamicToolCategories(activeTools, instrumentCatalog);
    }, [activeTools, instrumentCatalog]);
    const toolCategory = (toolId: string) => dynamicCategories.find((group) => group.questionnaireIds.includes(toolId))?.id;

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
        <>
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

            <div id={id} className="flex flex-col gap-6">
            <CompassEntry />
            {suggestions.length > 0 && !isUnavailableQuestionnaireLang && (
                <EntrySection id="home-suggested-title" title={t('selector.suggested.title')}>
                    {suggestions.map((suggestion) => {
                        const q = activeInstrumentById.get(suggestion.id);
                        if (!q) return null;
                        const paused = suggestion.source === 'paused' ? pausedByTool.get(q.id) : undefined;
                        return (
                            <EntryLink key={q.id} idPrefix="suggested" id={q.id}
                                href={paused ? resumeHref(paused) : `/strumenti/${q.id}`} reload={Boolean(paused)}
                                illustration={<ToolIllustration id={q.id} category={toolCategory(q.id)} className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
                                name={tf(`q.${q.id}.name`, q.name)}
                                description={suggestion.source === 'paused' ? t('selector.suggested.paused') : suggestion.reason} />
                        );
                    })}
                </EntrySection>
            )}
            {isUnavailableQuestionnaireLang && (
                <section className="flex flex-col gap-4 rounded-card border border-warning-line bg-warning-soft p-6 sm:flex-row sm:items-center">
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
            {lang !== 'it' && catalogLoading && (
                <p className="text-sm text-ink-muted" role="status">{t('base.catalog.loading')}</p>
            )}
            {lang !== 'it' && catalogError && (
                <div className="flex flex-wrap items-center gap-4 rounded-card border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink" role="alert">
                    <span>{t('base.catalog.error')}</span>
                    <button type="button" onClick={retryCatalog} className="inline-flex min-h-control items-center font-semibold text-warning-ink underline underline-offset-2">
                        {t('base.catalog.retry')}
                    </button>
                </div>
            )}
            {dynamicCategories.filter((group) => group.questionnaireIds.length > 0).map((group) => (
                // The wrapper keeps the #tools-<category> anchors used by the intro screen.
                <div key={group.id} id={`tools-${group.id}`} className="scroll-mt-24">
                    <EntrySection id={`tools-${group.id}-title`} title={t(`base.category.${group.id}`)}>
                        {group.questionnaireIds.map((toolId) => activeInstrumentById.get(toolId)).filter((q): q is QuestionnaireConfig => Boolean(q)).map((q) => {
                            const done = lastCompiledAt[q.id];
                            const paused = pausedByTool.get(q.id);
                            const status = paused
                                ? (paused.updated_at ? t('selector.badge.pausedOn', { date: formatDate(paused.updated_at) }) : t('selector.badge.paused'))
                                : done ? t('base.instrument.doneOn', { date: formatDate(done) }) : undefined;
                            return (
                                <EntryLink key={q.id} idPrefix="tool" id={q.id} href={`/strumenti/${q.id}`}
                                    illustration={<ToolIllustration id={q.id} category={group.id} className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
                                    name={tf(`q.${q.id}.name`, q.name)}
                                    description={tf(`q.${q.id}.description`, q.description)}
                                    status={status} />
                            );
                        })}
                    </EntrySection>
                </div>
            ))}
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
        </>
    );
}
