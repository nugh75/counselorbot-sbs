export interface PairedStudent {
    username: string;
    pseudonym: string;
    group_id: number;
    status: 'active' | 'pending';
    personal_code: string;
}

export interface RecoveredStudent {
    username: string;
    pseudonym: string;
}

export function formatPersonalCode(code: string): string {
    const normalized = code.replace(/[\s-]/g, '').toUpperCase();
    return normalized.match(/.{1,4}/g)?.join('-') ?? '';
}
