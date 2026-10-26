import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { proxyAPI } from './api-proxy.js';

async function backend(t: { after: (fn: () => Promise<void>) => void }, handler: http.RequestListener) {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close(error => error ? reject(error) : resolve());
    }));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return `http://127.0.0.1:${address.port}`;
}

function environment(t: { after: (fn: () => void) => void }) {
    const old = { BACKEND_ORIGIN: process.env.BACKEND_ORIGIN, COUNSELORBOT_FRONTEND_SECRET: process.env.COUNSELORBOT_FRONTEND_SECRET };
    t.after(() => {
        for (const [name, value] of Object.entries(old)) {
            if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
    });
}

test('API fallback resolves a changed backend port without another build/import', async t => {
    environment(t);
    const first = await backend(t, (_, res) => res.end('first'));
    const second = await backend(t, (_, res) => res.end('second'));
    process.env.BACKEND_ORIGIN = first;
    assert.equal(await (await proxyAPI(new Request('http://frontend/api/health'))).text(), 'first');
    process.env.BACKEND_ORIGIN = second;
    assert.equal(await (await proxyAPI(new Request('http://frontend/api/health'))).text(), 'second');
});

test('upload, query, cookies and signed tunnel origin reach the runtime backend', async t => {
    environment(t);
    process.env.COUNSELORBOT_FRONTEND_SECRET = 'synthetic-frontend-secret';
    process.env.BACKEND_ORIGIN = await backend(t, async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        res.setHeader('Set-Cookie', ['first=1; HttpOnly', 'second=2; HttpOnly']);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, path: req.url, body, headers: req.headers }));
    });
    const response = await proxyAPI(new Request('http://frontend/api/upload?q=a%20b', {
        method: 'POST', body: 'synthetic multipart bytes', headers: {
            'content-type': 'multipart/form-data; boundary=synthetic', cookie: 'cb_session=synthetic',
            'cf-connecting-ip': '203.0.113.8', 'x-counselorbot-origin': 'local',
            'x-counselorbot-frontend-secret': 'forged', connection: 'x-hop', 'x-hop': 'drop',
        },
    }));
    assert.equal(response.status, 201);
    assert.equal(response.headers.getSetCookie().length, 2);
    const data = await response.json();
    assert.equal(data.method, 'POST');
    assert.equal(data.path, '/upload?q=a%20b');
    assert.equal(data.body, 'synthetic multipart bytes');
    assert.equal(data.headers.cookie, 'cb_session=synthetic');
    assert.equal(data.headers['x-counselorbot-origin'], 'tunnel');
    assert.equal(data.headers['x-counselorbot-frontend-secret'], 'synthetic-frontend-secret');
    assert.equal(data.headers['x-hop'], undefined);
});

test('API response starts before the upstream stream finishes', async t => {
    environment(t);
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    t.after(() => finish());
    process.env.BACKEND_ORIGIN = await backend(t, async (_, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('first');
        await pending;
        res.end('last');
    });
    const response = await proxyAPI(new Request('http://frontend/api/events'));
    const reader = response.body!.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'first');
    finish();
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'last');
    assert.equal((await reader.read()).done, true);
});

test('shell internal routes are blocked before contacting an upstream', async t => {
    environment(t);
    process.env.BACKEND_ORIGIN = 'http://127.0.0.1:1';
    for (const path of ['/api/internal/ping', '/api/INTERNAL', '/api/%69nternal/ping']) {
        assert.equal((await proxyAPI(new Request(`http://frontend${path}`))).status, 404);
    }
});

test('upstream connection failures have a sanitized 502 response', async t => {
    environment(t);
    process.env.BACKEND_ORIGIN = 'http://127.0.0.1:1';
    const response = await proxyAPI(new Request('http://frontend/api/health'));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { detail: 'Backend unavailable' });
});


test('decoded upstream responses do not retain gzip headers or compressed length', async t => {
    environment(t);
    const compressed = gzipSync('synthetic response');
    process.env.BACKEND_ORIGIN = await backend(t, (_, res) => {
        res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': compressed.length });
        res.end(compressed);
    });
    const response = await proxyAPI(new Request('http://frontend/api/download'));
    assert.equal(await response.text(), 'synthetic response');
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('content-length'), null);
});

test('HEAD and no-content responses preserve their status without a body', async t => {
    environment(t);
    process.env.BACKEND_ORIGIN = await backend(t, (req, res) => {
        res.writeHead(req.method === 'HEAD' ? 200 : 204, { 'X-Fixture': 'present' });
        res.end();
    });
    for (const [method, status] of [['HEAD', 200], ['DELETE', 204]] as const) {
        const response = await proxyAPI(new Request('http://frontend/api/resource', { method }));
        assert.equal(response.status, status);
        assert.equal(response.body, null);
        assert.equal(response.headers.get('x-fixture'), 'present');
    }
});
