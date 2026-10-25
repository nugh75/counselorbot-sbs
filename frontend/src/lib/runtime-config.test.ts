import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { getRuntimeConfig, publicOrigin, runtimeConfigFromEnv, runtimeConfigScript } from './runtime-config.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { createAuthUrls } from './auth-urls.ts';

test('reads only the configured, non-empty startup variables', () => {
    assert.deepEqual(runtimeConfigFromEnv({}), {});
    assert.deepEqual(runtimeConfigFromEnv({
        COUNSELORBOT_APP_URL: ' https://abc.trycloudflare.com ',
        COUNSELORBOT_AUTH_URL: 'https://auth.labform.net',
        COUNSELORBOT_PORTAL_URL: '',
        COUNSELORBOT_MANAGER_URL: 'https://manager.labform.net',
        COUNSELORBOT_PROJECT_ID: 'counselorbot-portable',
        NEXT_PUBLIC_APP_URL: 'https://ignored.example',
    }), {
        appUrl: 'https://abc.trycloudflare.com',
        authBase: 'https://auth.labform.net',
        managerUrl: 'https://manager.labform.net',
        projectId: 'counselorbot-portable',
    });
});

test('the served script publishes the config that the browser reads back', () => {
    const config = { appUrl: 'https://counselorbot.labform.net', authBase: 'https://auth.labform.net' };
    const sandbox = { window: {} as Record<string, unknown> };
    vm.runInNewContext(runtimeConfigScript(config), sandbox);
    const previous = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = sandbox.window;
    try {
        // The vm realm has its own Object prototype: compare the plain data.
        assert.deepEqual({ ...getRuntimeConfig() }, config);
        assert.equal(new URL(createAuthUrls(getRuntimeConfig()).login('/')).searchParams.get('rd'),
            'https://counselorbot.labform.net/');
    } finally {
        (globalThis as Record<string, unknown>).window = previous;
    }
});

test('a value cannot close the script tag', () => {
    const script = runtimeConfigScript({ projectId: '</script><script>alert(1)</script>' });
    assert.ok(!script.includes('</script>'));
    const sandbox = { window: {} as Record<string, { projectId?: string }> };
    vm.runInNewContext(script, sandbox);
    assert.equal(sandbox.window.__COUNSELORBOT_CONFIG__.projectId, '</script><script>alert(1)</script>');
});

test('without the script (server render) the upstream defaults apply', () => {
    assert.deepEqual(getRuntimeConfig(), {});
});

test('only the desktop local provider is published, never a typo', () => {
    assert.deepEqual(runtimeConfigFromEnv({ COUNSELORBOT_AUTH_PROVIDER: ' local ' }), { authProvider: 'local' });
    assert.deepEqual(runtimeConfigFromEnv({ COUNSELORBOT_AUTH_PROVIDER: 'ai4auth' }), {});
    assert.deepEqual(runtimeConfigFromEnv({ COUNSELORBOT_AUTH_PROVIDER: 'bogus' }), {});
});

test('the public tunnel origin is read and trimmed from the environment', () => {
    assert.deepEqual(
        runtimeConfigFromEnv({ COUNSELORBOT_PUBLIC_ORIGIN: ' https://counselor-labform.net ' }),
        { publicOrigin: 'https://counselor-labform.net' },
    );
    assert.deepEqual(runtimeConfigFromEnv({ COUNSELORBOT_PUBLIC_ORIGIN: '   ' }), {});
});

test('publicOrigin decides shared links: window absent, tunnel, then browser origin', () => {
    const previous = (globalThis as Record<string, unknown>).window;
    try {
        // Server render (nessuna window): niente origine calcolabile.
        assert.equal(publicOrigin(), '');
        (globalThis as Record<string, unknown>).window = {
            __COUNSELORBOT_CONFIG__: { publicOrigin: 'https://counselor-labform.net/',
                appUrl: 'http://127.0.0.1:9999' } as unknown,
        };
        assert.equal(publicOrigin(), 'https://counselor-labform.net');
        (globalThis as Record<string, unknown>).window = {
            location: { origin: 'http://127.0.0.1:32102' },
        };
        // Senza tunnel (o fuori dal guscio) la condivisione resta sull'origine
        // del browser: comportamento invariato in produzione e portable.
        assert.equal(publicOrigin(), 'http://127.0.0.1:32102');
    } finally {
        (globalThis as Record<string, unknown>).window = previous;
    }
});
