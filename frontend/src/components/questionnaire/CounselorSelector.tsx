'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Compass, CircleOff } from 'lucide-react';
import { fetchCounselors, getSelectedCounselorId, setSelectedCounselorId, subscribeToCounselor, PublicCounselor } from '@/lib/counselor';

// Selettore counselor lato utente. Se non ci sono counselor configurati non
// renderizza nulla: il flusso resta identico a prima.
interface CounselorSelectorProps {
    onContinue?: () => void;
}

function counselorTone(description?: string | null): string {
    if (!description) return 'Approccio orientativo guidato';
    const first = description.split(/[.!?]/)[0]?.trim();
    return first || 'Approccio orientativo guidato';
}

export function CounselorSelector({ onContinue }: CounselorSelectorProps) {
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [selected, setSelected] = useState<number | null>(null);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        setLoaded(false);
        try {
            const list = await fetchCounselors();
            setCounselors(list);
            const stored = getSelectedCounselorId();
            // se il counselor salvato non esiste piu', azzera
            setSelected(list.some((c) => c.id === stored && c.is_active !== false) ? stored : null);
        } catch (e) {
            console.error('Failed to load counselors', e);
        } finally {
            setLoaded(true);
        }
    }, []);

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
                Caricamento counselor...
            </div>
        );
    }

    if (counselors.length === 0) {
        return (
            <div className="glass-panel p-8 text-center space-y-3">
                <h2 className="text-xl font-bold text-slate-900">Nessun counselor configurato</h2>
                <p className="text-sm text-slate-500">Chiedi a un amministratore di attivare almeno un counselor.</p>
            </div>
        );
    }

    return (
        <section className="space-y-5">
            <div className="glass-panel p-6 sm:p-7">
                <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        <Compass className="h-4 w-4" />
                        Primo passo
                    </div>
                    <h1 className="mt-2 text-2xl font-bold text-slate-900">Scegli il tuo counselor</h1>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        Ogni counselor interpreta il profilo con un approccio diverso. Scegli la figura con cui vuoi lavorare: resterà il riferimento per tutto lo strumento che stai per affrontare.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {counselors.map((c) => {
                    const disabled = c.is_active === false;
                    const isSelected = selected === c.id;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => choose(c)}
                            disabled={disabled}
                            className={`relative min-h-48 rounded-lg border p-5 text-left transition-colors ${
                                disabled
                                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                                    : isSelected
                                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                                        : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                            }`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${
                                    disabled ? 'bg-slate-200 text-slate-400' : 'bg-indigo-50 text-indigo-600'
                                }`}>
                                    {disabled ? <CircleOff className="h-5 w-5" /> : <Compass className="h-5 w-5" />}
                                </div>
                                <div className="min-w-0 flex-1 space-y-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-lg font-bold text-slate-900">{c.name}</h2>
                                            {disabled && (
                                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                                                    Non disponibile al momento
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm font-medium text-indigo-700">{counselorTone(c.description)}</p>
                                    </div>

                                    {c.description && (
                                        <p className="text-sm leading-relaxed text-slate-600">{c.description}</p>
                                    )}

                                    <div className="flex flex-wrap gap-1.5">
                                        {(c.questionnaire_types || []).slice(0, 6).map((q) => (
                                            <span key={q} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                                {q}
                                            </span>
                                        ))}
                                        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                            Dialogo guidato
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {isSelected && !disabled && (
                                <div className="absolute right-4 top-4 rounded-full bg-indigo-600 p-1 text-white">
                                    <Check className="h-4 w-4" />
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
                        Continua agli strumenti
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </section>
    );
}
