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

export interface LocalStudentDevice {
    id: number;
    username: string;
    pseudonym: string;
    device_label: string | null;
    status: 'active' | 'pending';
    created_at: string;
    last_seen_at: string;
}

export interface LocalDeviceClass {
    group_id: number;
    group_name: string;
    devices: LocalStudentDevice[];
}

export function formatPersonalCode(code: string): string {
    const normalized = code.replace(/[\s-]/g, '').toUpperCase();
    return normalized.match(/.{1,4}/g)?.join('-') ?? '';
}
