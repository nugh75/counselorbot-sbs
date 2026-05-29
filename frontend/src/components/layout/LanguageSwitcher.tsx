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
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm"
                aria-label={t('nav.language')}
            >
                <span className="text-lg leading-none">{current.flag}</span>
                <span className="hidden sm:inline text-slate-700 font-medium">{current.code.toUpperCase()}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {open && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden z-[60]">
                    {LANGUAGES.map(l => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => { setLang(l.code); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-slate-50 ${l.code === lang ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}`}
                        >
                            <span className="text-lg leading-none">{l.flag}</span>
                            <span>{l.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
