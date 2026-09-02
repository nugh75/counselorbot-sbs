'use client';

// Voci "Riprendi": sessioni congelate sul server più l'eventuale chat locale
// interrotta. Una sola fonte per l'icona desktop e per il menu mobile: quando
// ognuno teneva il proprio stato, il menu mobile conosceva solo il resume
// locale e le sessioni congelate restavano irraggiungibili da telefono.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getResume, subscribeToResume, type ResumePoint } from '@/lib/resume';
import { listFrozenSessions, subscribeToFrozenSessions, type FrozenSessionSummary } from '@/lib/frozen-session';
import { hasPqblProgress, subscribeToPqblProgress } from '@/lib/pqbl-progress';

export interface ResumeEntries {
    frozen: FrozenSessionSummary[];
    localResume: ResumePoint | null;
    // pQBL tiene il proprio progresso in locale e lo ripristina da solo: qui
    // serve solo a farlo comparire fra le sessioni riprendibili.
    pqbl: boolean;
    count: number;
}

export function useResumeEntries(): ResumeEntries {
    const hasLocalResume = useSyncExternalStore(
        subscribeToResume,
        () => (getResume() ? '1' : null),
        () => null,
    );
    // Il progresso pQBL cambia dentro /pqbl, da cui si esce con una navigazione
    // che rimonta l'header: qui basta leggerlo, come per il resume locale.
    const pqbl = useSyncExternalStore(
        subscribeToPqblProgress,
        () => (hasPqblProgress() ? '1' : null),
        () => null,
    ) !== null;
    const [frozen, setFrozen] = useState<FrozenSessionSummary[]>([]);
    const localResume = hasLocalResume ? getResume() : null;

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

    return { frozen, localResume, pqbl, count: frozen.length + (localResume ? 1 : 0) + (pqbl ? 1 : 0) };
}

// Riprendere ricarica la pagina: la home legge lo snapshot dai query param al
// mount, una navigazione client-side non lo rileggerebbe.
export function resumeHref(entry: { session_id: string }): string {
    return `/?frozen=${encodeURIComponent(entry.session_id)}`;
}

export const LOCAL_RESUME_HREF = '/?resume=1';

export const PQBL_RESUME_HREF = '/pqbl';
