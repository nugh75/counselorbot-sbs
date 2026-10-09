// Institute-owned external credentials and local verification grants (#149).
// The password is write-only: it is sent once, never trimmed, never stored in the browser.

const CODE_PATTERN = /^[A-Za-z0-9-]{1,50}$/;
const MAX_PASSWORD_BYTES = 72;
const REVERIFY_CODES = new Set(['institution_verification_required', 'institution_grant_expired', 'institution_grant_mismatch', 'institution_grant_invalid']);
const UNAVAILABLE_CODES = new Set(['administration_needs_reconciliation', 'institution_credentials_missing', 'institution_inactive', 'administration_instrument_mismatch', 'administration_not_institution_backed']);

export type CredentialDraftError = 'code' | 'password' | null;

export function credentialDraftError(code: string, password: string): CredentialDraftError {
    if (!CODE_PATTERN.test(code.trim())) return 'code';
    if (!password || new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'password';
    return null;
}

export function credentialPayload(code: string, password: string, revision: number) {
    return { institution_code: code.trim(), password, revision };
}

export interface VerificationRequest { planId: number; institutionName: string; institutionCode: string | null }

function detailOf(payload: unknown): unknown {
    return payload && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : undefined;
}

function detailCode(payload: unknown): string | null {
    const detail = detailOf(payload);
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && typeof (detail as { code?: unknown }).code === 'string') return (detail as { code: string }).code;
    return null;
}

export function verificationRequest(status: number, payload: unknown): VerificationRequest | null {
    const detail = detailOf(payload) as Record<string, unknown> | undefined;
    if (status !== 403 || !detail || typeof detail !== 'object' || !REVERIFY_CODES.has(String(detail.code))) return null;
    if (!Number.isInteger(detail.administration_plan_id)) return null;
    return {
        planId: detail.administration_plan_id as number,
        institutionName: typeof detail.institution_name === 'string' ? detail.institution_name : '',
        institutionCode: typeof detail.institution_code === 'string' ? detail.institution_code : null,
    };
}

export function contextFailure(payload: unknown): 'unavailable' | null {
    const code = detailCode(payload);
    return code && UNAVAILABLE_CODES.has(code) ? 'unavailable' : null;
}

export function verifyFailure(status: number, payload: unknown): 'failed' | 'throttled' | 'unavailable' | 'error' {
    const code = detailCode(payload);
    if (status === 403 && code === 'institution_verification_failed') return 'failed';
    if (status === 429) return 'throttled';
    if (code && UNAVAILABLE_CODES.has(code)) return 'unavailable';
    return 'error';
}

export function withInstitutionGrant<T extends object>(body: T, grant: string | null): T & { institution_grant?: string } {
    return grant ? { ...body, institution_grant: grant } : body;
}

export interface VerificationGrant { grant: string; expiresAt: string; institution: { id: number; name: string; institution_code: string | null } }

export function parseVerificationGrant(payload: unknown): VerificationGrant {
    const row = payload as { grant?: unknown; expires_at?: unknown; institution?: { id?: unknown; name?: unknown; institution_code?: unknown } } | null;
    if (!row || typeof row.grant !== 'string' || row.grant.length < 32 || typeof row.expires_at !== 'string'
        || !row.institution || !Number.isInteger(row.institution.id) || typeof row.institution.name !== 'string') {
        throw new Error('Invalid verification grant');
    }
    return {
        grant: row.grant,
        expiresAt: row.expires_at,
        institution: { id: row.institution.id as number, name: row.institution.name, institution_code: typeof row.institution.institution_code === 'string' ? row.institution.institution_code : null },
    };
}
