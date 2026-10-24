'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

function launch(t, { port = 0, hold = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-node-sidecar-'));
    fs.copyFileSync(path.join(__dirname, 'server-wrapper.js'), path.join(dir, 'server-wrapper.js'));
    fs.writeFileSync(path.join(dir, 'server.js'), `
const http = require('node:http');
const server = http.createServer((req, res) => {
    if (${hold}) { res.writeHead(200); res.write('open'); }
    else res.end('ok');
});
server.listen(Number(process.env.PORT), process.env.HOSTNAME, () => {
    console.log('READY ' + JSON.stringify(server.address()));
});
`);
    const child = spawn(process.execPath, [path.join(dir, 'server-wrapper.js'), '--lifeline'], {
        env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' },
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const done = once(child, 'close');
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await done;
        fs.rmSync(dir, { recursive: true });
    });
    async function ready() {
        const deadline = Date.now() + 5000;
        while (!output.includes('READY ')) {
            assert.equal(child.exitCode, null, output);
            assert.ok(Date.now() < deadline, output);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return JSON.parse(output.match(/READY (.+)/)[1]);
    }
    return { child, done, ready, output: () => output };
}

test('loopback HTTP stays alive until lifeline EOF, then exits cleanly', { timeout: 15000 }, async (t) => {
    const proc = launch(t);
    const address = await proc.ready();
    assert.equal(address.address, '127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    assert.equal(await response.text(), 'ok');
    assert.equal(proc.child.exitCode, null);
    proc.child.stdin.end();
    assert.deepEqual(await proc.done, [0, null]);
    assert.match(proc.output(), /stdin chiuso, arresto/);
});

test('occupied port exits four before Next error handlers', { timeout: 10000 }, async (t) => {
    const occupied = http.createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    t.after(() => new Promise((resolve) => occupied.close(resolve)));
    const proc = launch(t, { port: occupied.address().port });
    assert.deepEqual(await proc.done, [4, null]);
    assert.match(proc.output(), /occupata/);
});

test('SIGTERM requests graceful shutdown', { skip: process.platform === 'win32', timeout: 10000 }, async (t) => {
    const proc = launch(t);
    await proc.ready();
    proc.child.kill('SIGTERM');
    assert.deepEqual(await proc.done, [0, null]);
    assert.match(proc.output(), /SIGTERM, arresto/);
});

test('lifeline forces exit within ten seconds for an unfinished response', { timeout: 16000 }, async (t) => {
    const proc = launch(t, { hold: true });
    const address = await proc.ready();
    const request = http.get(`http://127.0.0.1:${address.port}`);
    request.on('error', () => {});
    const [response] = await once(request, 'response');
    response.on('error', () => {});
    t.after(() => request.destroy());
    proc.child.stdin.end();
    assert.deepEqual(await proc.done, [0, null]);
});
