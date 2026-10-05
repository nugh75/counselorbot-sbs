import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { createAuthUrls } from './auth-urls.ts';

const urls = createAuthUrls({
    appUrl: 'https://counselorbot.labform.net/',
    authBase: 'https://auth.labform.net/',
    portalUrl: 'https://portal.labform.net/',
    managerUrl: 'https://manager.labform.net/',
    projectId: 'counselorbot-portable',
});
const destination = (login: string) => new URL(login).searchParams.get('rd');

test('preserves upstream defaults when deployment URLs are absent', () => {
    const defaults = createAuthUrls();
    assert.equal(defaults.loginUrl, 'https://auth.ai4educ.org/login');
    assert.equal(defaults.logoutUrl, 'https://auth.ai4educ.org/logout');
    assert.equal(defaults.portalUrl, 'https://portal.ai4educ.org/');
    assert.equal(defaults.managerUrl, 'https://manager.ai4educ.org');
    assert.equal(defaults.secretsUrl, 'https://manager.ai4educ.org/segreti?project=counselorbot-10-step');
    assert.equal(destination(defaults.login()), 'https://counselorbot-sbs.ai4educ.org/admin');
});

test('uses the same installation for login, logout, portal and managed secrets', () => {
    assert.equal(urls.loginUrl, 'https://auth.labform.net/login');
    assert.equal(urls.logoutUrl, 'https://auth.labform.net/logout');
    assert.equal(urls.portalUrl, 'https://portal.labform.net/');
    assert.equal(urls.managerUrl, 'https://manager.labform.net');
    assert.equal(urls.secretsUrl, 'https://manager.labform.net/segreti?project=counselorbot-portable');
    assert.equal(destination(urls.login('/profilo?tab=classi#classe', 'https://counselorbot.labform.net')),
        'https://counselorbot.labform.net/profilo?tab=classi#classe');
});

test('accepts only the configured public origin or local development origins', () => {
    for (const origin of ['https://evil.example', 'https://portal.labform.net', 'https://counselorbot.labform.net.evil.example',
        'https://another.ai4educ.org', 'https://counselorbot.labform.net:8443', 'http://counselorbot.labform.net',
        'https://localhost.evil.example', 'file:///tmp/app', 'invalid']) {
        assert.equal(destination(urls.login('/profilo', origin)), 'https://counselorbot.labform.net/profilo');
    }
    for (const origin of ['http://localhost:3107', 'http://127.0.0.1:3107', 'http://[::1]:3107']) {
        assert.equal(destination(urls.login('/profilo', origin)), `${origin}/profilo`);
    }
});

test('rejects external destinations and paths with ambiguous URL parsing', () => {
    for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '\\evil.example',
        '/\n/evil.example', '/\t/evil.example', '/\u0000evil', '']) {
        assert.equal(destination(urls.login(path)), 'https://counselorbot.labform.net/admin');
    }
    assert.equal(destination(urls.login('/')), 'https://counselorbot.labform.net/');
});
