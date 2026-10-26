// P10: tipi e funzioni pure della pagina Privacy. Le regole di autorizzazione
// restano nel backend: qui si legge lo stato restituito e si compone l'interfaccia.

export type PrivacyValidationStatus = string;

export interface PrivacyDocument {
    id: number;
    kind: string;
    version: string;
    locale: string;
    content_hash: string;
    body_ref: string;
    published_at: string;
    requires_new_consent: boolean;
}

export interface PrivacyDocumentsPayload {
    documents: PrivacyDocument[];
    validation_status: PrivacyValidationStatus;
}

export interface PrivacyPurpose {
    key: string;
    description_i18n: Record<string, string> | null;
    legal_basis: string;
    requires_consent: boolean;
    active: boolean;
    retention_policy_key: string | null;
    document_kind: string;
}

export interface PrivacyPurposesPayload {
    purposes: PrivacyPurpose[];
}

export interface PrivacyChoice {
    purpose: string;
    target: string | null;
    granted: boolean;
    choice: string | null;
    event_id: number;
    // Presente solo nelle scelte teacher_sharing del soggetto stesso (P10),
    // per consentire la revoca immediata senza esporre l'username nei log.
    teacher_username?: string | null;
    group_id?: number | null;
}

export interface PrivacyHistoryEntry {
    id: number;
    purpose: string;
    event_type: string;
    choice: string | null;
    document_kind: string | null;
    document_version: string | null;
    document_locale: string | null;
    target: string | null;
    valid_until: string | null;
    created_at: string;
    teacher_username?: string | null;
    group_id?: number | null;
}

export interface PrivacyChoicesPayload {
    choices: PrivacyChoice[];
    history: PrivacyHistoryEntry[];
}

export interface PrivacyGroup {
    membership_id: number;
    group_id: number;
    code: string;
    name: string;
    joined_via?: string;
    joined_at?: string | null;
}

export interface SharingTarget {
    groupId: number;
    teacherPid: string;
}

export interface SharingRow {
    target: string;
    groupId: number;
    groupName: string;
    teacherUsername: string | null;
    grantedAt: string | null;
}

export const SHARING_PURPOSE = 'teacher_sharing';

const LEGAL_BASES = new Set([
    'consent', 'contract', 'legal_obligation', 'vital_interest', 'public_task',
    'legitimate_interest', 'undefined',
]);

const DOCUMENT_KINDS = new Set([
    'notice_student', 'notice_teacher', 'notice_ai', 'terms', 'consent_sharing', 'consent_research',
]);

const ERROR_KEYS: Record<string, string> = {
    'privacy.errors.purpose_disabled': 'privacy.purposes.error.purpose_disabled',
    'privacy.errors.policy_blocked': 'privacy.purposes.error.policy_blocked',
    'privacy.errors.access_denied': 'privacy.purposes.error.access_denied',
    'privacy.errors.audit_unavailable': 'privacy.purposes.error.audit_unavailable',
    'privacy.errors.authentication_required': 'privacy.purposes.error.authentication_required',
};

export function parseSharingTarget(target: string | null | undefined): SharingTarget | null {
    const match = /^share:(\d+):([^:]+)$/.exec(target || '');
    if (!match) return null;
    const groupId = Number(match[1]);
    if (!Number.isSafeInteger(groupId) || groupId <= 0) return null;
    return { groupId, teacherPid: match[2] };
}

export function currentChoice(choices: PrivacyChoice[], purpose: string, target = ''): PrivacyChoice | null {
    return choices.find((choice) => choice.purpose === purpose && (choice.target || '') === target) || null;
}

export function purposeState(purpose: PrivacyPurpose | null, choice: PrivacyChoice | null): 'disabled' | 'granted' | 'refused' | 'unset' {
    if (!purpose || !purpose.active || purpose.legal_basis === 'undefined') return 'disabled';
    if (choice?.granted) return 'granted';
    if (choice?.choice === 'refused' || choice?.choice === 'withdrawn') return 'refused';
    return 'unset';
}

export function documentForPurpose(purpose: PrivacyPurpose | null, documents: PrivacyDocument[]): PrivacyDocument | null {
    if (!purpose) return null;
    return documents.find((document) => document.kind === purpose.document_kind) || null;
}

export function canRecordNewChoice(purpose: PrivacyPurpose | null, document: PrivacyDocument | null): boolean {
    return Boolean(purpose && purpose.active && purpose.legal_basis !== 'undefined' && document);
}

// Un interruttore non parte mai acceso senza una scelta esplicita già registrata.
export function initialSwitchState(purpose: PrivacyPurpose | null, choice: PrivacyChoice | null): boolean {
    return purposeState(purpose, choice) === 'granted';
}

export function sharingRows(choices: PrivacyChoice[], groups: PrivacyGroup[]): SharingRow[] {
    const names = new Map(groups.map((group) => [group.group_id, group.name]));
    const rows: SharingRow[] = [];
    for (const choice of choices) {
        if (choice.purpose !== SHARING_PURPOSE || !choice.granted) continue;
        const parsed = parseSharingTarget(choice.target);
        const groupId = typeof choice.group_id === 'number' ? choice.group_id : parsed?.groupId;
        if (!groupId) continue;
        rows.push({
            target: choice.target || '',
            groupId,
            groupName: names.get(groupId) || `#${groupId}`,
            teacherUsername: choice.teacher_username || null,
            grantedAt: null,
        });
    }
    return rows.sort((a, b) => a.groupId - b.groupId);
}

export function purposeLabelKey(purposeKey: string): string {
    return `privacy.purposes.purpose.${purposeKey}`;
}

export function documentKindLabelKey(kind: string): string {
    return DOCUMENT_KINDS.has(kind) ? `privacy.documents.kind.${kind}` : 'privacy.documents.current';
}

export function legalBasisLabelKey(basis: string): string {
    return `privacy.purposes.basis.${LEGAL_BASES.has(basis) ? basis : 'undefined'}`;
}

// La descrizione del backend può essere [DA VALIDARE] o assente: non si
// inventano testi legali e si ricade sulla lingua richiesta, poi su EN/IT.
export function purposeDescription(purpose: PrivacyPurpose | null, lang: string): { text: string; pending: boolean } {
    const values = purpose?.description_i18n;
    if (!values) return { text: '', pending: false };
    const text = values[lang] || values.en || values.it || '';
    const pending = !text || text.trim().toUpperCase().includes('DA VALIDARE')
        || text.trim().toUpperCase().includes('TO BE VALIDATED')
        || text.trim().toUpperCase().includes('POR VALIDAR')
        || text.trim().toUpperCase().includes('À VALIDER')
        || text.trim().toUpperCase().includes('ZU PRÜFEN')
        || text.trim().toUpperCase().includes('ATT VALIDERA');
    return { text, pending };
}

export function formatPrivacyDate(value: string | null | undefined, lang: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    } catch {
        return date.toISOString();
    }
}

export function shortHash(hash: string | null | undefined): string {
    const value = (hash || '').trim();
    if (value.length <= 28) return value;
    return `${value.slice(0, 12)}…${value.slice(-12)}`;
}

// Solo riferimenti relativi a questa app o URL http(s): mai javascript: o data:.
export function documentHref(bodyRef: string | null | undefined): string | null {
    const value = (bodyRef || '').trim();
    if (!value) return null;
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
        return null;
    }
}

export function privacyErrorKey(status: number, detail: unknown): string {
    if (status === 401) return 'privacy.purposes.error.authentication_required';
    if (typeof detail === 'string' && ERROR_KEYS[detail]) return ERROR_KEYS[detail];
    if (detail && typeof detail === 'object' && 'error_code' in detail) {
        const code = (detail as { error_code?: unknown }).error_code;
        if (typeof code === 'string' && ERROR_KEYS[code]) return ERROR_KEYS[code];
    }
    return 'privacy.purposes.error.generic';
}

export function historyEventLabelKey(eventType: string): string {
    if (eventType === 'consent_given') return 'privacy.history.event.given';
    if (eventType === 'consent_refused') return 'privacy.history.event.refused';
    if (eventType === 'consent_withdrawn') return 'privacy.history.event.withdrawn';
    return 'privacy.history.event.notice';
}

export function historyTarget(entry: PrivacyHistoryEntry, groups: PrivacyGroup[]): string | null {
    if (!entry.target) return null;
    const parsed = parseSharingTarget(entry.target);
    if (parsed) {
        const group = groups.find((row) => row.group_id === parsed.groupId);
        return group?.name || `#${parsed.groupId}`;
    }
    return entry.target;
}

export function purposeLabelFallback(purposeKey: string): string {
    return purposeKey.replace(/_/g, ' ');
}
