// Identità utente da ai4auth (forward-auth). Il backend legge gli header
// Remote-* iniettati da nginx ed espone /api/auth/me.

export interface Identity {
    email: string;
    username: string;
    name: string;
    groups: string[];
    is_admin: boolean;
    authenticated: boolean;
}

export async function getIdentity(): Promise<Identity | null> {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Console ai4educ: portale per tutti gli utenti, manager per gli amministratori.
export const AI4EDUC_PORTAL_URL = 'https://portal.ai4educ.org/';
export const AI4EDUC_MANAGER_URL = 'https://manager.ai4educ.org';

// Logout gestito da ai4auth (distrugge la sessione e il cookie di dominio)
export const AI4AUTH_LOGOUT_URL = 'https://auth.ai4educ.org/logout';

// Login ai4auth con ritorno alla pagina corrente (?rd=)
export const AI4AUTH_LOGIN_URL = 'https://auth.ai4educ.org/login';

const DEPLOYED_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://counselorbot-sbs.ai4educ.org';

export function ai4authLoginUrl(returnPath: string = '/admin'): string {
    const path = returnPath.startsWith('/') && !returnPath.startsWith('//') ? returnPath : '/admin';
    const origin = typeof window !== 'undefined' && window.location.hostname.endsWith('.ai4educ.org')
        ? window.location.origin
        : DEPLOYED_APP_URL.replace(/\/$/, '');
    return `${AI4AUTH_LOGIN_URL}?rd=${encodeURIComponent(`${origin}${path}`)}`;
}
