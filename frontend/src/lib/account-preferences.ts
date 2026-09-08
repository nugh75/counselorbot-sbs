import { apiFetch } from './auth';
import { setSelectedCounselorId } from './counselor';

export interface AccountPreferences {
    counselor_id: number | null;
    counselor_ready: boolean;
    notebook_ready: boolean;
    setup_completed: boolean;
}

export async function fetchAccountPreferences(): Promise<AccountPreferences> {
    const response = await apiFetch('/api/user/account-preferences');
    if (!response.ok) throw new Error('Unable to load account preferences');
    return response.json();
}

export async function saveAccountPreferences(counselorId: number | null, completeSetup = false): Promise<AccountPreferences> {
    const response = await apiFetch('/api/user/account-preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counselor_id: counselorId, complete_setup: completeSetup }),
    });
    if (!response.ok) throw new Error('Unable to save account preferences');
    const preferences: AccountPreferences = await response.json();
    setSelectedCounselorId(preferences.counselor_id);
    return preferences;
}

export function safeAccountNext(value: string | null): string {
    return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
        && !value.startsWith('/inizia') && !value.startsWith('/counselor') ? value : '/';
}
