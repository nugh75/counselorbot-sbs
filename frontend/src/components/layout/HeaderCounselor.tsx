'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Compass, X } from 'lucide-react';
import {
    fetchCounselors,
    getSelectedCounselorId,
    setSelectedCounselorId,
    subscribeToCounselor,
    PublicCounselor,
} from '@/lib/counselor';

// Chip compatto nell'header: mostra il counselor selezionato (se presente) e
// permette di cambiarlo/rimuoverlo senza affollare la barra. Non renderizza
// nulla finche' non c'e' una scelta attiva.
export function HeaderCounselor() {
    const selectedId = useSyncExternalStore(
        subscribeToCounselor,
        getSelectedCounselorId,
        () => null,
    );
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let active = true;
        fetchCounselors().then((list) => { if (active) setCounselors(list); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const selected = counselors.find((c) => c.id === selectedId) || null;
    if (!selected) return null;

    const choose = (id: number | null) => {
        setSelectedCounselorId(id);
        setOpen(false);
    };

    return (
        <div ref={ref} className="relative min-w-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex min-w-0 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                title={selected.name}
            >
                <Compass className="h-4 w-4 shrink-0" />
                <span className="max-w-28 truncate sm:max-w-40">{selected.name}</span>
            </button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {counselors.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => choose(c.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            <Compass className="h-4 w-4 shrink-0 text-indigo-600" />
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            {c.id === selectedId && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => choose(null)}
                        className="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-slate-50"
                    >
                        <X className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">Nessun counselor</span>
                    </button>
                </div>
            )}
        </div>
    );
}
