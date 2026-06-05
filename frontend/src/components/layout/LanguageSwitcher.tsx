'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { LANGUAGES } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

export function LanguageSwitcher() {
    const { lang, setLang, t } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50 transition-colors"
                aria-label={t('nav.language')}
                title={t('nav.language')}
            >
                <span className="text-lg leading-none">{current.flag}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {open && (
                <div className="absolute right-0 mt-1 grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-lg z-[60]">
                    {LANGUAGES.map(l => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => { setLang(l.code); setOpen(false); }}
                            title={l.label}
                            aria-label={l.label}
                            className={`flex h-9 w-9 items-center justify-center rounded-md text-lg leading-none transition-colors hover:bg-slate-50 ${l.code === lang ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                        >
                            <span>{l.flag}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
