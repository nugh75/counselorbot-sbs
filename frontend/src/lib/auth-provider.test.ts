import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { loginHref, logoutHref } from './auth.ts';

// La configurazione pubblica arriva da /runtime-config.js prima dell'idratazione.
function withRuntimeConfig(config: Record<string, unknown>, run: () => void) {
    const previous = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
        __COUNSELORBOT_CONFIG__: config,
        location: { origin: 'https://counselorbot-sbs.ai4educ.org' },
    };
    try {
        run();
    } finally {
        (globalThis as Record<string, unknown>).window = previous;
    }
}

test('the desktop local provider never sends sign-in or sign-out to ai4auth', () => {
    withRuntimeConfig({ authProvider: 'local' }, () => {
        assert.equal(loginHref('/docente'), '/login');
        assert.equal(logoutHref(), '/logout');
    });
});

test('without the local provider the ai4auth flow is unchanged', () => {
    withRuntimeConfig({}, () => {
        const login = new URL(loginHref('/docente'));
        assert.equal(login.origin, 'https://auth.ai4educ.org');
        assert.equal(login.pathname, '/login');
        assert.equal(login.searchParams.get('rd'), 'https://counselorbot-sbs.ai4educ.org/docente');
        assert.equal(logoutHref(), 'https://auth.ai4educ.org/logout');
    });
});
