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

    if (!hasLocalResume && frozen.length === 0) return null;

    // Più di una sessione congelata: scelta esplicita da un piccolo menu, non un
    // link diretto (non sappiamo quale riprendere).
    if (frozen.length > 1) {
        return (
            <div className="relative" ref={menuRef}>
                <Tooltip content={t('frozen.resumeTitle')}>
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        className="console-topbar-icon"
                        aria-label={t('frozen.resumeTitle')}
                        title={t('frozen.resumeTitle')}
                    >
                        <RotateCcw className="h-4 w-4" />
                    </button>
                </Tooltip>

                {open && (
                    <div className="absolute right-0 mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg z-[60] max-h-64 overflow-y-auto">
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                            {t('frozen.resumeTitle')}
                        </div>
                        {frozen.map((row) => (
                            <Link
                                key={row.session_id}
                                href={`/?frozen=${encodeURIComponent(row.session_id)}`}
                                onClick={() => setOpen(false)}
                                className="block truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                                {row.label || row.questionnaire_type}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const href = frozen.length === 1
        ? `/?frozen=${encodeURIComponent(frozen[0].session_id)}`
        : '/?resume=1';
    const label = frozen.length === 1 ? t('frozen.resumeOne') : t('header.resume');

    return (
        <Tooltip content={label}>
            <Link href={href} className="console-topbar-icon" aria-label={label} title={label}>
                <RotateCcw className="h-4 w-4" />
            </Link>
        </Tooltip>
    );
}
