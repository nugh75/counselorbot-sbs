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

// Guests and network failures fall back to the unfiltered catalog: the server
// guards stay authoritative for every start or write.
export async function fetchUserAccess(): Promise<UserAccess | null> {
    try {
        const res = await apiFetch('/api/user/access');
        if (!res.ok) return null;
        return (await res.json()) as UserAccess;
    } catch {
        return null;
    }
}
