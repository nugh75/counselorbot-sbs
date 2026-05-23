// Helper per consumare l'endpoint SSE /api/chat/stream.
// Chiama onDelta(fullText) ad ogni aggiornamento e ritorna la risposta finale.

export interface ChatStreamResult {
    response: string;
    session_id?: string;
    strategy_ids?: string[];
}

export async function streamChat(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: Record<string, any>,
    onDelta: (fullText: string) => void,
    signal?: AbortSignal,
): Promise<ChatStreamResult> {
    const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
    });

    if (!res.ok || !res.body) {
        throw new Error(`Stream non disponibile (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let sessionId: string | undefined;
    let strategyIds: string[] | undefined;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json) continue;

            let evt: { delta?: string; display?: string; done?: boolean; response?: string; session_id?: string; strategy_ids?: string[]; error?: string };
            try {
                evt = JSON.parse(json);
            } catch {
                continue;
            }

            if (evt.error) {
                throw new Error(evt.error);
            }
            if (typeof evt.display === 'string') {
                full = evt.display;
                onDelta(full);
            } else if (typeof evt.delta === 'string') {
                full += evt.delta;
                onDelta(full);
            }
            if (evt.done) {
                if (typeof evt.response === 'string') full = evt.response;
                sessionId = evt.session_id;
                strategyIds = evt.strategy_ids;
            }
        }
    }

    return { response: full, session_id: sessionId, strategy_ids: strategyIds };
}
