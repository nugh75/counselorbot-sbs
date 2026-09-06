import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { streamChat, IncompleteChatStreamError } from './chat-stream.ts';

const event = (data: object) => `data: ${JSON.stringify(data)}\n\n`;

test('a closed stream without done preserves text and server session IDs', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(
        event({ session_id: 's1', conversation_id: 'c1' }) + event({ display: 'Studia e' }),
    ));
    const updates: string[] = [];
    await assert.rejects(streamChat({}, (text: string) => updates.push(text)), (error: unknown) => {
        assert.ok(error instanceof IncompleteChatStreamError);
        assert.deepEqual(error.partial, { response: 'Studia e', session_id: 's1', conversation_id: 'c1' });
        return true;
    });
    assert.deepEqual(updates, ['Studia e']);
});

test('a provider error after visible text is recoverable, before text it is an error', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(
        event({ display: 'Studia e' }) + event({ error: 'provider unavailable' }),
    ));
    await assert.rejects(streamChat({}, () => {}), IncompleteChatStreamError);
    fetch.mock.mockImplementation(async () => new Response(event({ error: 'provider unavailable' })));
    await assert.rejects(streamChat({}, () => {}), /provider unavailable/);
});

test('continuation returns the complete answer and metadata only after done', async (t) => {
    let sent: Record<string, unknown> = {};
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        return new Response(event({ display: 'Studia e verifica.' }) + event({ done: true, response: 'Studia e verifica.', response_id: 'r1' }));
    });
    const result = await streamChat({ message: 'Come studio?', partial_response: 'Studia e' }, () => {});
    assert.equal(result.response, 'Studia e verifica.');
    assert.equal(result.response_id, 'r1');
    assert.equal(sent.partial_response, 'Studia e');
});

test('transport failure preserves the last display; intentional abort remains an abort', async (t) => {
    const controller = new AbortController();
    const transport = () => new Response(new ReadableStream({
        start(stream) { stream.enqueue(new TextEncoder().encode(event({ display: 'Testo parziale' }))); },
        pull(stream) { stream.error(new TypeError('network lost')); },
    }));
    t.mock.method(globalThis, 'fetch', async () => transport());
    await assert.rejects(streamChat({}, () => {}), IncompleteChatStreamError);
    await assert.rejects(streamChat({}, () => controller.abort(), controller.signal), (error: unknown) => {
        assert.ok(!(error instanceof IncompleteChatStreamError));
        return true;
    });
});

test('SSE chunks can split CRLF and UTF-8 without corrupting a completed answer', async (t) => {
    const bytes = new TextEncoder().encode(event({ display: 'Perché?' }).replaceAll('\n', '\r\n') + event({ done: true, response: 'Perché?' }));
    t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
        start(stream) { for (const byte of bytes) stream.enqueue(new Uint8Array([byte])); stream.close(); },
    })));
    assert.equal((await streamChat({}, () => {})).response, 'Perché?');
});
