// Class and group meetings (#175): planned by the teacher, attended by students,
// who mark their own attendance. A `meeting` path step points at one of them.
// Individual meetings (#176) have bookable slots instead of one date.
export interface MeetingSlot {
    id: number;
    starts_at: string;
    duration_minutes: number | null;
    status?: 'open' | 'cancelled';
    revision?: number;
    /** Teacher view: who booked it. */
    booking?: { id: number; username: string; name: string } | null;
    /** Student view: the student's own slot. */
    mine?: boolean;
}

export interface ClassMeeting {
    id: number;
    group_id: number;
    title: string;
    description: string | null;
    starts_at: string | null;
    kind: 'group' | 'individual';
    host_kind: 'teacher' | 'referent' | 'expert';
    host_name: string | null;
    host_role: string | null;
    referral_id?: number | null;
    slots?: MeetingSlot[];
    booking_slot_id?: number | null;
    booking_cancelled?: boolean;
    /** #189: the teacher shows it on students' timelines. */
    show_on_timeline?: boolean;
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
    if (!Number.isInteger(raw.id)) return null;
    const kind = raw.kind === 'individual' ? 'individual' : 'group';
    // A group meeting always has its date; an individual one has slots instead.
    if (kind === 'group' && typeof raw.starts_at !== 'string') return null;
    return {
        id: Number(raw.id),
        group_id: Number(raw.group_id),
        title: String(raw.title ?? ''),
        description: raw.description ? String(raw.description) : null,
        starts_at: typeof raw.starts_at === 'string' ? raw.starts_at : null,
        kind,
        host_kind: raw.host_kind === 'referent' || raw.host_kind === 'expert' ? raw.host_kind : 'teacher',
        host_name: raw.host_name ? String(raw.host_name) : null,
        host_role: raw.host_role ? String(raw.host_role) : null,
        ...(raw.referral_id != null ? { referral_id: Number(raw.referral_id) } : {}),
        ...(Array.isArray(raw.slots) ? { slots: raw.slots.flatMap(parseSlot) } : {}),
        ...(raw.booking_slot_id !== undefined ? { booking_slot_id: raw.booking_slot_id != null ? Number(raw.booking_slot_id) : null } : {}),
        ...(raw.booking_cancelled != null ? { booking_cancelled: Boolean(raw.booking_cancelled) } : {}),
        ...(raw.show_on_timeline != null ? { show_on_timeline: Boolean(raw.show_on_timeline) } : {}),
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

function parseSlot(input: unknown): MeetingSlot[] {
    if (!input || typeof input !== 'object') return [];
    const raw = input as Record<string, unknown>;
    if (!Number.isInteger(raw.id) || typeof raw.starts_at !== 'string') return [];
    const booking = raw.booking && typeof raw.booking === 'object' ? raw.booking as Record<string, unknown> : null;
    return [{
        id: Number(raw.id), starts_at: raw.starts_at,
        duration_minutes: raw.duration_minutes != null ? Number(raw.duration_minutes) : null,
        ...(raw.status ? { status: raw.status === 'cancelled' ? 'cancelled' as const : 'open' as const } : {}),
        ...(raw.revision != null ? { revision: Number(raw.revision) } : {}),
        ...(raw.booking !== undefined ? { booking: booking ? { id: Number(booking.id), username: String(booking.username),
            name: String(booking.name ?? booking.username) } : null } : {}),
        ...(raw.mine != null ? { mine: Boolean(raw.mine) } : {}),
    }];
}

/** Who holds the meeting, for display: the referent's role, or the expert's name and role. */
export function meetingHost(meeting: Pick<ClassMeeting, 'host_kind' | 'host_name' | 'host_role'>): string | null {
    if (meeting.host_kind === 'teacher') return null;
    return [meeting.host_name, meeting.host_role].filter(Boolean).join(', ') || null;
}

export function parseMeetings(input: unknown): ClassMeeting[] {
    return Array.isArray(input) ? input.map(parseMeeting).filter((row): row is ClassMeeting => row !== null) : [];
}

/** Date and time in the reader's language and time zone. */
export function meetingWhen(meeting: { starts_at: string | null; duration_minutes: number | null }, lang: string): string {
    if (!meeting.starts_at) return '';
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

/** When the meeting is on the student's timeline: its date, or the student's own slot (#189). */
export function meetingTimelineStart(meeting: Pick<ClassMeeting, 'kind' | 'starts_at' | 'slots' | 'booking_slot_id' | 'show_on_timeline'>): string | null {
    if (meeting.show_on_timeline === false) return null;
    if (meeting.kind === 'group') return meeting.starts_at;
    return meeting.slots?.find(slot => slot.id === meeting.booking_slot_id)?.starts_at ?? null;
}
