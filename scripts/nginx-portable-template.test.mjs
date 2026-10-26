// Guards for infrastructure/portable/nginx-counselorbot.conf.template (issue #254):
// the portable vhost must bound the auth_request subrequest timeouts and map
// auth failures to a readable, retryable 503 instead of nginx's built-in 500.
// Run with: node --test scripts/nginx-portable-template.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const template = readFileSync(
    new URL('../infrastructure/portable/nginx-counselorbot.conf.template', import.meta.url),
    'utf8',
);

function block(name) {
    const match = template.match(new RegExp(`location ${name} \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(match, `location ${name} must exist in the template`);
    return match[1];
}

test('auth subrequest is internal and has explicit bounded timeouts', () => {
    const verify = block('= /internal/ai4auth/verify');
    assert.match(verify, /internal;/);
    assert.match(verify, /proxy_connect_timeout \d+s;/);
    assert.match(verify, /proxy_send_timeout \d+s;/);
    assert.match(verify, /proxy_read_timeout \d+s;/);
});

test('auth failure maps to a retryable 503 instead of 500', () => {
    const root = block('/');
    assert.match(root, /error_page 500 = @auth_unavailable;/);
    const fallback = block('@auth_unavailable');
    assert.match(fallback, /return 503 /);
    assert.match(fallback, /add_header Retry-After \d+ always;/);
});

test('the 503 fallback cannot loop back into auth_request', () => {
    const fallback = block('@auth_unavailable');
    assert.doesNotMatch(fallback, /auth_request/);
    assert.doesNotMatch(fallback, /proxy_pass/);
});

test('login and portal redirects are preserved', () => {
    const root = block('/');
    assert.match(root, /error_page 401 =302 https:\/\/\{\{AUTH_HOST\}\}\/login/);
    assert.match(root, /error_page 403 =302 https:\/\/\{\{PORTAL_HOST\}\}\//);
});
