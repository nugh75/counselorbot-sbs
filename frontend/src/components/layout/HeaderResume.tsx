'use client';

import Link from 'next/link';
import { ResumeLoadError } from '@/components/layout/ResumeLoadError';
import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { LOCAL_RESUME_HREF, PQBL_RESUME_HREF, resumeHref, type ResumeEntries } from '@/lib/use-resume-entries';
import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';

// Pulsante "Riprendi" nell'header: compare quando c'è una sessione congelata
// sul server (ripresa da qualsiasi dispositivo) o una chat interrotta salvata
// localmente. Le voci arrivano dall'header, che le condivide col menu mobile.
export function HeaderResume({ entries }: { entries: ResumeEntries }) {
    const { t } = useI18n();
    const { frozen, localResume, pqbl, count } = entries;
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const resumeWithReload = (href: string) => {
        window.location.assign(href);
    };

    // Più sessioni congelate: chiudi il menu al click fuori.
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (count === 0 && !entries.error) return null;

    // Resume apre sempre l'elenco: l'interazione resta prevedibile sia con una
    // sola sessione, sia quando convivono più snapshot e una chat locale.
    return (
        <div className="relative" ref={menuRef}>
            <Tooltip content={t('frozen.resumeTitle')}>
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="console-topbar-icon"
                    aria-label={t('frozen.resumeTitle')}
                    aria-haspopup="menu"
                    aria-expanded={open}
                >
                    <RotateCcw className="h-4 w-4" />
                </button>
            </Tooltip>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 mt-1 w-56 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg z-[60]"
                >
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
                        {t('frozen.resumeTitle')}
                    </div>
                    <ResumeLoadError entries={entries} />
                    {frozen.map((row) => (
                        <Link
                            key={row.session_id}
                            role="menuitem"
                            href={resumeHref(row)}
                            onClick={(event) => {
                                event.preventDefault();
                                setOpen(false);
                                resumeWithReload(resumeHref(row));
                            }}
                            className="block truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                            {row.label || row.questionnaire_type}
                        </Link>
                    ))}
                    {localResume && (
                        <Link
                            role="menuitem"
                            href={LOCAL_RESUME_HREF}
                            onClick={(event) => {
                                event.preventDefault();
                                setOpen(false);
                                resumeWithReload(LOCAL_RESUME_HREF);
                            }}
                            className="block truncate border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                            {t('header.resume')} · {localResume.instrument}
                        </Link>
                    )}
                    {pqbl && (
                        <Link
                            role="menuitem"
                            href={PQBL_RESUME_HREF}
                            onClick={() => setOpen(false)}
                            className="block truncate border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                            {t('header.resume')} · {t('pqbl.card.badge')}
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
