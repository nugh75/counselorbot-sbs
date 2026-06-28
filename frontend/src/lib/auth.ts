// Identità utente da ai4auth (forward-auth). Il backend legge gli header
// Remote-* iniettati da nginx ed espone /api/auth/me.

export interface Identity {
    email: string;
    username: string;
    name: string;
    groups: string[];
    is_admin: boolean;
    is_researcher?: boolean;
    authenticated: boolean;
}

// --- Anteprima ruoli (view as): l'admin puo' vedere l'interfaccia come la
// vedono gli altri ruoli. L'override e' client-side (localStorage) e si applica
// solo se l'identita' reale e' admin. L'admin reale resta sempre raggiungibile
// via getRealIdentity (es. gate della pagina /admin) per poter uscire. ---
export type ViewAsRole = 'studente' | 'ricercatore' | 'docente';
const VIEW_AS_KEY = 'cb_view_as_role';

// Tre account fittizi (uno per ruolo), distinti da quello dell'amministratore:
// l'anteprima mostra l'identita' di un finto utente, non quella dell'admin.
export interface ViewAsAccount {
    username: string;
    name: string;
    email: string;
    groups: string[];
    is_researcher: boolean;
}

export const VIEW_AS_ACCOUNTS: Record<ViewAsRole, ViewAsAccount> = {
    studente: { username: 'studente.demo', name: 'Studente demo', email: 'studente.demo@anteprima.local', groups: ['studenti'], is_researcher: false },
    ricercatore: { username: 'ricercatore.demo', name: 'Ricercatore demo', email: 'ricercatore.demo@anteprima.local', groups: ['researchers'], is_researcher: true },
    docente: { username: 'docente.demo', name: 'Docente demo', email: 'docente.demo@anteprima.local', groups: ['docenti'], is_researcher: false },
};

export function getViewAsRole(): ViewAsRole | null {
    if (typeof window === 'undefined') return null;
    const value = window.localStorage.getItem(VIEW_AS_KEY);
    return value === 'studente' || value === 'ricercatore' || value === 'docente' ? value : null;
}

export function setViewAsRole(role: ViewAsRole): void {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_AS_KEY, role);
}

export function clearViewAsRole(): void {
    if (typeof window !== 'undefined') window.localStorage.removeItem(VIEW_AS_KEY);
}

function applyViewAs(real: Identity, role: ViewAsRole): Identity {
    const account = VIEW_AS_ACCOUNTS[role];
    return {
        ...real,
        username: account.username,
        name: account.name,
        email: account.email,
        groups: [...account.groups],
        is_admin: false,
        is_researcher: account.is_researcher,
        authenticated: true,
    };
}

// Identita' reale dal backend, senza applicare l'anteprima ruoli.
export async function getRealIdentity(): Promise<Identity | null> {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Identita' effettiva usata dalla UI: applica l'anteprima ruoli se l'utente
// reale e' admin. Un override residuo su un non-admin viene ignorato e pulito.
export async function getIdentity(): Promise<Identity | null> {
    const real = await getRealIdentity();
    if (!real) return null;
    const role = getViewAsRole();
    if (!role) return real;
    if (real.is_admin) return applyViewAs(real, role);
    clearViewAsRole();
    return real;
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
