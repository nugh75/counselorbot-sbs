// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { apiFetch } from './auth.ts';

// GET /user/access (plan §5.1, #89): the single source for what a student may
// start. `restricted=false` means no class filter (no class, or staff role).
export interface UserAccess {
    restricted: boolean;
    tool_keys: string[];
    counselor_ids: number[] | null;
    default_counselor_id: number | null;
    class_ids: number[];
}

export function isToolAllowed(access: UserAccess | null | undefined, key: string): boolean {
    if (!access || !access.restricted) return true;
    return access.tool_keys.includes(key);
}

const SESSION_CACHE_PREFIX = 'cb_user_access';

function getSessionStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage;
    }
    if (typeof sessionStorage !== 'undefined') {
        return sessionStorage;
    }
    return null;
}

function getSessionCacheKey(): string {
    const storage = getSessionStorage();
    const viewAs = storage ? storage.getItem('cb_view_as_user') : null;
    return `${SESSION_CACHE_PREFIX}_${viewAs || 'self'}`;
}

let inFlightAccess: Promise<UserAccess | null> | null = null;
let memoryCache: { key: string; access: UserAccess | null } | null = null;

export function clearUserAccessCache(): void {
    inFlightAccess = null;
    memoryCache = null;
    const storage = getSessionStorage();
    if (storage) {
        try {
            for (let i = storage.length - 1; i >= 0; i--) {
                const k = storage.key(i);
                if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
                    storage.removeItem(k);
                }
            }
        } catch {
            // ignore session storage access errors
        }
    }
}

export function getCachedUserAccess(): UserAccess | null {
    const key = getSessionCacheKey();
    if (memoryCache && memoryCache.key === key) {
        return memoryCache.access;
    }
    const storage = getSessionStorage();
    if (storage) {
        try {
            const raw = storage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw) as UserAccess;
                memoryCache = { key, access: parsed };
                return parsed;
            }
        } catch {
            // ignore parse or storage errors
        }
    }
    return null;
}

// Guests and network failures fall back to the unfiltered catalog: the server
// guards stay authoritative for every start or write.
// Caches GET /user/access once per browser session.
export async function fetchUserAccess(options?: { forceRefresh?: boolean }): Promise<UserAccess | null> {
    const key = getSessionCacheKey();
    if (!options?.forceRefresh) {
        const cached = getCachedUserAccess();
        if (cached) return cached;
        if (inFlightAccess) return inFlightAccess;
    }

    inFlightAccess = (async () => {
        try {
            const res = await apiFetch('/api/user/access');
            if (!res.ok) return null;
            const access = (await res.json()) as UserAccess;
            memoryCache = { key, access };
            const storage = getSessionStorage();
            if (storage) {
                try {
                    storage.setItem(key, JSON.stringify(access));
                } catch {
                    // ignore session storage quota/security errors
                }
            }
            return access;
        } catch {
            return null;
        } finally {
            inFlightAccess = null;
        }
    })();

    return inFlightAccess;
}
