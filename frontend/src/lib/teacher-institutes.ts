import type { Institution } from './referrals-api';

export interface TeacherInstitute extends Institution {
    revision: number;
    is_active: boolean;
    created_by: string | null;
    credentials_configured: boolean;
    member_count: number;
    needs_admin_review: boolean;
}
export interface InstituteChoice extends Institution { joined: boolean; can_join: boolean }
export function parseTeacherInstitutes(payload: unknown): TeacherInstitute[] {
    if (!Array.isArray(payload) || payload.some(row => !row || !Number.isInteger(row.id) || typeof row.name !== 'string' || !Number.isInteger(row.revision))) {
        throw new Error('Invalid institute list');
    }
    return payload as TeacherInstitute[];
}
export function parseInstituteChoices(payload: unknown): InstituteChoice[] {
    if (!Array.isArray(payload) || payload.some(row => !row || !Number.isInteger(row.id) || typeof row.name !== 'string' || typeof row.can_join !== 'boolean' || typeof row.joined !== 'boolean')) {
        throw new Error('Invalid institute directory');
    }
    return payload as InstituteChoice[];
}
export function parseTeacherInstitute(payload: unknown): TeacherInstitute { return parseTeacherInstitutes([payload])[0]; }
