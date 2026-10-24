import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/offline.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/sw-offline.js', import.meta.url), 'utf8');

function load() {
  const sandbox = {};
  vm.runInNewContext(script, sandbox);
  return sandbox.CounselorbotOffline;
}

function fakeDocument() {
  const nodes = { state: { textContent: '' }, retry: { click: null, addEventListener(_, fn) { this.click = fn; } } };
  return { nodes, getElementById: (id) => nodes[id] };
}

test('la pagina spiega in italiano che il docente è offline e offre «Riprova»', () => {
  assert.match(html, /La lezione non è ancora iniziata o il docente è momentaneamente offline\./);
  assert.match(html, /<button id="retry"[^>]*>Riprova<\/button>/);
  assert.match(html, /role="status"/);
});

test('il controllo automatico è ogni 10 secondi', () => {
  const { start, INTERVAL_MS } = load();
  assert.equal(INTERVAL_MS, 10000);
  let interval;
  start(fakeDocument(), async () => ({ status: 502 }), () => {}, (_, ms) => { interval = ms; });
  assert.equal(interval, 10000);
});

test('502 o rete assente restano sulla pagina, 200 ricarica', async () => {
  const { start } = load();
  for (const [fetchFn, expected] of [
    [async () => ({ status: 502 }), false],
    [async () => { throw new TypeError('network'); }, false],
    [async () => ({ status: 200 }), true],
  ]) {
    let reloads = 0;
    const doc = fakeDocument();
    const attempt = start(doc, fetchFn, () => { reloads += 1; }, () => {});
    assert.equal(await attempt(), expected);
    assert.equal(reloads, expected ? 1 : 0);
  }
});

test('«Riprova» esegue subito un controllo', async () => {
  const { start } = load();
  let calls = 0;
  const doc = fakeDocument();
  start(doc, async () => { calls += 1; return { status: 503 }; }, () => {}, () => {});
  await doc.nodes.retry.click();
  assert.equal(calls, 1);
  assert.match(doc.nodes.state.textContent, /10 secondi/);
});

test('il service worker ripiega su /offline.html per 502-504 e 530', () => {
  assert.match(worker, /'\/offline\.html'/);
  assert.match(worker, /response\.status >= 502 && response\.status <= 504\) \|\| response\.status === 530/);
  assert.match(worker, /request\.mode !== 'navigate'/);
});
