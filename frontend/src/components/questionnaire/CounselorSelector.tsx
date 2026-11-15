'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Cpu, Cloud, Search, Sparkles, X, Filter, Loader2 } from 'lucide-react';
import {
    fetchCounselorCategories,
    fetchCounselors,
    filterCounselorsByCategories,
    getCounselorTagline,
    getSelectedCounselorId,
    recommendCounselor,
    type CounselorRecommendationResponse,
    type PublicCounselor,
} from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';
import { counselorHelp } from '@/lib/i18n-counselor-help';
import { formatCategoryLabel } from '@/lib/i18n-counselor-identity';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CounselorCover } from './CounselorCover';

// Selettore counselor lato utente. Se non ci sono counselor configurati non
// renderizza nulla: il flusso resta identico a prima.
interface CounselorSelectorProps {
    onContinue?: (id: number) => void;
    initialSelectedId?: number | null;
    busy?: boolean;
    onBack?: () => void;
    questionnaireName?: string;
    // Codice dello strumento: alcuni strumenti sono a invito e non tutti i
    // counselor li servono.
    questionnaireType?: string;
}

export function CounselorSelector({
    onContinue,
    onBack,
    questionnaireName,
    questionnaireType,
    initialSelectedId,
    busy = false,
}: CounselorSelectorProps) {
    const { t, lang } = useI18n();
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [selected, setSelected] = useState<number | null>(null);
    const [loaded, setLoaded] = useState(false);

    // Categorie e filtro
    const [allCategories, setAllCategories] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    // Ricerca per stile / approccio
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchNoMatch, setSearchNoMatch] = useState(false);
    const [recommendation, setRecommendation] = useState<CounselorRecommendationResponse | null>(null);

    const toggleCategory = (cat: string) => {
        setSelectedCategories((prev) => {
            const normalized = cat.toLowerCase().trim();
            const exists = prev.some((c) => c.toLowerCase().trim() === normalized);
            if (exists) {
                return prev.filter((c) => c.toLowerCase().trim() !== normalized);
            }
            return [...prev, cat];
        });
    };

    const clearCategories = () => {
        setSelectedCategories([]);
    };

    const load = useCallback(async () => {
        setLoaded(false);
        try {
            const [list, fetchedCats] = await Promise.all([
                fetchCounselors(lang, lang, questionnaireType),
                fetchCounselorCategories(),
            ]);
            setCounselors(list);

            // Costruisci elenco categorie: base/censite + categorie presenti nei counselor
            const unionSet = new Set<string>();
            for (const cat of fetchedCats) {
                if (cat) unionSet.add(cat.toLowerCase().trim());
            }
            for (const c of list) {
                if (Array.isArray(c.approach_categories)) {
                    for (const cat of c.approach_categories) {
                        if (cat) unionSet.add(cat.toLowerCase().trim());
                    }
                }
            }
            setAllCategories(Array.from(unionSet));

            const stored = initialSelectedId ?? getSelectedCounselorId();
            // se il counselor salvato non esiste piu', azzera
            setSelected(list.some((c) => c.id === stored && c.is_active !== false) ? stored : null);
        } catch (e) {
            console.error('Failed to load counselors', e);
        } finally {
            setLoaded(true);
        }
    }, [lang, questionnaireType, initialSelectedId]);

    useEffect(() => {
        void load();
    }, [load]);

    const choose = (counselor: PublicCounselor) => {
        if (counselor.is_active === false || counselor.suitable === false) return;
        setSelected(counselor.id);
    };

    const handleSearchSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (!q) return;
        setSearching(true);
        setSearchNoMatch(false);
        try {
            const res = await recommendCounselor({
                query: q,
                language: lang,
                questionnaire_type: questionnaireType,
            });
            if (res && res.counselor) {
                setRecommendation(res);
                setSearchNoMatch(false);
            } else {
                setRecommendation(null);
                setSearchNoMatch(true);
            }
        } catch {
            setRecommendation(null);
            setSearchNoMatch(true);
        } finally {
            setSearching(false);
        }
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setRecommendation(null);
        setSearchNoMatch(false);
    };

    // Filtra e ordina i counselor in base alle categorie attive
    const filteredCounselors = useMemo(() => {
        return filterCounselorsByCategories(
            counselors,
            selectedCategories,
            recommendation?.counselor?.id
        );
    }, [counselors, selectedCategories, recommendation?.counselor?.id]);

    if (!loaded) {
        return (
            <Card className="p-8 text-center text-sm text-ink-muted">
                {t('counselor.loading')}
            </Card>
        );
    }

    if (counselors.length === 0) {
        return (
            <Card className="p-8 text-center space-y-4">
                <h2 className="text-xl font-semibold text-ink">{t('counselor.empty.title')}</h2>
                <p className="text-sm text-ink-muted">{t('counselor.empty.body')}</p>
            </Card>
        );
    }

    const renderCard = (c: PublicCounselor) => {
        const disabled = c.is_active === false || c.suitable === false;
        const isSelected = selected === c.id;
        const tagline = getCounselorTagline(c, lang);
        // Una sola riga di metadati al posto delle pillole: stato, origine,
        // modello, approcci e strumenti, separati da «·».
        const meta = [
            c.is_active === false && t('counselor.unavailable'),
            c.is_active !== false && c.suitable === false && t('counselor.notForInstrument'),
            c.model_origin && t(c.model_origin === 'local' ? 'counselor.origin.local' : 'counselor.origin.external'),
            ...(c.approach_categories ?? []).map((cat) => formatCategoryLabel(cat, lang)),
            ...(c.questionnaire_types ?? []).slice(0, 6),
        ].filter(Boolean);
        return (
            <button
                key={c.id}
                type="button"
                onClick={() => choose(c)}
                onDoubleClick={() => {
                    if (disabled || busy) return;
                    choose(c);
                    if (onContinue) onContinue(c.id);
                }}
                disabled={disabled}
                aria-pressed={isSelected}
                className={`flex w-full flex-col gap-4 border-b border-line px-2 py-4 text-left transition-colors sm:flex-row sm:items-start ${
                    disabled
                        ? 'cursor-not-allowed opacity-70'
                        : isSelected
                            ? 'bg-brand-soft'
                            : 'hover:bg-surface-sunken'
                }`}
            >
                {/* A sinistra: copertina CounselorCover (16:9) con spunta di selezione in overlay */}
                <div className="relative w-full shrink-0 sm:w-48">
                    <CounselorCover
                        src={c.avatar_url}
                        alt={c.name}
                        counselor={c}
                    />
                    {isSelected && !disabled && (
                        <div className="absolute top-2 right-2 z-10 shrink-0 rounded-full bg-brand p-1 text-ink-on-brand">
                            <Check className="h-3.5 w-3.5" />
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                    <h2 className="text-base font-semibold text-ink">{c.name}</h2>
                    {(meta.length > 0 || c.model) && (
                        <p
                            className="break-words text-xs text-ink-muted"
                            title={c.model_origin ? t(c.model_origin === 'local' ? 'counselor.origin.local.hint' : 'counselor.origin.external.hint') : undefined}
                        >
                            {meta.join(' · ')}
                            {c.model && <>{meta.length > 0 && ' · '}{t('counselor.modelLabel')} <span className="font-mono">{c.model}</span></>}
                        </p>
                    )}
                    {tagline ? (
                        <p className="text-sm italic leading-relaxed text-ink-body">{`"${tagline}"`}</p>
                    ) : null}
                    <p className="text-sm leading-relaxed text-ink-muted">
                        {c.description || t('counselor.toneDefault')}
                    </p>
                </div>
            </button>
        );
    };

    // Locale prima, cloud dopo. Mantiene l'ordine (sort_order) entro ogni gruppo.
    const localItems = filteredCounselors.filter((c) => c.model_origin === 'local');
    const cloudItems = filteredCounselors.filter((c) => c.model_origin !== 'local');
    const groups = [
        { key: 'local' as const, label: t('counselor.group.local'), items: localItems },
        { key: 'external' as const, label: t('counselor.group.external'), items: cloudItems },
    ].filter((g) => g.items.length > 0);

    // La scelta gia' fatta puo' non valere per questo strumento: si dice cosa
    // non va e chi si puo' usare, invece di azzerarla in silenzio.
    const chosen = counselors.find((c) => c.id === selected);
    const chosenIsUnfit = Boolean(chosen && chosen.suitable === false);
    const fitNames = counselors
        .filter((c) => c.suitable !== false && c.is_active !== false)
        .map((c) => c.name);

    return (
        <section className="space-y-6">
            <p className="text-sm leading-relaxed text-ink-muted">{counselorHelp(lang).tools}</p>

            {/* Ricerca per stile o approccio cercato */}
            <Card className="space-y-4 bg-surface-sunken p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <label htmlFor="counselor-search-input" className="text-sm font-semibold text-ink flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-link" />
                        {t('counselor.search.label')}
                    </label>
                    {searchQuery || recommendation ? (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="min-h-control text-xs text-ink-muted hover:text-ink-body flex items-center gap-1 self-start sm:self-auto"
                        >
                            <X className="h-3.5 w-3.5" />
                            {t('counselor.search.clear')}
                        </button>
                    ) : null}
                </div>

                <form onSubmit={handleSearchSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            id="counselor-search-input"
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('counselor.search.placeholder')}
                            className="w-full min-h-control rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink placeholder-ink-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-focus"
                        />
                        {searching && (
                            <div className="absolute right-4 top-2 text-xs text-ink-muted">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            </div>
                        )}
                    </div>
                    <Button
                        type="submit"
                        disabled={searching || !searchQuery.trim()}
                    >
                        <Search className="h-4 w-4" />
                        <span>{t('counselor.search.button')}</span>
                    </Button>
                </form>

                {searchNoMatch && (
                    <Callout variant="warning">{t('counselor.search.noMatch')}</Callout>
                )}

                {/* Scheda raccomandazione se presente */}
                {recommendation?.counselor && (
                    <div className="border-t border-line pt-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex flex-col sm:flex-row items-start gap-4 flex-1 min-w-0">
                                <div className="w-full sm:w-44 md:w-48 shrink-0">
                                    <CounselorCover
                                        src={recommendation.counselor.avatar_url}
                                        alt={recommendation.counselor.name}
                                        counselor={recommendation.counselor}
                                        compact
                                    />
                                </div>
                                <div className="space-y-2 flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-link flex items-center gap-1">
                                            <Sparkles className="h-3.5 w-3.5" />
                                            {t('counselor.search.recommendationTitle')}:
                                        </span>
                                        <span className="font-semibold text-ink text-base">
                                            {recommendation.counselor.name}
                                        </span>
                                        {recommendation.confidence > 0 && (
                                            <span className="text-xs text-ink-muted">
                                                {Math.round(recommendation.confidence * 100)}% {t('counselor.search.confidence')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-ink-body leading-relaxed">
                                        {recommendation.explanation}
                                    </p>
                                    {recommendation.matched_categories.length > 0 && (
                                        <p className="text-xs text-ink-muted">
                                            {recommendation.matched_categories.map((cat) => formatCategoryLabel(cat, lang)).join(' · ')}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex md:flex-col items-center gap-2 shrink-0 self-end md:self-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (recommendation.counselor) {
                                            choose(recommendation.counselor);
                                        }
                                    }}
                                    className={`min-h-control rounded-control px-4 py-2 text-xs font-semibold transition-colors ${
                                        selected === recommendation.counselor.id
                                            ? 'bg-brand-hover text-ink-on-brand ring-2 ring-focus'
                                            : 'bg-brand text-ink-on-brand hover:bg-brand-hover'
                                    }`}
                                >
                                    {selected === recommendation.counselor.id
                                        ? <><Check className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden />{`${recommendation.counselor.name} (${t('counselor.search.selected')})`}</>
                                        : `${t('counselor.search.selectAction')} (${recommendation.counselor.name})`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {/* Filtro per categoria */}
            {allCategories.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
                        <div className="flex items-center gap-2">
                            <Filter className="h-3.5 w-3.5 text-ink-muted" />
                            <span>{t('counselor.filter.label')}</span>
                            {selectedCategories.length > 0 && (
                                <span>({selectedCategories.length})</span>
                            )}
                        </div>
                        {selectedCategories.length > 0 && (
                            <button
                                type="button"
                                onClick={clearCategories}
                                className="inline-flex min-h-control items-center gap-1 text-2xs text-ink-muted hover:text-link transition-colors"
                            >
                                <X className="h-3 w-3" />
                                <span>{t('counselor.filter.reset')}</span>
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={clearCategories}
                            className={`min-h-control rounded-full px-4 py-1 text-xs transition-colors ${
                                selectedCategories.length === 0
                                    ? 'bg-brand text-ink-on-brand font-semibold'
                                    : 'border border-line bg-surface text-ink-body hover:border-brand-line hover:bg-surface-sunken'
                            }`}
                        >
                            {t('counselor.filter.all')} ({counselors.length})
                        </button>
                        {allCategories.map((cat) => {
                            const count = counselors.filter((c) =>
                                (c.approach_categories || []).some(
                                    (x) => x.toLowerCase().trim() === cat.toLowerCase().trim()
                                )
                            ).length;
                            if (count === 0) return null;
                            const active = selectedCategories.some(
                                (c) => c.toLowerCase().trim() === cat.toLowerCase().trim()
                            );
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => toggleCategory(cat)}
                                    aria-pressed={active}
                                    className={`min-h-control rounded-full px-4 py-1 text-xs transition-colors ${
                                        active
                                            ? 'bg-brand text-ink-on-brand font-semibold'
                                            : 'border border-line bg-surface text-ink-body hover:border-brand-line hover:bg-surface-sunken'
                                    }`}
                                >
                                    {formatCategoryLabel(cat, lang)} ({count})
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {chosenIsUnfit && (
                <Callout variant="warning">
                    <p role="status">
                        <span className="font-semibold">{chosen?.name}</span>{' '}
                        {t('counselor.unfit.notice')}{' '}
                        {questionnaireName && <span className="font-semibold">{questionnaireName}</span>}
                    </p>
                    {fitNames.length > 0 && (
                        <p className="mt-1">
                            {t('counselor.unfit.alternatives')} {fitNames.join(', ')}
                        </p>
                    )}
                </Callout>
            )}

            <div className="flex items-center gap-4">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                {onContinue && (
                    <ForwardButton
                        onClick={() => { if (selected) onContinue(selected); }}
                        label={t('counselor.continue')}
                        disabled={busy || !chosen || chosen.is_active === false || chosen.suitable === false}
                    />
                )}
            </div>

            {groups.length === 0 && selectedCategories.length > 0 && (
                <div className="rounded-card border border-line bg-surface-sunken p-6 text-center space-y-2">
                    <p className="text-sm text-ink-muted">
                        {t('counselor.filter.empty')}
                    </p>
                    <button
                        type="button"
                        onClick={clearCategories}
                        className="min-h-control text-xs font-semibold text-link underline"
                    >
                        {t('counselor.filter.all')}
                    </button>
                </div>
            )}

            {groups.map((group) => (
                <div key={group.key} className="space-y-4">
                    <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-ink-muted">
                            {group.key === 'local'
                                ? <Cpu className="h-3.5 w-3.5" />
                                : <Cloud className="h-3.5 w-3.5" />}
                            {group.label}
                        </span>
                        <span className="h-px flex-1 bg-line" />
                    </div>
                    <p className="text-sm text-ink-muted">{counselorHelp(lang)[group.key]}</p>
                    <div className="border-t border-line">
                        {group.items.map(renderCard)}
                    </div>
                </div>
            ))}
        </section>
    );
}
