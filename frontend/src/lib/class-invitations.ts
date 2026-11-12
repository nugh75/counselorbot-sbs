// Email invitations to a class (#836): the teacher sends the class link from
// their own mail client; Counselorbot sends no email.
export interface GroupInvitation {
    id: number;
    email: string;
    invited_by: string;
    created_at: string | null;
    sent_at: string | null;
}

export function invitationMailto(email: string, subject: string, body: string): string {
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
