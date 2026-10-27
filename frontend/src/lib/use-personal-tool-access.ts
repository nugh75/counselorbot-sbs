'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './auth';
import { parseUserAccess, type UserAccess } from './personal-tool-access';
import { USER_ACCESS_CHANGED } from './user-access';

// Resolved class access for the personal area; null until known or on error.
export function usePersonalToolAccess(): UserAccess | null {
    const [access, setAccess] = useState<UserAccess | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        void apiFetch('/api/user/access', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
            .then(async response => {
                if (response.ok && !controller.signal.aborted) setAccess(parseUserAccess(await response.json()));
            })
            .catch(() => {});
        return () => controller.abort();
    }, []);
    useEffect(() => {
        const onChange = (event: Event) => {
            try { setAccess(parseUserAccess((event as CustomEvent<unknown>).detail)); } catch { /* keep the last valid access */ }
        };
        window.addEventListener(USER_ACCESS_CHANGED, onChange);
        return () => window.removeEventListener(USER_ACCESS_CHANGED, onChange);
    }, []);
    return access;
}
