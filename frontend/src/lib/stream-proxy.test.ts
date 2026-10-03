import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { backendOrigin } from './backend-origin.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { proxyChatStream } from './stream-proxy.ts';

test('all proxies support host development and preserve the Docker/internal fallback', () => {
    assert.equal(backendOrigin({ BACKEND_ORIGIN: 'http://127.0.0.1:8002/', BACKEND_INTERNAL_URL: 'http://backend:8000' }), 'http://127.0.0.1:8002');
    assert.equal(backendOrigin({ BACKEND_INTERNAL_URL: 'http://custom:8000/' }), 'http://custom:8000');
    assert.equal(backendOrigin({}), 'http://backend:8000');
});

test('proxy streams without consuming the upstream and forwards trusted identity, language and cancellation', async (t) => {
    const upstream = new Response('data: {"done":true,"response":"Test"}\n\n');
    const request = new Request('http://localhost/api/chat/stream', { method: 'POST', body: '{"message":"Test"}',
        headers: { cookie: 'fixture=yes', 'x-view-as': 'fixture', 'x-counselorbot-language': 'sv', 'remote-user': 'fixture-user', 'authorization': 'must-not-forward' } });
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        assert.equal(url, `${backendOrigin()}/chat/stream`);
        const headers = new Headers(init.headers);
        assert.equal(headers.get('cookie'), 'fixture=yes');
        assert.equal(headers.get('x-view-as'), 'fixture');
        assert.equal(headers.get('remote-user'), 'fixture-user');
        assert.equal(headers.get('x-counselorbot-language'), 'sv');
        assert.equal(headers.has('authorization'), false);
        assert.equal(init.body, '{"message":"Test"}');
        assert.equal(init.signal, request.signal);
        return upstream;
    });
    const response = await proxyChatStream(request, '/chat/stream');
    assert.equal(upstream.bodyUsed, false);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    assert.match(await response.text(), /"done":true/);
});

test('errors before SSE retain a safe code and discard provider messages', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: { error_code: 'personalAPI.errors.privacy' }, private: 'private-fixture-key' }, { status: 502 }));
    const result = await proxyChatStream(new Request('http://localhost', { method: 'POST', body: '{}' }), '/chat/stream');
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { error: 'Chat request unavailable.', error_code: 'personalAPI.errors.privacy' });
});

test('unreachable backend produces a safe recoverable HTTP error', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('private-fixture-key'); });
    const result = await proxyChatStream(new Request('http://localhost', { method: 'POST', body: '{}' }), '/chat/stream');
    assert.equal(result.status, 502);
    assert.equal((await result.json()).error_code, 'chat.errors.connection');
});
