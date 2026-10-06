'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Cpu, Cloud, Search, Sparkles, X, Filter } from 'lucide-react';
import {
    fetchCounselorCategories,
    fetchCounselors,
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
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Ricerca per stile / approccio
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchNoMatch, setSearchNoMatch] = useState(false);
    const [recommendation, setRecommendation] = useState<CounselorRecommendationResponse | null>(null);

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

    // Filtra counselor in base alla categoria attiva
    const filteredCounselors = useMemo(() => {
        if (!selectedCategory) return counselors;
        return counselors.filter((c) =>
            (c.approach_categories || []).some(
                (cat) => cat.toLowerCase().trim() === selectedCategory.toLowerCase().trim()
            )
        );
    }, [counselors, selectedCategory]);

    if (!loaded) {
        return (
            <div className="glass-panel p-8 text-center text-sm text-slate-500">
                {t('counselor.loading')}
            </div>
        );
    }

    if (counselors.length === 0) {
        return (
            <div className="glass-panel p-8 text-center space-y-3">
                <h2 className="text-xl font-bold text-slate-900">{t('counselor.empty.title')}</h2>
                <p className="text-sm text-slate-500">{t('counselor.empty.body')}</p>
            </div>
        );
    }

    const renderCard = (c: PublicCounselor) => {
        const disabled = c.is_active === false || c.suitable === false;
        const isSelected = selected === c.id;
        const tagline = getCounselorTagline(c, lang);
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
                className={`relative rounded-lg border p-4 text-left transition-colors ${
                    disabled
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                        : isSelected
                            ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                }`}
            >
                <div className="flex items-start gap-3">
                    {c.avatar_url && (
                        <img
                            src={c.avatar_url}
                            alt={c.name}
                            className="h-11 w-11 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                            onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                        />
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-bold text-slate-900">{c.name}</h2>
                                {c.is_active === false && (
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-2xs font-bold uppercase text-slate-500">
                                        {t('counselor.unavailable')}
                                    </span>
                                )}
                                {c.is_active !== false && c.suitable === false && (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-2xs font-bold uppercase text-amber-700">
                                        {t('counselor.notForInstrument')}
                                    </span>
                                )}
                                {c.model_origin && (
                                    <span
                                        title={t(c.model_origin === 'local' ? 'counselor.origin.local.hint' : 'counselor.origin.external.hint')}
                                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-2xs font-medium text-slate-500"
                                    >
                                        {c.model_origin === 'local'
                                            ? <Cpu className="h-3 w-3" />
                                            : <Cloud className="h-3 w-3" />}
                                        {t(c.model_origin === 'local' ? 'counselor.origin.local' : 'counselor.origin.external')}
                                    </span>
                                )}
                                {c.model && (
                                    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-2xs font-medium text-indigo-700">
                                        <span>{t('counselor.modelLabel')}</span>
                                        <span className="truncate font-mono" title={c.model}>{c.model}</span>
                                    </span>
                                )}
                            </div>

                            {tagline ? (
                                <p className="mt-1.5 rounded border border-indigo-100 bg-indigo-50/70 px-2.5 py-1 text-xs font-medium italic text-indigo-950/90 leading-relaxed">
                                    {`"${tagline}"`}
                                </p>
                            ) : null}

                            {c.approach_categories && c.approach_categories.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                    {c.approach_categories.map((cat) => (
                                        <span
                                            key={cat}
                                            className="rounded-full border border-indigo-200/70 bg-indigo-50/50 px-2 py-0.5 text-2xs font-semibold text-indigo-700"
                                        >
                                            {formatCategoryLabel(cat, lang)}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.description || t('counselor.toneDefault')}</p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {(c.questionnaire_types || []).slice(0, 6).map((q) => (
                                <span key={q} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-2xs font-semibold text-slate-500">
                                    {q}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {isSelected && !disabled && (
                    <div className="absolute right-3 top-3 rounded-full bg-indigo-600 p-1 text-white">
                        <Check className="h-3.5 w-3.5" />
                    </div>
                )}
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
            <p className="text-sm leading-relaxed text-slate-600">{counselorHelp(lang).tools}</p>

            {/* Ricerca per stile o approccio cercato */}
            <div className="glass-panel space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <label htmlFor="counselor-search-input" className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-indigo-600" />
                        {t('counselor.search.label')}
                    </label>
                    {searchQuery || recommendation ? (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 self-start sm:self-auto"
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
                            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {searching && (
                            <div className="absolute right-3 top-2.5 text-xs text-slate-400">
                                <span className="animate-spin inline-block mr-1">⌛</span>
                            </div>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={searching || !searchQuery.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                    >
                        <Search className="h-4 w-4" />
                        <span>{t('counselor.search.button')}</span>
                    </button>
                </form>

                {searchNoMatch && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                        {t('counselor.search.noMatch')}
                    </p>
                )}

                {/* Scheda raccomandazione se presente */}
                {recommendation?.counselor && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-4 transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex items-start gap-3">
                                {recommendation.counselor.avatar_url && (
                                    <img
                                        src={recommendation.counselor.avatar_url}
                                        alt={recommendation.counselor.name}
                                        className="h-12 w-12 shrink-0 rounded-full border border-indigo-300 bg-white object-cover"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLElement).style.display = 'none';
                                        }}
                                    />
                                )}
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                                            <Sparkles className="h-3.5 w-3.5" />
                                            {t('counselor.search.recommendationTitle')}:
                                        </span>
                                        <span className="font-bold text-slate-900 text-base">
                                            {recommendation.counselor.name}
                                        </span>
                                        {recommendation.confidence > 0 && (
                                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-2xs font-semibold text-indigo-800">
                                                {Math.round(recommendation.confidence * 100)}% {t('counselor.search.confidence')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-700 leading-relaxed">
                                        {recommendation.explanation}
                                    </p>
                                    {recommendation.matched_categories.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {recommendation.matched_categories.map((cat) => (
                                                <span
                                                    key={cat}
                                                    className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-2xs font-semibold text-indigo-700"
                                                >
                                                    {formatCategoryLabel(cat, lang)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex sm:flex-col items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (recommendation.counselor) {
                                            choose(recommendation.counselor);
                                        }
                                    }}
                                    className={`rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition-colors ${
                                        selected === recommendation.counselor.id
                                            ? 'bg-indigo-700 text-white ring-2 ring-indigo-400'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                                >
                                    {selected === recommendation.counselor.id
                                        ? `✓ ${recommendation.counselor.name} (${t('counselor.search.selected')})`
                                        : `${t('counselor.search.selectAction')} (${recommendation.counselor.name})`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Filtro per categoria */}
            {allCategories.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <Filter className="h-3.5 w-3.5 text-slate-400" />
                        <span>{t('counselor.filter.label')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setSelectedCategory(null)}
                            className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                selectedCategory === null
                                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                                    : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50 font-medium'
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
                            const active = selectedCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setSelectedCategory(active ? null : cat)}
                                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                        active
                                            ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                                            : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50 font-medium'
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
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
                    <p>
                        <span className="font-semibold">{chosen?.name}</span>{' '}
                        {t('counselor.unfit.notice')}{' '}
                        {questionnaireName && <span className="font-semibold">{questionnaireName}</span>}
                    </p>
                    {fitNames.length > 0 && (
                        <p className="mt-1">
                            {t('counselor.unfit.alternatives')} {fitNames.join(', ')}
                        </p>
                    )}
                </div>
            )}

            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                {onContinue && (
                    <ForwardButton
                        onClick={() => { if (selected) onContinue(selected); }}
                        label={t('counselor.continue')}
                        disabled={busy || !chosen || chosen.is_active === false || chosen.suitable === false}
                    />
                )}
            </div>

            {groups.length === 0 && selectedCategory && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center space-y-2">
                    <p className="text-sm text-slate-600">
                        {t('counselor.filter.empty')}
                    </p>
                    <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                    >
                        {t('counselor.filter.all')}
                    </button>
                </div>
            )}

            {groups.map((group) => (
                <div key={group.key} className="space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                            {group.key === 'local'
                                ? <Cpu className="h-3.5 w-3.5" />
                                : <Cloud className="h-3.5 w-3.5" />}
                            {group.label}
                        </span>
                        <span className="h-px flex-1 bg-slate-200" />
                    </div>
                    <p className="text-sm text-slate-600">{counselorHelp(lang)[group.key]}</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.items.map(renderCard)}
                    </div>
                </div>
            ))}
        </section>
    );
}
