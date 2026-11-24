'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';

// Component-local reads only: no user-data cache. Account/role switches already
// reload the page; abort on unmount and reject responses from an old preview.
// A reload of a path that already has data refreshes in the background
// (`refreshing`) so callers keep their tree, and its unsaved drafts, mounted.
export function useTeacherResource<T>(path: string, parse: (payload: unknown) => T) {
    const [data, setData] = useState<T>();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [failed, setFailed] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const [seenPath, setSeenPath] = useState(path);
    if (seenPath !== path) {
        setSeenPath(path);
        setLoading(true);
        setFailed(false);
    }
    const active = useRef(false);
    const account = useRef<string | undefined>(undefined);
    const pending = useRef<AbortController | null>(null);
    const loadedPath = useRef<string | undefined>(undefined);

    const runFetch = useCallback((controller: AbortController) => {
        const current = () => active.current && !controller.signal.aborted;
        const sameAccount = () => account.current === getViewAsAccount()?.username;
        Promise.resolve()
            .then(async () => {
                if (!sameAccount()) throw new Error('identity changed');
                const response = await apiFetch(path, { signal: controller.signal });
                if (!current()) return;
                if (!sameAccount() || response.status === 401 || response.status === 403) {
                    setData(undefined);
                    loadedPath.current = undefined;
                    setForbidden(true);
                    return;
                }
                if (!response.ok) throw new Error('read failed');
                const payload: unknown = await response.json();
                if (current() && sameAccount()) { setData(parse(payload)); loadedPath.current = path; setFailed(false); }
            })
            .catch(() => {
                if (current()) setFailed(true);
            })
            .finally(() => {
                if (current()) {
                    if (!sameAccount()) { setData(undefined); loadedPath.current = undefined; setForbidden(true); }
                    setLoading(false);
                    setRefreshing(false);
                    pending.current = null;
                }
            });
    }, [path, parse]);

    const reload = useCallback(async () => {
        if (!active.current || pending.current) return;
        const controller = new AbortController();
        pending.current = controller;
        if (loadedPath.current === path) setRefreshing(true); else setLoading(true);
        setFailed(false);
        runFetch(controller);
    }, [path, runFetch]);

    useEffect(() => {
        active.current = true;
        account.current = getViewAsAccount()?.username;
        const controller = new AbortController();
        pending.current = controller;
        runFetch(controller);
        return () => {
            active.current = false;
            pending.current?.abort();
            pending.current = null;
        };
    }, [runFetch]);

    return { data, loading, refreshing, failed, forbidden, reload };
}
