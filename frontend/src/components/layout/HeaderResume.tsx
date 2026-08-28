'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RotateCcw } from 'lucide-react';
import { getResume, subscribeToResume } from '@/lib/resume';
import { listFrozenSessions, subscribeToFrozenSessions, type FrozenSessionSummary } from '@/lib/frozen-session';
import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';

// Pulsante "Riprendi" nell'header: compare quando c'è una sessione congelata
// sul server (ripresa da qualsiasi dispositivo) o una chat interrotta salvata
// localmente. Disponibile da ogni pagina.
export function HeaderResume() {
    const { t } = useI18n();
    const hasLocalResume = useSyncExternalStore(
        subscribeToResume,
        () => (getResume() ? '1' : null),
        () => null,
    );
    const [frozen, setFrozen] = useState<FrozenSessionSummary[]>([]);
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const localResume = hasLocalResume ? getResume() : null;
    const resumeWithReload = (href: string) => {
        window.location.assign(href);
    };

    useEffect(() => {
        let alive = true;
        const load = () => {
            listFrozenSessions()
                .then((rows) => {
                    if (!alive) return;
                    // Due freeze concorrenti (uvicorn multi-worker) possono inserire due
                    // righe per lo stesso session_id prima che il collasso lato server le
                    // veda: dedup qui, tenendo la prima (ordine updated_at decrescente).
                    const seen = new Set<string>();
                    const deduped = rows.filter((row) => {
                        if (seen.has(row.session_id)) return false;
                        seen.add(row.session_id);
                        return true;
                    });
                    setFrozen(deduped);
                })
                .catch(() => { if (alive) setFrozen([]); });
        };
        load();
        const unsubscribe = subscribeToFrozenSessions(load);
        return () => { alive = false; unsubscribe(); };
    }, []);

    // Più sessioni congelate: chiudi il menu al click fuori.
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const resumeCount = frozen.length + (localResume ? 1 : 0);

    if (resumeCount === 0) return null;

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
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        {t('frozen.resumeTitle')}
                    </div>
                    {frozen.map((row) => (
                        <Link
                            key={row.session_id}
                            role="menuitem"
                            href={`/?frozen=${encodeURIComponent(row.session_id)}`}
                            onClick={(event) => {
                                event.preventDefault();
                                setOpen(false);
                                resumeWithReload(`/?frozen=${encodeURIComponent(row.session_id)}`);
                            }}
                            className="block truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                            {row.label || row.questionnaire_type}
                        </Link>
                    ))}
                    {localResume && (
                        <Link
                            role="menuitem"
                            href="/?resume=1"
                            onClick={(event) => {
                                event.preventDefault();
                                setOpen(false);
                                resumeWithReload('/?resume=1');
                            }}
                            className="block truncate border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                            {t('header.resume')} · {localResume.instrument}
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
