'use client';

// Catalogo dell'Area studente, con gli strumenti consentiti nella vista attiva.

import { useEffect, useMemo, useState } from 'react';
import { CompassEntry } from '@/components/home/CompassEntry';
import { Button, buttonClasses } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import ToolIllustration from '@/components/ui/ToolIllustration';
import { Snowflake, X } from 'lucide-react';
import { QUESTIONNAIRE_LIST } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { resumeHref, useResumeEntries } from '@/lib/use-resume-entries';
import { getDynamicToolCategories, resolveActiveStudentTools, resolveCatalogSections, TEACHER_AREA_INSTRUMENT_IDS } from '@/lib/tool-catalog';
import { isToolAllowed } from '@/lib/user-access';
import { latestPausedByTool, suggestTools, type PausedChat } from '@/lib/catalog-status';
import { fetchOrientationSession, fetchOrientationStatus, type OrientationRecommendation } from '@/lib/orientation-api';
import { useInstrumentCatalog } from '@/lib/use-instrument-catalog';
import { useUserAccess } from '@/lib/use-user-access';
import { Callout } from '@/components/ui/Callout';

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
                <Callout variant="info" icon={Snowflake} title={t('selector.paused.title', { tool: tf(`q.${pausedChat.questionnaireId}.name`, pausedChat.questionnaireId) })}>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1">{t('selector.paused.body')}</p>
                        {/* Riprendere ricarica la pagina: la home legge lo snapshot al mount. */}
                        <a
                            href={resumeHref(frozen.find(row => row.session_id === pausedChat.sessionId) ?? { session_id: pausedChat.sessionId })}
                            className={buttonClasses('primary', 'md', 'shrink-0')}
                        >
                            {t('selector.paused.resume')}
                        </a>
                        {onDismissPausedChat && (
                            <Button type="button" variant="ghost" onClick={onDismissPausedChat} aria-label={t('selector.paused.dismiss')}>
                                <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                        )}
                    </div>
                </Callout>
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
                <Callout variant="warning" title={t('selector.unavailable.title')}>
                    <p>{t('selector.unavailable.body')}</p>
                    <Button variant="secondary" onClick={() => setLang('en')} className="mt-2">
                        {t('selector.unavailable.switchEnglish')}
                    </Button>
                </Callout>
            )}
            {lang !== 'it' && catalogLoading && (
                <p className="text-sm text-ink-muted" role="status">{t('base.catalog.loading')}</p>
            )}
            {lang !== 'it' && catalogError && (
                <Callout variant="danger">
                    <span>{t('base.catalog.error')}</span>
                    <Button type="button" variant="ghost" onClick={retryCatalog}>
                        {t('base.catalog.retry')}
                    </Button>
                </Callout>
            )}
            {resolveCatalogSections(dynamicCategories, activeInstrumentById).map((group) => (
                // The wrapper keeps the #tools-<category> anchors used by the intro screen.
                <div key={group.id} id={`tools-${group.id}`} className="scroll-mt-24">
                    <EntrySection id={`tools-${group.id}-title`} title={t(`base.category.${group.id}`)}>
                        {group.tools.map((q) => {
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
                <EntrySection id="home-upcoming-title" title={t('selector.upcoming.title')} subtitle={t('selector.upcoming.subtitle')}>
                    {upcoming.map((q) => (
                        <div key={q.id} aria-disabled="true" className="flex min-h-control items-center justify-between gap-2 px-2 py-2">
                            <span className="text-sm font-semibold text-ink-muted">{q.name}</span>
                            <StatusBadge>{t('selector.soon')}</StatusBadge>
                        </div>
                    ))}
                </EntrySection>
            )}
            </div>
        </>
    );
}
