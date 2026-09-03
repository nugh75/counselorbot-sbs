import { apiFetch } from './auth';
import type { Lang } from './i18n';

// Deve restare identico a backend/referral_scope.py::NOT_LISTED.
export const INSTITUTION_NOT_LISTED = '__not_listed__';

export interface Institution {
    id: number;
    slug: string;
    name: string;
    kind: 'school' | 'university';
    website_url?: string | null;
    orientation_page_url?: string | null;
}

export interface DirectoryReferral {
    id: string;
    role: string;
    person: string;
    needs: string[];
    what_for: string;
    how_to_reach: string;
    email: string;
    hours: string;
    location: string;
    page_url: string;
}

export interface DirectoryEvent {
    id: string;
    kind: string;
    title: string;
    summary: string;
    needs: string[];
    starts_at: string;
    ends_at: string;
    registration_deadline: string;
    page_url: string;
    location: string;
    is_online: boolean;
}

export interface OrientationDirectory {
    institution: Institution | null;
    referrals: DirectoryReferral[];
    events: DirectoryEvent[];
}

export async function fetchInstitutions(): Promise<Institution[]> {
    const res = await apiFetch('/api/institutions');
    if (!res.ok) throw new Error(`institutions: ${res.status}`);
    return res.json();
}

export async function fetchOrientationDirectory(lang: Lang): Promise<OrientationDirectory> {
    const res = await apiFetch(`/api/orientation-directory?lang=${lang}`);
    if (!res.ok) throw new Error(`orientation-directory: ${res.status}`);
    return res.json();
}
