'use client';

import { useEffect, useState, useRef, useSyncExternalStore, useId } from 'react';
import { ChevronDown, User } from 'lucide-react';
import {
    fetchCounselors,
    getSelectedCounselorId,
    setSelectedCounselorId,
    subscribeToCounselor,
    PublicCounselor,
} from '@/lib/counselor';
import { getSelectedInstrumentId, subscribeToInstrument } from '@/lib/instrument';
import { useI18n } from '@/lib/i18n-context';

export function HeaderCounselor({ inline = false }: { inline?: boolean }) {
    const { t, lang } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionsId = useId();
    const selectedId = useSyncExternalStore(
        subscribeToCounselor,
        getSelectedCounselorId,
        () => null,
    );
    // Il chip compare solo durante il percorso con uno strumento: fuori (intro,
    // pagine di servizio) non ha senso scegliere il counselor.
    const instrumentId = useSyncExternalStore(subscribeToInstrument, getSelectedInstrumentId, () => null);
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchCounselors(lang, lang)
            .then((list) => { if (!cancelled) setCounselors(list); })
            .catch(() => { if (!cancelled) setCounselors([]); });
        return () => { cancelled = true; };
    }, [lang]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (!instrumentId) return null;

    const selected = counselors.find((c) => c.id === selectedId) || null;

    const choose = (c: PublicCounselor | null) => {
        setSelectedCounselorId(c ? c.id : null);
        setOpen(false);
        triggerRef.current?.focus();
    };

    return (
        <div className={inline ? 'contents' : 'relative'} ref={ref} onKeyDownCapture={(event) => {
            if (event.key === 'Escape' && open) {
                event.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
            }
        }}>
            <button
                ref={triggerRef}
                type="button"
                aria-expanded={open}
                aria-controls={optionsId}
                onClick={() => setOpen((o) => !o)}
                title={selected ? t('header.counselorChosen', { name: selected.name }) : t('counselor.pick')}
                className={`flex max-w-full h-8 items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    selected
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
            >
                <User className="h-3.5 w-3.5" />
                <span className="max-w-24 truncate sm:max-w-32">{selected ? selected.name : t('counselor.pick')}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </button>

            {open && (
                <div id={optionsId} className={`${inline ? 'w-full basis-full' : 'absolute right-0 w-56 shadow-lg z-[60]'} mt-1 rounded-md border border-slate-200 bg-white max-h-64 overflow-y-auto`}>
                    {selected && (
                        <button
                            type="button"
                            onClick={() => choose(null)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 border-b border-slate-100"
                        >
                            {t('counselor.deselect') || 'Nessuno'}
                        </button>
                    )}
                    {counselors.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => choose(c)}
                            disabled={c.is_active === false}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                c.id === selectedId
                                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                                    : c.is_active === false
                                        ? 'text-slate-300 cursor-not-allowed'
                                        : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <span className="truncate flex-1">{c.name}</span>
                            {c.is_active === false && (
                                <span className="shrink-0 text-2xs text-slate-500 italic">{t('counselor.unavailable')}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
