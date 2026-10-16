'use client';

import { ChevronDown } from 'lucide-react';
import { LANGUAGES } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useDisclosure } from '@/lib/use-disclosure';
import { Tooltip } from '@/components/ui/Tooltip';
import { FlagIcon } from './FlagIcon';

export function LanguageSwitcher() {
    const { lang, setLang, t } = useI18n();
    const { open, containerRef, triggerRef, triggerProps, onBlur, closeToTrigger } = useDisclosure('language-panel');

    const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

    // Il nome del pulsante dice la lingua attuale: dopo la scelta il focus torna
    // qui e lo screen reader annuncia la nuova lingua.
    return (
        <div className="relative" ref={containerRef} onBlur={onBlur}>
            <Tooltip content={t('nav.language')}>
                <button
                    type="button"
                    ref={triggerRef}
                    {...triggerProps}
                    className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50 transition-colors pointer-coarse:h-[44px]"
                    aria-label={`${t('nav.language')}: ${current.label}`}
                >
                    <FlagIcon code={current.code} className="h-4 w-6" />
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>
            </Tooltip>

            {open && (
                <div id="language-panel" className="header-panel absolute right-0 mt-1 grid grid-cols-[repeat(3,2.25rem)] justify-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-lg z-[60] pointer-coarse:grid-cols-[repeat(3,44px)]">
                    {LANGUAGES.map(l => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => { setLang(l.code); closeToTrigger(); }}
                            title={l.label}
                            aria-label={l.label}
                            aria-pressed={l.code === lang}
                            lang={l.code}
                            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-slate-50 pointer-coarse:h-[44px] pointer-coarse:w-[44px] ${l.code === lang ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                        >
                            <FlagIcon code={l.code} className="h-4 w-6" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
