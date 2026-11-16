import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { createStreamedMessage, patchLast } from './streamed-message.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { streamChat, ChatProviderError } from './chat-stream.ts';

type Message = { role: string; content: string; reasoning?: string; sources?: string[] };

function list(initial: Message[]) {
    let messages = initial;
    let renders = 0;
    const setMessages = (update: (previous: Message[]) => Message[]) => { messages = update(messages); renders += 1; };
    return { setMessages, get messages() { return messages; }, get renders() { return renders; } };
}

const event = (payload: Record<string, unknown>) => `data: ${JSON.stringify(payload)}\n\n`;
const sse = (body: string) => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode(body)); stream.close(); },
}));

test('patchLast only touches the streamed assistant message', () => {
    const first = { role: 'user', content: 'Ciao' };
    const next = patchLast<Message>([first, { role: 'assistant', content: '' }], { content: 'Risposta' });
    assert.equal(next[0], first);
    assert.deepEqual(next[1], { role: 'assistant', content: 'Risposta' });
    assert.deepEqual(patchLast<Message>([], { content: 'x' }), []);
});

test('deltas are merged and applied at a bounded rate', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const chat = list([{ role: 'assistant', content: '' }]);
    const reply = createStreamedMessage(chat.setMessages, undefined, 50);
    for (const text of ['U', 'Un', 'Una', 'Una r']) reply.stream({ content: text });
    reply.stream({ reasoning: 'pensa' });
    assert.equal(chat.renders, 0);
    t.mock.timers.tick(50);
    assert.equal(chat.renders, 1);
    assert.deepEqual(chat.messages, [{ role: 'assistant', content: 'Una r', reasoning: 'pensa' }]);
    reply.stream({ content: 'Una risposta' });
    reply.set({ content: 'Una risposta.' });
    t.mock.timers.tick(100);
    assert.equal(chat.renders, 2);
    assert.equal(chat.messages[0].content, 'Una risposta.');
});

test('stop keeps the text already received before the next request appends', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const chat = list([{ role: 'user', content: 'Domanda' }, { role: 'assistant', content: '' }]);
    const controller = new AbortController();
    const reply = createStreamedMessage(chat.setMessages, controller.signal);
    reply.stream({ content: 'Testo parziale' });
    controller.abort();
    chat.setMessages(previous => [...previous, { role: 'user', content: 'Nuova domanda' }]);
    t.mock.timers.tick(1000);
    assert.deepEqual(chat.messages.map(message => message.content), ['Domanda', 'Testo parziale', 'Nuova domanda']);
});

test('drop discards pending deltas and never patches the previous message', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const chat = list([{ role: 'assistant', content: 'Prima' }, { role: 'assistant', content: '' }]);
    const reply = createStreamedMessage(chat.setMessages);
    reply.stream({ content: 'Parziale' });
    reply.drop();
    t.mock.timers.tick(1000);
    assert.deepEqual(chat.messages, [{ role: 'assistant', content: 'Prima' }]);
});

test('finish applies pending deltas and stops listening to the signal', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const chat = list([{ role: 'assistant', content: '' }]);
    const controller = new AbortController();
    const reply = createStreamedMessage(chat.setMessages, controller.signal);
    reply.stream({ content: 'Fine' });
    reply.finish();
    controller.abort();
    assert.equal(chat.renders, 1);
    assert.equal(chat.messages[0].content, 'Fine');
});

test('SSE events from streamChat fill the streamed message', async (t) => {
    const body = event({ session_id: 's1' }) + event({ delta: 'Ciao' }) + event({ delta: ' a te' })
        + event({ reasoning: 'fixture' }) + event({ done: true, response: 'Ciao a te', sources: ['guida'] });
    t.mock.method(globalThis, 'fetch', async () => sse(body));
    const chat = list([{ role: 'user', content: 'Ciao' }, { role: 'assistant', content: '' }]);
    const reply = createStreamedMessage(chat.setMessages);
    const result = await streamChat({}, (full: string) => reply.stream({ content: full }), undefined, (reasoning: string) => reply.stream({ reasoning }));
    reply.set({ content: result.response, sources: result.sources });
    assert.deepEqual(chat.messages[1], { role: 'assistant', content: 'Ciao a te', reasoning: 'fixture', sources: ['guida'] });
    assert.equal(chat.renders, 1);
});

test('a provider error replaces the streamed message with the error text', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => sse(event({ error: 'boom', error_code: 'chat.errors.connection' })));
    const chat = list([{ role: 'assistant', content: '' }]);
    const reply = createStreamedMessage(chat.setMessages);
    await assert.rejects(streamChat({}, (full: string) => reply.stream({ content: full })), (error: unknown) => {
        assert.ok(error instanceof ChatProviderError);
        reply.set({ content: 'Errore di connessione' });
        return true;
    });
    assert.deepEqual(chat.messages, [{ role: 'assistant', content: 'Errore di connessione' }]);
});
