'use client';

import { useCallback, useEffect, useState } from 'react';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { fetchUserAccess, getCachedUserAccess, USER_ACCESS_CHANGED, type UserAccess } from './user-access.ts';

export function useUserAccess() {
    const [access, setAccess] = useState<UserAccess | null>(() => getCachedUserAccess());
    const [loading, setLoading] = useState<boolean>(() => access === null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let active = true;
        fetchUserAccess()
            .then((result) => {
                if (active) {
                    setAccess(result);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (active) {
                    setLoading(false);
                }
            });
        return () => {
            active = false;
        };
    }, [version]);

    // A view switch (#146) updates every mounted consumer at once.
    useEffect(() => {
        const onChange = (event: Event) => {
            setAccess((event as CustomEvent<UserAccess>).detail);
            setLoading(false);
        };
        window.addEventListener(USER_ACCESS_CHANGED, onChange);
        return () => window.removeEventListener(USER_ACCESS_CHANGED, onChange);
    }, []);

    const refresh = useCallback(() => {
        setVersion((v) => v + 1);
    }, []);

    return { access, loading, refresh };
}
