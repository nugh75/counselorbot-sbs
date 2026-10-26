import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { applyRequestOrigin, originHeaders, requestOrigin } from './request-origin.js';

const secret = { COUNSELORBOT_FRONTEND_SECRET: 'fixture-frontend-secret' };
const spoofed = {
    'x-counselorbot-origin': 'local',
    'x-counselorbot-client-ip': '10.0.0.1',
    'x-counselorbot-frontend-secret': 'guessed-secret',
};

const signed = (incoming: Record<string, string>, env: Record<string, string | undefined> = secret) => {
    const source = new Headers(incoming);
    const target = new Headers(source);
    applyRequestOrigin(source, target, env);
    return target;
};

test('any Cloudflare edge header means tunnel, none means local', () => {
    for (const name of ['cf-connecting-ip', 'cf-ray', 'cf-visitor']) {
        assert.equal(requestOrigin(new Headers({ [name]: 'x' })), 'tunnel');
    }
    assert.equal(requestOrigin(new Headers({ 'x-forwarded-for': '127.0.0.1' })), 'local');
});

test('tunnel request is signed as tunnel with the Cloudflare client IP', () => {
    const headers = signed({ 'cf-connecting-ip': ' 203.0.113.7 ', 'x-forwarded-for': '127.0.0.1' });
    assert.equal(headers.get('x-counselorbot-origin'), 'tunnel');
    assert.equal(headers.get('x-counselorbot-client-ip'), '203.0.113.7');
    assert.equal(headers.get('x-counselorbot-frontend-secret'), 'fixture-frontend-secret');
});

test('tunnel without cf-connecting-ip never borrows a client-declared address', () => {
    const headers = signed({ 'cf-ray': 'fixture', 'x-forwarded-for': '127.0.0.1' });
    assert.equal(headers.get('x-counselorbot-origin'), 'tunnel');
    assert.equal(headers.get('x-counselorbot-client-ip'), 'unknown');
});

test('local request uses the connection address Next records', () => {
    const headers = signed({ 'x-forwarded-for': '127.0.0.1, 10.0.0.2' });
    assert.equal(headers.get('x-counselorbot-origin'), 'local');
    assert.equal(headers.get('x-counselorbot-client-ip'), '127.0.0.1');
    assert.equal(signed({}).get('x-counselorbot-client-ip'), '127.0.0.1');
});

test('spoofed origin headers from a tunnel client are replaced', () => {
    const headers = signed({ ...spoofed, 'cf-connecting-ip': '203.0.113.7' });
    assert.equal(headers.get('x-counselorbot-origin'), 'tunnel');
    assert.equal(headers.get('x-counselorbot-client-ip'), '203.0.113.7');
    assert.equal(headers.get('x-counselorbot-frontend-secret'), 'fixture-frontend-secret');
});

test('without a frontend secret (Docker production) spoofed headers are only removed', () => {
    for (const env of [{}, { COUNSELORBOT_FRONTEND_SECRET: '' }]) {
        const headers = signed({ ...spoofed, cookie: 'fixture=yes', 'cf-ray': 'fixture' }, env);
        for (const name of originHeaders) assert.equal(headers.has(name), false, name);
        assert.equal(headers.get('cookie'), 'fixture=yes');
    }
});

test('signing twice (middleware then stream proxy) yields the same origin', () => {
    const once = signed({ ...spoofed, 'cf-connecting-ip': '203.0.113.7' });
    const twice = new Headers();
    applyRequestOrigin(once, twice, secret);
    for (const name of originHeaders) assert.equal(twice.get(name), once.get(name), name);
});
