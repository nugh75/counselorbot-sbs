'use client';

// Voci "Riprendi": sessioni congelate sul server più l'eventuale chat locale
// interrotta. Una sola fonte per l'icona desktop e per il menu mobile: quando
// ognuno teneva il proprio stato, il menu mobile conosceva solo il resume
// locale e le sessioni congelate restavano irraggiungibili da telefono.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getResume, subscribeToResume, type ResumePoint } from '@/lib/resume';
import { listFrozenSessions, subscribeToFrozenSessions, type FrozenSessionSummary } from '@/lib/frozen-session';
import { hasPqblProgress, subscribeToPqblProgress } from '@/lib/pqbl-progress';
import { allowedResumeEntries } from '@/lib/resume-access';
import { useUserAccess } from '@/lib/use-user-access';
import { apiFetch } from '@/lib/auth';
import { parseStudentClassPaths } from '@/lib/class-paths';
import { mergePlanResumes } from '@/lib/path-resume';
import { isClassContentHidden } from '@/lib/user-access';

export interface ResumeEntries {
    frozen: FrozenSessionSummary[];
    localResume: ResumePoint | null;
    // pQBL tiene il proprio progresso in locale e lo ripristina da solo: qui
    // serve solo a farlo comparire fra le sessioni riprendibili.
    pqbl: boolean;
    count: number;
    error: boolean;
    loading: boolean;
    retry: () => void;
}

export function useResumeEntries(enabled = true): ResumeEntries {
    const { access } = useUserAccess();
    const hasLocalResume = useSyncExternalStore(
        subscribeToResume,
        () => (getResume() ? '1' : null),
        () => null,
    );
    // Il progresso pQBL cambia dentro /profilo/pqbl, da cui si esce con una navigazione
    // che rimonta l'header: qui basta leggerlo, come per il resume locale.
    const pqbl = useSyncExternalStore(
        subscribeToPqblProgress,
        () => (hasPqblProgress() ? '1' : null),
        () => null,
    ) !== null;
    const [saved, setSaved] = useState(() => mergePlanResumes([], null));
    const frozen = saved.rows;
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => setAttempt(value => value + 1), []);
    const localResume = hasLocalResume ? getResume() : null;

    useEffect(() => {
        if (!enabled) return;
        let alive = true;
        let version = 0;
        const load = () => {
            const current = ++version;
            setLoading(true);
            Promise.allSettled([listFrozenSessions(), apiFetch('/api/user/paths').then(async response => {
                if (!response.ok) throw new Error('plan resume');
                return parseStudentClassPaths(await response.json());
            })])
                .then(([snapshots, plans]) => {
                    if (!alive || current !== version) return;
                    setSaved(mergePlanResumes(snapshots.status === 'fulfilled' ? snapshots.value : [],
                        plans.status === 'fulfilled' ? plans.value : null));
                    setError(snapshots.status === 'rejected' || plans.status === 'rejected');
                })
                .catch(() => { if (alive && current === version) setError(true); })
                .finally(() => { if (alive && current === version) setLoading(false); });
        };
        load();
        const unsubscribe = subscribeToFrozenSessions(load);
        const visible = () => { if (document.visibilityState === 'visible') load(); };
        window.addEventListener('focus', visible);
        window.addEventListener('pageshow', visible);
        document.addEventListener('visibilitychange', visible);
        return () => {
            alive = false; unsubscribe();
            window.removeEventListener('focus', visible);
            window.removeEventListener('pageshow', visible);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [attempt, enabled]);

    const allowed = useMemo(
        () => allowedResumeEntries(access, { frozen, pqbl,
            localResume: localResume && !saved.completed.has(localResume.sessionId)
                && !(isClassContentHidden(access) && saved.planSessions.has(localResume.sessionId)) ? localResume : null }),
        [access, frozen, localResume, pqbl, saved],
    );

    return { ...allowed, error, loading, retry };
}

// Riprendere ricarica la pagina: la home legge lo snapshot dai query param al
// mount, una navigazione client-side non lo rileggerebbe.
export function resumeHref(entry: { session_id: string; path_id?: number | null; path_step_id?: number | null }): string {
    if (entry.path_id && entry.path_step_id) return `/profilo/piani-operativi/${entry.path_id}/${entry.path_step_id}?attempt=${encodeURIComponent(entry.session_id)}`;
    return `/?frozen=${encodeURIComponent(entry.session_id)}`;
}

export const LOCAL_RESUME_HREF = '/?resume=1';

export const PQBL_RESUME_HREF = '/profilo/pqbl';
