// Run against an isolated Next dev server with only BACKEND_ORIGIN set to this
// fixture's loopback address. These requests never reach an LLM or real account.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';

const origin = process.env.STREAM_PROXY_BASE_URL || 'http://127.0.0.1:3135';
const upstreamPort = Number(process.env.STREAM_PROXY_UPSTREAM_PORT || 3136);
if (new URL(origin).hostname !== '127.0.0.1') throw new Error('This test requires an isolated loopback frontend.');
let server;
const seen = [];
const frame = data => `data: ${JSON.stringify(data)}\n\n`;

before(async () => {
    server = createServer(async (request, response) => {
        let raw = '';
        for await (const chunk of request) raw += chunk;
        const body = raw ? JSON.parse(raw) : {};
        seen.push({ path: request.url, body, headers: request.headers });
        if (request.url === '/health') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            return response.end('{"fixture":true}');
        }
        if (body.fixture_failure === 'network') return request.socket.destroy();
        if (body.fixture_failure) {
            response.writeHead(body.fixture_status || 502, { 'Content-Type': 'application/json' });
            return response.end(JSON.stringify({ detail: body.fixture_failure, private: 'private-fixture-key' }));
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(frame({ display: 'Risposta fittizia.' }) + frame({ done: true, response: 'Risposta fittizia.' }));
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(upstreamPort, '127.0.0.1', resolve); });
});
after(async () => {
    server?.closeAllConnections();
    if (server) await new Promise(resolve => server.close(resolve));
});

const send = (path, body = {}) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'fixture=yes', 'x-view-as': 'fixture', 'x-counselorbot-language': 'sv' },
    body: JSON.stringify(body),
});

test('ordinary APIs reach the same host development backend', async () => {
    const response = await fetch(`${origin}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { fixture: true });
});

for (const [path, upstream] of [
    ['/api/chat/stream', '/chat/stream'],
    ['/api/site-chat/stream', '/site-chat/stream'],
    ['/api/opencode/workspace/fixture%20key/chat', '/opencode/workspace/fixture%20key/chat'],
    ['/api/tts/stream', '/tts/stream'],
]) {
    test(`${path} uses BACKEND_ORIGIN and preserves streaming and identity`, async () => {
        const response = await send(path, { message: 'Test fittizio' });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /text\/event-stream/);
        assert.equal(response.headers.get('x-accel-buffering'), 'no');
        assert.match(await response.text(), /"done":true/);
        const request = seen.at(-1);
        assert.equal(request.path, upstream);
        assert.equal(request.body.message, 'Test fittizio');
        assert.equal(request.headers.cookie, 'fixture=yes');
        assert.equal(request.headers['x-view-as'], 'fixture');
        if (!path.includes('/tts/')) assert.equal(request.headers['x-counselorbot-language'], 'sv');
    });
}

for (const failure of ['personalAPI.errors.privacy', 'personalAPI.errors.quota']) {
    test(`HTTP failure before SSE retains ${failure} without exposing provider details`, async () => {
        const response = await send('/api/chat/stream', { fixture_failure: { error_code: failure } });
        assert.equal(response.status, 502);
        const body = await response.text();
        assert.equal(JSON.parse(body).error_code, failure);
        assert.equal(body.includes('private-fixture-key'), false);
    });
}

for (const failure of ['private-fixture-key', 'network']) {
    test(`${failure === 'network' ? 'lost upstream' : 'unknown HTTP error'} returns a safe recoverable error`, async () => {
        const response = await send('/api/chat/stream', { fixture_failure: failure });
        assert.equal(response.status, 502);
        const body = await response.text();
        assert.equal(JSON.parse(body).error_code, 'chat.errors.connection');
        assert.equal(body.includes('private-fixture-key'), false);
        const retry = await send('/api/chat/stream');
        assert.equal(retry.status, 200);
        assert.match(await retry.text(), /"done":true/);
    });
}
