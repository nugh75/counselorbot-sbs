'use client';

// Quando l'admin e' in anteprima ruolo, ogni chiamata /api porta l'header
// X-View-As con l'account demo: cosi' il backend scopa i dati per-utente a
// quell'account fittizio (non all'admin). L'install avviene al caricamento del
// modulo (non in useEffect) per precedere i fetch nei componenti.
import { getViewAsRole, VIEW_AS_ACCOUNTS } from '@/lib/auth';

let installed = false;

function installFetchPatch() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    const role = getViewAsRole();
    if (!role) return;
    const demoUser = VIEW_AS_ACCOUNTS[role].username;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        try {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;
            if (url.startsWith('/api') || url.includes('/api/')) {
                const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
                headers.set('X-View-As', demoUser);
                return originalFetch(input, { ...init, headers });
            }
        } catch {
            /* fall through to the original fetch */
        }
        return originalFetch(input, init);
    };
}

installFetchPatch();

export function ViewAsFetchPatch() {
    return null;
}
