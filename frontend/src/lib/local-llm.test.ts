import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseServer, localLlmText, modelsSummary, serverStatusText } from './local-llm.ts';
import type { LocalServer, LocalServerStatus } from './local-llm';
import type { Lang } from './i18n';

const server = (status: LocalServerStatus, config_value = 'http://127.0.0.1:1234/v1'): LocalServer => ({
    id: 'lmstudio', provider: 'llamacpp', config_key: 'llamacpp_url', config_value,
    url: config_value, tried: [config_value], status, models: [],
});

test('a server that answered can be adopted unless already in use or forced by env', () => {
    assert.equal(canUseServer(server('ok'), '', false), true);
    assert.equal(canUseServer(server('auth_required'), 'http://old:8080', false), true);
    assert.equal(canUseServer(server('ok'), ' http://127.0.0.1:1234/v1 ', false), false);
    assert.equal(canUseServer(server('ok'), '', true), false);
    assert.equal(canUseServer(server('unreachable'), '', false), false);
    assert.equal(canUseServer(server('error'), '', false), false);
});

test('status texts carry the HTTP code and every language has them', () => {
    assert.equal(serverStatusText('en', { ...server('error'), http_status: 500 }), 'Server error (500)');
    assert.equal(serverStatusText('it', server('auth_required')), 'Raggiungibile, chiede una chiave');
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv'] as Lang[]) {
        assert.match(localLlmText(lang, 'keyMissing', { variable: 'LLAMACPP_API_KEY' }), /LLAMACPP_API_KEY/);
        assert.ok(localLlmText(lang, 'customLabel'));
    }
});

test('long model lists are shortened', () => {
    assert.equal(modelsSummary(['a', 'b']), 'a, b');
    assert.equal(modelsSummary(['a', 'b', 'c', 'd'], 2), 'a, b +2');
});
