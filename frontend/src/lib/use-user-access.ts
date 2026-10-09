'use client';

import { useCallback, useEffect, useState } from 'react';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { fetchUserAccess, getCachedUserAccess, type UserAccess } from './user-access.ts';

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

    const refresh = useCallback(() => {
        setVersion((v) => v + 1);
    }, []);

    return { access, loading, refresh };
}
