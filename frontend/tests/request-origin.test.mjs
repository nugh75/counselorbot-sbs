// Origine della richiesta su HTTP reale (ADR-0002 §2.7, F1-19): rewrite /api e
// rotte di streaming devono portare al backend la stessa origine firmata.
// Gira contro il frontend isolato di scripts/dev-stream-proxy-tests.sh:
// - senza segreto (produzione Docker): le X-CounselorBot-* del client spariscono;
// - con COUNSELORBOT_FRONTEND_SECRET=<s> sul server e REQUEST_ORIGIN_SECRET=<s>
//   qui: origine, IP e segreto impostati dal frontend.
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';

const origin = process.env.STREAM_PROXY_BASE_URL || 'http://127.0.0.1:3135';
const upstreamPort = Number(process.env.STREAM_PROXY_UPSTREAM_PORT || 3136);
const secret = process.env.REQUEST_ORIGIN_SECRET || '';
if (new URL(origin).hostname !== '127.0.0.1') throw new Error('This test requires an isolated loopback frontend.');
let server;
const seen = [];
const upgraded = new Set();

before(async () => {
    server = createServer(async (request, response) => {
        for await (const chunk of request) { void chunk; /* drain */ }
        seen.push({ path: request.url, headers: request.headers });
        if (request.url.startsWith('/health')) {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            return response.end('{"fixture":true}');
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end('data: {"done":true}\n\n');
    });
    server.on('upgrade', (request, socket) => {
        upgraded.add(socket);
        socket.on('close', () => upgraded.delete(socket));
        socket.on('error', () => {});
        seen.push({ path: request.url, headers: request.headers });
        const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(upstreamPort, '127.0.0.1', resolve); });
});
after(async () => {
    for (const socket of upgraded) socket.destroy();
    server?.closeAllConnections();
    if (server) await new Promise(resolve => server.close(resolve));
});

const spoofed = {
    'x-counselorbot-origin': 'local',
    'x-counselorbot-client-ip': '10.0.0.1',
    'x-counselorbot-frontend-secret': 'guessed-secret',
};
const routes = [
    ['GET', '/api/health', '/health'],
    ['POST', '/api/chat/stream', '/chat/stream'],
    ['POST', '/api/site-chat/stream', '/site-chat/stream'],
    ['POST', '/api/tts/stream', '/tts/stream'],
    ['POST', '/api/opencode/workspace/synthetic/chat', '/opencode/workspace/synthetic/chat'],
];

async function upstreamHeaders(method, path, upstream, headers) {
    const response = await fetch(`${origin}${path}`, {
        method, headers: { ...headers, 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined,
    });
    assert.equal(response.status, 200);
    await response.text();
    const request = seen.at(-1);
    assert.equal(request.path, upstream);
    return request.headers;
}

for (const [method, path, upstream] of routes) {
    test(`${path}: tunnel request with spoofed origin headers`, async () => {
        const headers = await upstreamHeaders(method, path, upstream, { ...spoofed, 'cf-connecting-ip': '203.0.113.7', 'cf-ray': 'fixture' });
        if (!secret) {
            for (const name of Object.keys(spoofed)) assert.equal(headers[name], undefined, name);
            return;
        }
        assert.equal(headers['x-counselorbot-origin'], 'tunnel');
        assert.equal(headers['x-counselorbot-client-ip'], '203.0.113.7');
        assert.equal(headers['x-counselorbot-frontend-secret'], secret);
    });

    test(`${path}: local request`, async () => {
        const headers = await upstreamHeaders(method, path, upstream, spoofed);
        if (!secret) {
            for (const name of Object.keys(spoofed)) assert.equal(headers[name], undefined, name);
            return;
        }
        assert.equal(headers['x-counselorbot-origin'], 'local');
        assert.equal(headers['x-counselorbot-client-ip'], '127.0.0.1');
        assert.equal(headers['x-counselorbot-frontend-secret'], secret);
    });
}


test('/api/term: WebSocket upgrade reaches the runtime backend before the catch-all', async () => {
    const request = httpRequest(`${origin}/api/term?mode=opencode&key=synthetic`, {
        headers: {
            ...spoofed, 'cf-connecting-ip': '203.0.113.7',
            Upgrade: 'websocket', Connection: 'Upgrade',
            'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        },
    });
    let socket;
    try {
        const connected = once(request, 'upgrade', { signal: AbortSignal.timeout(10_000) });
        request.end();
        const [response, upgradedSocket] = await connected;
        socket = upgradedSocket;
        assert.equal(response.statusCode, 101);
        const forwarded = seen.at(-1);
        assert.equal(forwarded.path, '/term?mode=opencode&key=synthetic');
        if (secret) {
            assert.equal(forwarded.headers['x-counselorbot-origin'], 'tunnel');
            assert.equal(forwarded.headers['x-counselorbot-frontend-secret'], secret);
        } else {
            for (const name of Object.keys(spoofed)) assert.equal(forwarded.headers[name], undefined, name);
        }
    } finally {
        socket?.destroy();
        request.destroy();
    }
});
