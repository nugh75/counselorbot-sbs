'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Cpu, Cloud } from 'lucide-react';
import { fetchCounselors, getSelectedCounselorId, setSelectedCounselorId, subscribeToCounselor, PublicCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';

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
            const list = await fetchCounselors(lang, lang);
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

    const renderCard = (c: PublicCounselor) => {
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
    };

    // Locale prima, cloud dopo. Mantiene l'ordine (sort_order) entro ogni gruppo.
    const localItems = counselors.filter((c) => c.model_origin === 'local');
    const cloudItems = counselors.filter((c) => c.model_origin !== 'local');
    const groups = [
        { key: 'local' as const, label: t('counselor.group.local'), items: localItems },
        { key: 'external' as const, label: t('counselor.group.external'), items: cloudItems },
    ].filter((g) => g.items.length > 0);

    return (
        <section className="space-y-5">
            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                {onContinue && (
                    <ForwardButton
                        onClick={onContinue}
                        label={t('counselor.continue')}
                        disabled={!selected}
                    />
                )}
            </div>

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
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.items.map(renderCard)}
                    </div>
                </div>
            ))}

            </section>
    );
}
