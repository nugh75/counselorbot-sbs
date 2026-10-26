const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function openPanel(tunnelUrl = null) {
  const html = readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const ids = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], {
    style: {}, textContent: '', value: '', disabled: false,
    replaceChildren() {}, appendChild() {},
  }]));
  const calls = [];
  const invoke = async (command) => {
    calls.push(command);
    if (command === 'get_tunnel_settings') return {
      mode: 'named', custom_domain: 'https://future.example.test', has_token: true,
    };
    if (command === 'get_updater_channel') return 'stable';
    if (command === 'shell_status') return {
      phase: 'ready', version: '2.0.0', data_dir: '/synthetic/profile',
      frontend_url: 'http://127.0.0.1:32101', tunnel_url: tunnelUrl,
      tunnel_mode: tunnelUrl ? 'quick' : 'off', sidecars: [],
    };
    throw Error('Unexpected command: ' + command);
  };
  const context = vm.createContext({
    window: { __TAURI__: { core: { invoke } } },
    document: { getElementById: (id) => ids[id], createElement: () => ({}) },
    module: { exports: {} }, console: { warn() {} }, setInterval() {},
  });
  vm.runInContext(readFileSync(path.join(__dirname, 'panel.js'), 'utf8'), context);
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  return { ids, calls };
}

test('a saved domain never replaces the temporary-tunnel flow', async () => {
  const { ids, calls } = await openPanel();
  assert.equal(ids['mode-quick'].checked, true);
  assert.equal(ids['mode-named'].disabled, true);
  assert.equal(ids['named-mode-option'].style.display, 'none');
  assert.equal(ids['named-config-panel'].style.display, 'none');
  assert.equal(ids['start-named-tunnel'].style.display, 'none');
  assert.equal(ids['start-tunnel'].style.display, 'inline-block');
  assert.equal(ids['start-tunnel'].disabled, false);
  assert.ok(!calls.some((command) => command.startsWith('start_') || command.includes('save_')));
});

test('an active Quick Tunnel explains that student invitations come from the class', async () => {
  const url = 'https://synthetic-class.trycloudflare.com';
  const { ids } = await openPanel(url);
  assert.equal(ids['tunnel-url-link'].href, url);
  assert.equal(ids['tunnel-warning'].style.display, 'block');
  assert.match(ids['qr-caption'].textContent, /invito.*classe/);
  assert.equal(ids['named-info'].style.display, 'none');
  assert.equal(ids['start-named-tunnel'].style.display, 'none');
});
