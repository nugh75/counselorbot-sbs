'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';

// Component-local reads only: no user-data cache. Account/role switches already
// reload the page; abort on unmount and reject responses from an old preview.
export function useTeacherResource<T>(path: string, parse: (payload: unknown) => T) {
    const [data, setData] = useState<T>();
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const active = useRef(false);
    const account = useRef<string | undefined>(undefined);
    const pending = useRef<AbortController | null>(null);

    const reload = useCallback(async () => {
        if (!active.current || pending.current) return;
        const controller = new AbortController();
        pending.current = controller;
        const current = () => active.current && !controller.signal.aborted;
        const sameAccount = () => account.current === getViewAsAccount()?.username;
        setLoading(true);
        setFailed(false);
        try {
            if (!sameAccount()) throw new Error('identity changed');
            const response = await apiFetch(path, { signal: controller.signal });
            if (!current()) return;
            if (!sameAccount() || response.status === 401 || response.status === 403) {
                setData(undefined);
                setForbidden(true);
                return;
            }
            if (!response.ok) throw new Error('read failed');
            const payload: unknown = await response.json();
            if (current() && sameAccount()) setData(parse(payload));
        } catch {
            if (current()) setFailed(true);
        } finally {
            if (current()) {
                if (!sameAccount()) { setData(undefined); setForbidden(true); }
                setLoading(false);
                pending.current = null;
            }
        }
    }, [path, parse]);

    useEffect(() => {
        active.current = true;
        account.current = getViewAsAccount()?.username;
        void reload();
        return () => {
            active.current = false;
            pending.current?.abort();
            pending.current = null;
        };
    }, [reload]);

    return { data, loading, failed, forbidden, reload };
}
