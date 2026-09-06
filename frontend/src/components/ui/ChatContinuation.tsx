'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IncompleteChatStreamError, streamChat as readStream } from '@/lib/chat-stream';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import { Button } from './Button';

// Keep the caller's turn open: phase changes and final metadata wait for done.
export function useChatContinuation() {
    const [pending, setPending] = useState(false);
    const resume = useRef<(() => void) | null>(null);
    const active = useRef<AbortController | null>(null);
    useEffect(() => () => active.current?.abort(), []);

    const streamChat = useCallback(async (...args: Parameters<typeof readStream>) => {
        const [originalPayload, onDelta, signal, onReasoning, endpoint] = args;
        const controller = new AbortController();
        active.current?.abort();
        active.current = controller;
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        let payload = originalPayload;
        try {
            for (;;) {
                try {
                    return await readStream(payload, onDelta, controller.signal, onReasoning, endpoint);
                } catch (error) {
                    if (controller.signal.aborted) throw error;
                    const partial = error instanceof IncompleteChatStreamError ? error.partial : {
                        response: typeof payload.partial_response === 'string' ? payload.partial_response : '',
                        session_id: payload.session_id,
                        conversation_id: payload.conversation_id,
                    };
                    if (!partial.response.trim()) throw error;
                    payload = {
                        ...payload,
                        partial_response: partial.response,
                        session_id: partial.session_id ?? payload.session_id,
                        conversation_id: partial.conversation_id ?? payload.conversation_id,
                    };
                    setPending(true);
                    await new Promise<void>((resolve, reject) => {
                        const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
                        const cleanup = () => {
                            resume.current = null;
                            controller.signal.removeEventListener('abort', onAbort);
                        };
                        resume.current = () => { cleanup(); resolve(); };
                        controller.signal.addEventListener('abort', onAbort, { once: true });
                        if (controller.signal.aborted) onAbort();
                    });
                    setPending(false);
                }
            }
        } finally {
            signal?.removeEventListener('abort', abort);
            if (active.current === controller) {
                active.current = null;
                setPending(false);
                resume.current = null;
            }
        }
    }, []);

    return { streamChat, pending, continueResponse: () => resume.current?.() };
}

export function ChatContinuation({ locale, pending, continueResponse }: {
    locale: string;
    pending: boolean;
    continueResponse: () => void;
}) {
    if (!pending) return null;
    return (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span role="status" className="text-sm text-slate-600">{chatLayoutLabel(locale, 'interrupted')}</span>
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={continueResponse}>
                {chatLayoutLabel(locale, 'continue')}
            </Button>
        </div>
    );
}
