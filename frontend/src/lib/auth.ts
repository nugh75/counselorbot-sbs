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

// --- Anteprima ruoli / profili di prova (view as): l'admin puo' usare uno dei
// profili di prova per vedere l'interfaccia degli altri ruoli e fare prove di
// interazione. L'override e' client-side (localStorage) e si applica solo se
// l'identita' reale e' admin; il backend accetta gli stessi username (allowlist)
// e attribuisce i dati/le interazioni al profilo di prova, che restano in DB.
// L'admin reale resta raggiungibile via getRealIdentity (gate /admin). ---
export type ViewAsRole = 'studente' | 'ricercatore' | 'docente';
const VIEW_AS_KEY = 'cb_view_as_user';

export interface ViewAsAccount {
    username: string;
    name: string;
    role: ViewAsRole;
    is_researcher: boolean;
    groups: string[];
}

// Profili di prova. Gli username devono combaciare con VIEW_AS_DEMO_ACCOUNTS
// nel backend (backend/auth.py).
export const VIEW_AS_ACCOUNTS: ViewAsAccount[] = [
    { username: 'studente.demo', name: 'Studente di prova 1', role: 'studente', is_researcher: false, groups: ['studenti'] },
    { username: 'studente.demo2', name: 'Studente di prova 2', role: 'studente', is_researcher: false, groups: ['studenti'] },
    { username: 'studente.demo3', name: 'Studente di prova 3', role: 'studente', is_researcher: false, groups: ['studenti'] },
    { username: 'ricercatore.demo', name: 'Ricercatore di prova', role: 'ricercatore', is_researcher: true, groups: ['researchers'] },
    { username: 'docente.demo', name: 'Docente di prova', role: 'docente', is_researcher: false, groups: ['docenti'] },
];

export function getViewAsAccount(): ViewAsAccount | null {
    if (typeof window === 'undefined') return null;
    const username = window.localStorage.getItem(VIEW_AS_KEY);
    return VIEW_AS_ACCOUNTS.find((account) => account.username === username) ?? null;
}

export function setViewAsUsername(username: string): void {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_AS_KEY, username);
}

export function clearViewAs(): void {
    if (typeof window !== 'undefined') window.localStorage.removeItem(VIEW_AS_KEY);
}

export function withViewAsHeaders(headers?: HeadersInit): Headers {
    const next = new Headers(headers);
    const account = getViewAsAccount();
    if (account) next.set('X-View-As', account.username);
    return next;
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    return fetch(input, {
        ...init,
        headers: withViewAsHeaders(init.headers),
    });
}

function applyViewAs(real: Identity, account: ViewAsAccount): Identity {
    return {
        ...real,
        username: account.username,
        name: account.name,
        email: `${account.username}@anteprima.local`,
        groups: [...account.groups],
        is_admin: false,
        is_researcher: account.is_researcher,
        authenticated: true,
    };
}

// Identita' reale dal backend, senza applicare l'anteprima.
export async function getRealIdentity(): Promise<Identity | null> {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Identita' effettiva usata dalla UI: applica il profilo di prova se l'utente
// reale e' admin. Un override residuo su un non-admin viene ignorato e pulito.
export async function getIdentity(): Promise<Identity | null> {
    const real = await getRealIdentity();
    if (!real) return null;
    const account = getViewAsAccount();
    if (!account) return real;
    if (real.is_admin) return applyViewAs(real, account);
    clearViewAs();
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
