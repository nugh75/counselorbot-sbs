const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('native registry covers every provider and alias consumed by the backend', () => {
  const filename = path.resolve(__dirname, '../../../backend/api_secrets.py');
  const parsed = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c',
    'import ast,json,sys; tree=ast.parse(open(sys.argv[1]).read()); print(json.dumps(next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.AnnAssign) and getattr(n.target,"id",None)=="API_KEY_ENV_MAP")))', filename], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const native = readFileSync(path.resolve(__dirname, '../src-tauri/src/credentials.rs'), 'utf8');
  const registry = Object.fromEntries([...native.matchAll(/Provider\s*\{\s*id:\s*"([^"]+)"[\s\S]*?env:\s*&\[([^\]]+)\]/g)].map((m) => [m[1], m[2]]));
  for (const [provider, aliases] of Object.entries(JSON.parse(parsed.stdout))) {
    assert.ok(registry[provider], provider);
    for (const alias of aliases) assert.ok(registry[provider].includes('"' + alias + '"'), alias);
  }
});

class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.value = ''; this.textContent = ''; this.disabled = false;
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  querySelectorAll(selector) {
    const tags = selector.split(', ');
    return this.children.flatMap((child) => [...(tags.includes(child.tagName) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function panel(failure) {
  const ids = Object.fromEntries(['credentials-card', 'credential-list', 'credentials-notice', 'refresh-credentials', 'apply-credentials'].map((id) => [id, new Element()]));
  ids['credentials-card'].append(ids['credential-list'], ids['refresh-credentials'], ids['apply-credentials']);
  const calls = [];
  let configured = false;
  const listeners = {};
  const context = {
    document: { getElementById: (id) => ids[id], createElement: (tag) => new Element(tag) },
    window: {
      addEventListener: (name, handler) => { listeners[name] = handler; },
      __TAURI__: { core: { invoke: async (command, args) => {
        calls.push({ command, args });
        if (failure?.(command)) throw Error('echo-synthetic-secret');
        if (command === 'credential_status') return [
          { id: 'openai', label: 'OpenAI', configured, testable: true },
          { id: 'opencode', label: 'OpenCode', configured: false, testable: false },
        ];
        if (command === 'save_credential') configured = true;
        if (command === 'remove_credential') configured = false;
        if (command === 'test_credential') return 'accepted';
      } } },
    },
  };
  // Any accidental access to storage or console fails the test.
  vm.runInNewContext(readFileSync(__dirname + '/credentials.js', 'utf8'), context);
  await flush();
  return { ids, calls, listeners, form: () => ids['credential-list'].children[0] };
}

test('masked inputs, configured state, save clears draft, apply requires a change', async () => {
  const p = await panel();
  assert.equal(p.ids['apply-credentials'].disabled, true);
  assert.equal(p.ids['credentials-notice'].textContent, 'Stato del portachiavi aggiornato.');
  assert.equal(p.form().children[1].textContent, 'Mancante');
  const input = p.form().querySelectorAll('input')[0];
  assert.equal(input.type, 'password');
  assert.equal(input.autocomplete, 'off');
  input.value = 'synthetic-key';
  p.form().onsubmit({ preventDefault() {} });
  assert.equal(input.value, '');
  await flush();
  assert.deepEqual(p.calls.find((c) => c.command === 'save_credential').args.provider, 'openai');
  assert.equal(p.form().children[1].textContent, 'Configurata');
  assert.equal(p.ids['apply-credentials'].disabled, false);
  p.ids['apply-credentials'].onclick();
  await flush();
  assert.equal(p.ids['apply-credentials'].disabled, true);
});

test('test draft and stored value without saving or reflecting the credential', async () => {
  const p = await panel();
  const input = p.form().querySelectorAll('input')[0];
  const test = p.form().querySelectorAll('button')[1];
  input.value = 'synthetic-key';
  test.onclick();
  assert.equal(input.value, '');
  await flush();
  assert.equal(p.calls.find((c) => c.command === 'test_credential').args.value, 'synthetic-key');
  assert.ok(p.ids['credentials-notice'].textContent.includes('verificata'));
  assert.equal(p.calls.some((c) => c.command === 'save_credential'), false);
  test.onclick();
  await flush();
  assert.equal(p.calls.filter((c) => c.command === 'test_credential')[1].args.value, null);
  assert.equal(p.ids['credential-list'].children[1].querySelectorAll('button')[1].disabled, true);
});

test('failures clear input and suppress error details; duplicate actions are blocked', async () => {
  const p = await panel((command) => command === 'save_credential');
  const input = p.form().querySelectorAll('input')[0];
  input.value = 'echo-synthetic-secret';
  p.form().onsubmit({ preventDefault() {} });
  p.form().onsubmit({ preventDefault() {} });
  await flush();
  assert.equal(input.value, '');
  assert.equal(p.calls.filter((c) => c.command === 'save_credential').length, 1);
  assert.ok(!p.ids['credentials-notice'].textContent.includes('echo-synthetic-secret'));
  assert.equal(p.ids['apply-credentials'].disabled, true);
});

test('remove and failed restart retain pending state; page exit clears drafts', async () => {
  const p = await panel((command) => command === 'apply_credentials');
  p.form().querySelectorAll('input')[0].value = 'synthetic-key';
  p.form().onsubmit({ preventDefault() {} });
  await flush();
  p.form().querySelectorAll('button')[2].onclick();
  await flush();
  assert.equal(p.form().children[1].textContent, 'Mancante');
  p.ids['apply-credentials'].onclick();
  await flush();
  assert.equal(p.ids['apply-credentials'].disabled, false);
  const input = p.form().querySelectorAll('input')[0];
  input.value = 'unsaved';
  p.listeners.pagehide();
  assert.equal(input.value, '');
});
