// Teacher noticing (#247): parsed defensively, every element tied to quoted student messages.
export const NOTICING_KINDS = ['revisit', 'resource', 'difficulty', 'attention'] as const;
export type NoticingKind = typeof NOTICING_KINDS[number];
export type NoticingStatus = 'ready' | 'stale' | 'missing' | 'empty' | 'unavailable';
export type NoticingEvidence = { message: number; quote: string };
export type NoticingItem = { kind: NoticingKind; text: string; evidence: NoticingEvidence[] };
export type Noticing = { status: NoticingStatus; items: NoticingItem[]; generated_at: string | null };

const STATUSES: NoticingStatus[] = ['ready', 'stale', 'missing', 'empty', 'unavailable'];

export function parseNoticing(payload: unknown): Noticing {
    const data = payload as Partial<Noticing> | null;
    if (!data || !STATUSES.includes(data.status as NoticingStatus) || !Array.isArray(data.items)) throw new Error('invalid noticing');
    const items = data.items.flatMap((item): NoticingItem[] => {
        if (!item || !NOTICING_KINDS.includes(item.kind) || typeof item.text !== 'string' || !Array.isArray(item.evidence)) return [];
        const evidence = item.evidence.filter(ref => ref && Number.isInteger(ref.message) && ref.message >= 0 && typeof ref.quote === 'string');
        return evidence.length ? [{ kind: item.kind, text: item.text, evidence }] : [];
    });
    return { status: data.status as NoticingStatus, items, generated_at: typeof data.generated_at === 'string' ? data.generated_at : null };
}

export function noticingMessageId(prefix: string, index: number): string {
    return `${prefix}-message-${index}`;
}
