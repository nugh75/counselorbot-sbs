// Class and group meetings (#175): planned by the teacher, attended by students,
// who mark their own attendance. A `meeting` path step points at one of them.
export interface ClassMeeting {
    id: number;
    group_id: number;
    title: string;
    description: string | null;
    starts_at: string;
    duration_minutes: number | null;
    mode: 'in_person' | 'online';
    place: string | null;
    link: string | null;
    status: 'scheduled' | 'cancelled';
    revision: number;
    attendance_count?: number;
    group_name?: string;
    attended?: boolean;
    can_mark?: boolean;
}

export function parseMeeting(input: unknown): ClassMeeting | null {
    if (!input || typeof input !== 'object') return null;
    const raw = input as Record<string, unknown>;
    if (!Number.isInteger(raw.id) || typeof raw.starts_at !== 'string') return null;
    return {
        id: Number(raw.id),
        group_id: Number(raw.group_id),
        title: String(raw.title ?? ''),
        description: raw.description ? String(raw.description) : null,
        starts_at: raw.starts_at,
        duration_minutes: raw.duration_minutes != null ? Number(raw.duration_minutes) : null,
        mode: raw.mode === 'online' ? 'online' : 'in_person',
        place: raw.place ? String(raw.place) : null,
        // Only web links are opened; anything else is shown as text by no one.
        link: typeof raw.link === 'string' && /^https?:\/\//.test(raw.link) ? raw.link : null,
        status: raw.status === 'cancelled' ? 'cancelled' : 'scheduled',
        revision: Number(raw.revision || 1),
        ...(raw.attendance_count != null ? { attendance_count: Number(raw.attendance_count) } : {}),
        ...(raw.group_name != null ? { group_name: String(raw.group_name) } : {}),
        ...(raw.attended != null ? { attended: Boolean(raw.attended) } : {}),
        ...(raw.can_mark != null ? { can_mark: Boolean(raw.can_mark) } : {}),
    };
}

export function parseMeetings(input: unknown): ClassMeeting[] {
    return Array.isArray(input) ? input.map(parseMeeting).filter((row): row is ClassMeeting => row !== null) : [];
}

/** Date and time in the reader's language and time zone. */
export function meetingWhen(meeting: Pick<ClassMeeting, 'starts_at' | 'duration_minutes'>, lang: string): string {
    const start = new Date(meeting.starts_at);
    const text = start.toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' });
    if (!meeting.duration_minutes) return text;
    const end = new Date(start.getTime() + meeting.duration_minutes * 60000);
    return `${text}–${end.toLocaleTimeString(lang, { timeStyle: 'short' })}`;
}

/** `<input type="datetime-local">` value in local time, and back to an aware ISO string. */
export function toLocalInput(iso: string): string {
    const date = new Date(iso);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
