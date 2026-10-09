'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to manage collapsed/expanded state of a catalog section.
 * - When hasActivePath is false (student has no active class path): always open (not collapsible).
 * - When hasActivePath is true: defaults to collapsed (false), unless user previously toggled it open in localStorage.
 * - Safe against storage access exceptions (private browsing / disabled cookies).
 */
export function useCollapsedCatalog(storageKey: string, hasActivePath: boolean) {
    const [isOpen, setIsOpen] = useState<boolean>(() => {
        if (!hasActivePath) return true;
        try {
            if (typeof window !== 'undefined') {
                const stored = window.localStorage.getItem(storageKey);
                if (stored !== null) return stored === 'true';
            }
        } catch {
            // Ignore storage access error
        }
        return false;
    });

    useEffect(() => {
        if (!hasActivePath) {
            setIsOpen(true);
            return;
        }

        try {
            const stored = window.localStorage.getItem(storageKey);
            if (stored !== null) {
                setIsOpen(stored === 'true');
                return;
            }
        } catch {
            // Ignore storage access error
        }

        setIsOpen(false);
    }, [storageKey, hasActivePath]);

    const toggle = useCallback(() => {
        setIsOpen((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem(storageKey, String(next));
            } catch {
                // Ignore storage failure
            }
            return next;
        });
    }, [storageKey]);

    return {
        isOpen: hasActivePath ? isOpen : true,
        toggle,
        isCollapsible: hasActivePath,
    };
}
