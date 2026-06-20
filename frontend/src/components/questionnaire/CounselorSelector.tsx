'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Compass } from 'lucide-react';
import { fetchCounselors, getSelectedCounselorId, setSelectedCounselorId, subscribeToCounselor, PublicCounselor } from '@/lib/counselor';

// Selettore counselor lato utente. Se non ci sono counselor configurati non
// renderizza nulla: il flusso resta identico a prima.
export function CounselorSelector() {
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
            setSelected(list.some((c) => c.id === stored) ? stored : null);
        } catch (e) {
            console.error('Failed to load counselors', e);
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Mantiene allineata l'evidenziazione se il counselor cambia dall'header.
    useEffect(() => subscribeToCounselor(() => setSelected(getSelectedCounselorId())), []);

    const choose = (id: number) => {
        const next = selected === id ? null : id;
        setSelected(next);
        setSelectedCounselorId(next);
    };

    if (!loaded || counselors.length === 0) return null;

    return (
        <div className="mb-8">
            <h3 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
                Scegli il tuo counselor
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {counselors.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => choose(c.id)}
                        className={`relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${selected === c.id ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-300' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                        <div className="text-indigo-600">
                            <Compass className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                            <div className="font-semibold text-slate-900">{c.name}</div>
                            {c.description && <div className="mt-0.5 text-sm text-slate-500">{c.description}</div>}
                            {c.questionnaire_types && c.questionnaire_types.length > 0 && (
                                <div className="mt-1 text-xs text-slate-400">{c.questionnaire_types.join(' · ')}</div>
                            )}
                        </div>
                        {selected === c.id && (
                            <Check className="absolute right-3 top-3 h-5 w-5 text-indigo-600" />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
