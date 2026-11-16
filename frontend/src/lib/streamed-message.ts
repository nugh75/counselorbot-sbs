// The assistant message being streamed: always the last one of the list.
// Shared by every chat that streams (guided, free, site assistant).
// Deltas update the list at most once per interval, so a long answer does not
// redraw the whole chat on every token; every other change is applied at once.

export const STREAM_RENDER_INTERVAL_MS = 50;

type ChatMessageLike = { role: string; content: string };
type SetMessages<M> = (update: (previous: M[]) => M[]) => void;

export function patchLast<M extends ChatMessageLike>(messages: M[], patch: Partial<M>): M[] {
    if (!messages.length) return messages;
    const next = [...messages];
    next[next.length - 1] = { ...next[next.length - 1], ...patch, role: 'assistant' };
    return next;
}

export interface StreamedMessage<M> {
    /** Delta from the stream: merged and applied at a bounded rate. */
    stream(patch: Partial<M>): void;
    /** Final or error text: applied now, together with any pending delta. */
    set(patch: Partial<M>): void;
    /** Removes the message; pending deltas are discarded. */
    drop(): void;
    /** Applies pending deltas now and stops listening to the signal. */
    finish(): void;
}

// The signal flushes on abort: stopping keeps the text already received, and
// it lands before a new request appends its own messages.
export function createStreamedMessage<M extends ChatMessageLike>(
    setMessages: SetMessages<M>,
    signal?: AbortSignal,
    intervalMs: number = STREAM_RENDER_INTERVAL_MS,
): StreamedMessage<M> {
    let pending: Partial<M> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cancel = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };
    const flush = () => {
        cancel();
        if (!pending) return;
        const patch = pending;
        pending = null;
        setMessages(previous => patchLast(previous, patch));
    };
    signal?.addEventListener('abort', flush, { once: true });

    return {
        stream(patch) {
            pending = { ...pending, ...patch };
            if (timer === null) timer = setTimeout(flush, intervalMs);
        },
        set(patch) {
            pending = { ...pending, ...patch };
            flush();
        },
        drop() {
            cancel();
            pending = null;
            setMessages(previous => previous.slice(0, -1));
        },
        finish() {
            flush();
            signal?.removeEventListener('abort', flush);
        },
    };
}
