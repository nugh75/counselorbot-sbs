'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Compass, CircleOff, Cpu, Cloud } from 'lucide-react';
import { fetchCounselors, getSelectedCounselorId, setSelectedCounselorId, subscribeToCounselor, PublicCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';

// Selettore counselor lato utente. Se non ci sono counselor configurati non
// renderizza nulla: il flusso resta identico a prima.
interface CounselorSelectorProps {
    onContinue?: () => void;
    onBack?: () => void;
    questionnaireName?: string;
}

function counselorTone(description: string | null | undefined, fallback: string): string {
    if (!description) return fallback;
    const first = description.split(/[.!?]/)[0]?.trim();
    return first || fallback;
}

export function CounselorSelector({ onContinue, onBack, questionnaireName }: CounselorSelectorProps) {
    const { t, lang } = useI18n();
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [selected, setSelected] = useState<number | null>(null);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        setLoaded(false);
        try {
            const list = await fetchCounselors(lang);
            setCounselors(list);
            const stored = getSelectedCounselorId();
            // se il counselor salvato non esiste piu', azzera
            setSelected(list.some((c) => c.id === stored && c.is_active !== false) ? stored : null);
        } catch (e) {
            console.error('Failed to load counselors', e);
        } finally {
            setLoaded(true);
        }
    }, [lang]);

    useEffect(() => { void load(); }, [load]);

    // Mantiene allineata l'evidenziazione se il counselor cambia dall'header.
    useEffect(() => subscribeToCounselor(() => setSelected(getSelectedCounselorId())), []);

    const choose = (counselor: PublicCounselor) => {
        if (counselor.is_active === false) return;
        setSelected(counselor.id);
        setSelectedCounselorId(counselor.id);
    };

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

    return (
        <section className="space-y-5">
            {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}

            <div className="glass-panel p-6 sm:p-7">
                <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        <Compass className="h-4 w-4" />
                        {t('counselor.kicker')}
                    </div>
                    <h1 className="mt-2 text-2xl font-bold text-slate-900">{t('counselor.title')}</h1>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {t('counselor.intro')}
                    </p>
                    {questionnaireName && (
                        <p className="mt-3 inline-flex rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900">
                            {t('counselor.selectedTool')}: {questionnaireName}
                        </p>
                    )}
                    <p className="mt-3 text-sm leading-relaxed text-slate-500">
                        <strong className="text-slate-700">{t('counselor.explain.title')}:</strong> {t('counselor.explain.body')}
                    </p>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {counselors.map((c) => {
                    const disabled = c.is_active === false;
                    const isSelected = selected === c.id;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => choose(c)}
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
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                                    disabled ? 'bg-slate-200 text-slate-400' : 'bg-indigo-50 text-indigo-600'
                                }`}>
                                    {disabled ? <CircleOff className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-base font-bold text-slate-900">{c.name}</h2>
                                            {disabled && (
                                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                                                    {t('counselor.unavailable')}
                                                </span>
                                            )}
                                            {c.model_origin && (
                                                <span
                                                    title={t(c.model_origin === 'local' ? 'counselor.origin.local.hint' : 'counselor.origin.external.hint')}
                                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
                                                >
                                                    {c.model_origin === 'local'
                                                        ? <Cpu className="h-3 w-3" />
                                                        : <Cloud className="h-3 w-3" />}
                                                    {t(c.model_origin === 'local' ? 'counselor.origin.local' : 'counselor.origin.external')}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-sm text-slate-600">{counselorTone(c.description, t('counselor.toneDefault'))}</p>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5">
                                        {(c.questionnaire_types || []).slice(0, 6).map((q) => (
                                            <span key={q} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
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
                })}
            </div>

            {onContinue && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={onContinue}
                        disabled={!selected}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {t('counselor.continue')}
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </section>
    );
}
