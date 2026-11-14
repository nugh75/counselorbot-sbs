// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { NOTICING_KINDS, type NoticingKind, type NoticingStatus } from './teacher-noticing.ts';
export const SOURCE_KINDS = ['chat', 'questionnaire', 'notebook', 'reading', 'portfolio', 'goal', 'review', 'strategy', 'action', 'card', 'comparison', 'timeline', 'map', 'table', 'assignment', 'meeting', 'forum', 'teacher_note', 'practice', 'flashcard'] as const;
export type SourceKind = typeof SOURCE_KINDS[number];
export type SourceEvidence = { id: string; kind: SourceKind; title: string; author: 'student' | 'teacher' | 'record' | 'saved_work'; date: string | null; instrument: string | null; quote: string };
export type JourneyItem = { id: string; kind: NoticingKind; text: string; evidence: SourceEvidence[] };
export type StudentNoticing = { username: string; status: NoticingStatus; items: JourneyItem[]; pending_chunks: string[]; total_chunks: number; source_count: number; source_counts: Record<SourceKind, number>; fingerprint: string; generated_at: string | null };
export type Advice = { revision: number; text: string; state: 'missing' | 'draft' | 'validated'; stale: boolean; validated_by: string | null; validated_at: string | null; updated_at: string | null };
export function parseStudentNoticing(payload: unknown): StudentNoticing {
    const data = payload as StudentNoticing;
    if (!data || typeof data.username !== 'string' || !Array.isArray(data.items) || !Array.isArray(data.pending_chunks)
        || !['ready', 'stale', 'missing', 'empty', 'unavailable'].includes(data.status)
        || !Number.isInteger(data.source_count) || data.source_count < 0 || !data.source_counts
        || !Number.isInteger(data.total_chunks) || data.total_chunks < 0
        || data.pending_chunks.some(chunk => typeof chunk !== 'string' || !/^[a-f0-9]{64}$/.test(chunk))) throw new Error('invalid journey noticing');
    const items = data.items.flatMap(item => {
        if (!item || !NOTICING_KINDS.includes(item.kind) || typeof item.text !== 'string' || !Array.isArray(item.evidence)) return [];
        const evidence = item.evidence.filter(ref => ref && typeof ref.id === 'string' && SOURCE_KINDS.includes(ref.kind)
            && ['student', 'teacher', 'record', 'saved_work'].includes(ref.author) && typeof ref.quote === 'string');
        return evidence.length ? [{ ...item, evidence }] : [];
    });
    return { ...data, items };
}
export function parseAdvice(payload: unknown): Advice {
    const data = payload as Advice;
    if (!data || !Number.isInteger(data.revision) || typeof data.text !== 'string' || !['missing', 'draft', 'validated'].includes(data.state)) throw new Error('invalid advice');
    return data;
}
