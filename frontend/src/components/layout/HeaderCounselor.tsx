'use client';

import { useEffect, useState, useRef, useSyncExternalStore, useCallback } from 'react';
import { ChevronDown, User } from 'lucide-react';
import {
    fetchCounselors,
    getSelectedCounselorId,
    setSelectedCounselorId,
    subscribeToCounselor,
    PublicCounselor,
} from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';

export function HeaderCounselor() {
    const { t, lang } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selectedId = useSyncExternalStore(
        subscribeToCounselor,
        getSelectedCounselorId,
        () => null,
    );
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);

    const load = useCallback(async () => {
        const list = await fetchCounselors(lang, lang);
        setCounselors(list);
    }, [lang]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const selected = counselors.find((c) => c.id === selectedId) || null;

    const choose = (c: PublicCounselor | null) => {
        setSelectedCounselorId(c ? c.id : null);
        setOpen(false);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                title={selected ? t('header.counselorChosen', { name: selected.name }) : t('counselor.pick')}
                className={`flex h-8 items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    selected
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
            >
                <User className="h-3.5 w-3.5" />
                <span className="max-w-24 truncate sm:max-w-32">{selected ? selected.name : t('counselor.pick')}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {open && (
                <div className="absolute right-0 mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg z-[60] max-h-64 overflow-y-auto">
                    {selected && (
                        <button
                            type="button"
                            onClick={() => choose(null)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-50 border-b border-slate-100"
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
                                <span className="shrink-0 text-[10px] text-slate-400 italic">{t('counselor.unavailable')}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
