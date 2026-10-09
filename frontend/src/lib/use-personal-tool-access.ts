'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './auth';
import { parseUserAccess, type UserAccess } from './personal-tool-access';

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
    return access;
}
