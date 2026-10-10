// Canonical institute reference of an administration plan (#149).

export interface PlanInstitutionOption { id: number; name: string; institution_code: string | null; credentials_configured: boolean }

export function parsePlanInstitutionOptions(payload: unknown): PlanInstitutionOption[] {
    if (!Array.isArray(payload) || payload.some(row => !row || !Number.isInteger(row.id) || typeof row.name !== 'string'
        || typeof row.credentials_configured !== 'boolean' || !(row.institution_code === null || typeof row.institution_code === 'string'))) {
        throw new Error('Invalid institution options');
    }
    return payload.map(row => ({ id: row.id, name: row.name, institution_code: row.institution_code, credentials_configured: row.credentials_configured }));
}

export interface PlanInstitutionState { institution_id: number | null; institution_link_state: string }

// New plans always state the choice. Edits send it only when changed or when a legacy
// reconciliation is explicitly confirmed, so unrelated saves never resolve it silently.
export function planInstitutionField(selected: string, original: PlanInstitutionState | null, confirmReconciliation: boolean): { institution_id?: number | null } {
    const value = selected ? Number(selected) : null;
    if (!original) return { institution_id: value };
    if (original.institution_link_state === 'needs_reconciliation') return confirmReconciliation ? { institution_id: value } : {};
    return value === original.institution_id ? {} : { institution_id: value };
}

// TF8: classroom links open the same plan in the research view as `#plan-<id>`.
export function planIdFromHash(hash: string): number | null {
    const match = /^#plan-(\d+)$/.exec(hash);
    return match ? Number(match[1]) : null;
}
