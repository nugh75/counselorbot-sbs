'use client';

import { useSyncExternalStore } from 'react';

// La stessa soglia del pannello laterale: sotto questa larghezza Idea passa
// alle schede, sopra mette la mappa accanto alla conversazione.
const desktopQuery = '(min-width: 1024px)';

const subscribe = (notify: () => void) => {
    const media = window.matchMedia(desktopQuery);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
};

export function useIsDesktop(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(desktopQuery).matches,
        () => false,
    );
}
