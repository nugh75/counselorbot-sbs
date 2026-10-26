const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync(require.resolve('./startup-error.js'), 'utf8');

async function panel(fail = false) {
  const calls = [];
  const message = { textContent: '' };
  let close;
  const error = 'Profilo SQLite legacy: <script>nessuna esecuzione</script>';
  vm.runInNewContext(script, {
    window: { __TAURI__: { core: { invoke: async (command) => {
      calls.push(command);
      if (fail) throw new Error('IPC non disponibile');
      return error;
    } } } },
    document: { getElementById: (id) => id === 'startup-message' ? message : {
      addEventListener: (event, callback) => { close = callback; },
    } },
  });
  await new Promise(setImmediate);
  return { calls, message, close, error };
}

test('shows the startup error as text and allows quitting without a Shell state', async () => {
  const view = await panel();
  assert.equal(view.message.textContent, view.error);
  await view.close();
  assert.deepEqual(view.calls, ['startup_error', 'quit']);
});

test('shows a useful fallback when the error cannot be read', async () => {
  const view = await panel(true);
  assert.match(view.message.textContent, /Contatta l’assistenza/);
});
