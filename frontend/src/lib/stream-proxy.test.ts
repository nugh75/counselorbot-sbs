import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { backendOrigin } from './backend-origin.js';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { proxyChatStream } from './stream-proxy.js';

test('all proxies support host development and preserve the Docker/internal fallback', () => {
    assert.equal(backendOrigin({ BACKEND_ORIGIN: 'http://127.0.0.1:8002/', BACKEND_INTERNAL_URL: 'http://backend:8000' }), 'http://127.0.0.1:8002');
    assert.equal(backendOrigin({ BACKEND_INTERNAL_URL: 'http://custom:8000/' }), 'http://custom:8000');
    assert.equal(backendOrigin({}), 'http://backend:8000');
});

test('proxy streams without consuming the upstream and forwards trusted identity, language and cancellation', async (t) => {
    const body = ': ping\n\ndata: {"done":true,"response":"Test"}\n\n: ping\n\n';
    const upstream = new Response(body);
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
    assert.equal(await response.text(), body);
});

test('proxy replaces spoofed origin headers with the signed tunnel origin', async (t) => {
    const previous = process.env.COUNSELORBOT_FRONTEND_SECRET;
    process.env.COUNSELORBOT_FRONTEND_SECRET = 'fixture-frontend-secret';
    t.after(() => {
        if (previous === undefined) delete process.env.COUNSELORBOT_FRONTEND_SECRET;
        else process.env.COUNSELORBOT_FRONTEND_SECRET = previous;
    });
    const request = new Request('http://localhost/api/chat/stream', { method: 'POST', body: '{}', headers: {
        'cf-connecting-ip': '203.0.113.7', 'x-counselorbot-origin': 'local', 'x-counselorbot-client-ip': '10.0.0.1',
        'x-counselorbot-frontend-secret': 'guessed-secret' } });
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        assert.equal(headers.get('x-counselorbot-origin'), 'tunnel');
        assert.equal(headers.get('x-counselorbot-client-ip'), '203.0.113.7');
        assert.equal(headers.get('x-counselorbot-frontend-secret'), 'fixture-frontend-secret');
        return new Response('data: {"done":true}\n\n');
    });
    assert.equal((await proxyChatStream(request, '/chat/stream')).status, 200);
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
