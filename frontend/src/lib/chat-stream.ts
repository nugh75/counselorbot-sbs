// Helper per consumare l'endpoint SSE /api/chat/stream.
// Chiama onDelta(fullText) ad ogni aggiornamento e ritorna la risposta finale.

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { withViewAsHeaders } from './auth.ts';
import type { RecommendationCatalog } from '@/lib/recommendations';

export interface ChatStreamResult {
    response: string;
    session_id?: string;
    conversation_id?: string;
    strategy_ids?: string[];
    response_id?: string;
    idea_revision_id?: number;
    sources?: string[];
    recommendations?: RecommendationCatalog;
}

export class IncompleteChatStreamError extends Error {
    partial: ChatStreamResult;
    constructor(partial: ChatStreamResult, options?: ErrorOptions) {
        super('The response was interrupted before completion.', options);
        this.name = 'IncompleteChatStreamError';
        this.partial = partial;
    }
}

export async function streamChat(
    payload: Record<string, unknown>,
    onDelta: (fullText: string) => void,
    signal?: AbortSignal,
    onReasoning?: (fullReasoning: string) => void,
    endpoint: string = '/api/chat/stream',
): Promise<ChatStreamResult> {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: withViewAsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
        signal,
    });

    if (!res.ok || !res.body) {
        throw new Error(`Stream non disponibile (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = typeof payload.partial_response === 'string' ? payload.partial_response : '';
    let completed = false;
    let incomplete = false;
    let reasoning = '';
    let sessionId: string | undefined;
    let conversationId: string | undefined;
    let strategyIds: string[] | undefined;
    let responseId: string | undefined;
    let ideaRevisionId: number | undefined;
    let sources: string[] | undefined;
    let recommendations: RecommendationCatalog | undefined;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
                const line = part.trim();
                if (!line.startsWith('data:')) continue;
                const json = line.slice(5).trim();
                if (!json) continue;

                let evt: { delta?: string; display?: string; reasoning?: string; done?: boolean; incomplete?: boolean; response?: string; session_id?: string; conversation_id?: string; strategy_ids?: string[]; response_id?: string; idea_revision_id?: number; sources?: string[]; recommendations?: RecommendationCatalog; error?: string };
                try {
                    evt = JSON.parse(json);
                } catch {
                    continue;
                }

                if (evt.session_id) sessionId = evt.session_id;
                if (evt.conversation_id) conversationId = evt.conversation_id;
                if (evt.error) {
                    throw new Error(evt.error);
                }
                if (typeof evt.reasoning === 'string') {
                    reasoning += evt.reasoning;
                    onReasoning?.(reasoning);
                }
                if (typeof evt.display === 'string') {
                    full = evt.display;
                    onDelta(full);
                } else if (typeof evt.delta === 'string') {
                    full += evt.delta;
                    onDelta(full);
                }
                if (evt.done) {
                    completed = true;
                    incomplete = evt.incomplete === true;
                    if (typeof evt.response === 'string') full = evt.response;
                    if (incomplete) onDelta(full);
                    sessionId = evt.session_id ?? sessionId;
                    conversationId = evt.conversation_id ?? conversationId;
                    strategyIds = evt.strategy_ids;
                    responseId = evt.response_id;
                    ideaRevisionId = evt.idea_revision_id;
                    sources = evt.sources;
                    recommendations = evt.recommendations;
                }
            }
            if (completed) break;
        }
    } catch (error) {
        if (signal?.aborted || !full.trim()) throw error;
        throw new IncompleteChatStreamError({ response: full, session_id: sessionId, conversation_id: conversationId }, { cause: error });
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
    if (!completed || incomplete) {
        throw new IncompleteChatStreamError({ response: full, session_id: sessionId, conversation_id: conversationId });
    }

    return { response: full, session_id: sessionId, conversation_id: conversationId, strategy_ids: strategyIds, response_id: responseId, idea_revision_id: ideaRevisionId, sources, recommendations };
}
