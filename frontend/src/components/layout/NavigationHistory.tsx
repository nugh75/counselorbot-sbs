'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Mark only navigation observed inside this app. history.length alone can
// send a direct visitor back to an unrelated site.
export function NavigationHistory() {
    const pathname = usePathname();
    const previous = useRef<string | null>(null);
    const restoring = useRef(false);
    useEffect(() => {
        const onPopState = () => { restoring.current = window.location.pathname !== previous.current; };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);
    useEffect(() => {
        if (previous.current && previous.current !== pathname && !restoring.current) {
            window.history.replaceState({ ...window.history.state, cbPreviousPage: previous.current }, '');
        }
        previous.current = pathname;
        restoring.current = false;
    }, [pathname]);
    return null;
}
