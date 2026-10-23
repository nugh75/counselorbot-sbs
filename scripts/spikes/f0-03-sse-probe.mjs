#!/usr/bin/env node
// F0-03 spike: SSE and concurrency probe for Cloudflare tunnels (docs/architecture/spikes/f0-03-tunnel-sse.md).
// Server: node f0-03-sse-probe.mjs server [port]       (binds 127.0.0.1 only)
// Client: node f0-03-sse-probe.mjs <test> <base-url> [options as key=value]
import http from 'node:http';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sseHeaders = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
};

function serve(port) {
    let open = 0;
    let peak = 0;
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://local');
        const q = (name, fallback) => Number(url.searchParams.get(name) ?? fallback);
        let closed = false;
        res.on('close', () => { closed = true; });
        open += 1;
        peak = Math.max(peak, open);
        try {
            if (req.method === 'POST') for await (const _ of req) { /* drain body like the chat proxy */ }
            if (url.pathname === '/stream') {
                // Chat-like token stream: n events every interval ms.
                // type=ndjson checks whether buffering depends on the content type.
                res.writeHead(200, url.searchParams.get('type') === 'ndjson' ? { ...sseHeaders, 'Content-Type': 'application/x-ndjson' } : sseHeaders);
                for (let i = 0; i < q('n', 40) && !closed; i += 1) {
                    res.write(`data: ${JSON.stringify({ i, t: Date.now() })}\n\n`);
                    await sleep(q('interval', 100));
                }
                res.end('data: [DONE]\n\n');
            } else if (url.pathname === '/delay-headers') {
                // Slow model: no response headers for s seconds.
                await sleep(q('s', 110) * 1000);
                res.writeHead(200, sseHeaders);
                res.end(`data: ${JSON.stringify({ late: true, t: Date.now() })}\n\ndata: [DONE]\n\n`);
            } else if (url.pathname === '/silent') {
                // Headers and one event, then silence for s seconds (optional comment heartbeat every hb seconds).
                res.writeHead(200, sseHeaders);
                res.write(`data: ${JSON.stringify({ first: true, t: Date.now() })}\n\n`);
                const end = Date.now() + q('s', 120) * 1000;
                const hb = q('hb', 0) * 1000;
                while (Date.now() < end && !closed) {
                    await sleep(hb ? Math.min(hb, end - Date.now()) : end - Date.now());
                    if (hb && Date.now() < end && !closed) res.write(': ping\n\n');
                }
                res.end(`data: ${JSON.stringify({ last: true, t: Date.now() })}\n\ndata: [DONE]\n\n`);
            } else if (url.pathname === '/hold') {
                // Plain request held ms milliseconds: used to fill concurrent slots.
                await sleep(q('ms', 3000));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ peak, open }));
            } else if (url.pathname === '/stats') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ peak, open }));
                peak = open;
            } else {
                res.writeHead(404).end();
            }
        } finally {
            open -= 1;
        }
    });
    server.headersTimeout = 0;
    server.requestTimeout = 0;
    server.listen(port, '127.0.0.1', () => console.log(`probe server on http://127.0.0.1:${port}`));
}

// Reads an SSE response and reports when each event arrived, to tell real streaming from buffering.
async function readStream(base, path, method) {
    const start = Date.now();
    const out = { path, method };
    try {
        const res = await fetch(`${base}${path}`, {
            method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
            body: method === 'POST' ? '{"message":"probe"}' : undefined,
        });
        out.status = res.status;
        out.headersMs = Date.now() - start;
        out.contentType = res.headers.get('content-type');
        out.cfRay = res.headers.get('cf-ray');
        const events = [];
        const comments = [];
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of res.body) {
            buffer += decoder.decode(chunk, { stream: true });
            let cut;
            while ((cut = buffer.indexOf('\n\n')) >= 0) {
                const block = buffer.slice(0, cut);
                buffer = buffer.slice(cut + 2);
                (block.startsWith(':') ? comments : events).push(Date.now() - start);
            }
        }
        out.events = events.length;
        out.comments = comments.length;
        out.firstEventMs = events[0];
        out.lastEventMs = events.at(-1);
        // Spread between first and last event: ~0 means the body was buffered and delivered at once.
        out.spreadMs = events.length > 1 ? events.at(-1) - events[0] : 0;
        if (status(out.status) && out.contentType?.includes('event-stream') === false) out.note = 'not an event stream';
    } catch (error) {
        out.error = String(error.cause?.code ?? error.message);
    }
    out.totalMs = Date.now() - start;
    return out;
}
const status = (code) => code >= 200 && code < 300;

async function burst(base, count, holdMs) {
    const start = Date.now();
    const results = await Promise.all(Array.from({ length: count }, async () => {
        try {
            const res = await fetch(`${base}/hold?ms=${holdMs}`);
            await res.arrayBuffer();
            return res.status;
        } catch (error) {
            return String(error.cause?.code ?? error.message);
        }
    }));
    const tally = {};
    for (const r of results) tally[r] = (tally[r] ?? 0) + 1;
    const stats = await fetch(`${base}/stats`).then((r) => r.json()).catch(() => null);
    return { count, holdMs, tally, originPeakConcurrent: stats?.peak, wallMs: Date.now() - start };
}

const [mode, base, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map((kv) => kv.split('=')));
if (mode === 'server') serve(Number(base ?? 8790));
else if (mode === 'stream') console.log(JSON.stringify(await readStream(base, `/stream?n=${opts.n ?? 40}&interval=${opts.interval ?? 100}`, opts.method ?? 'POST')));
else if (mode === 'delay') console.log(JSON.stringify(await readStream(base, `/delay-headers?s=${opts.s ?? 110}`, opts.method ?? 'POST')));
else if (mode === 'silent') console.log(JSON.stringify(await readStream(base, `/silent?s=${opts.s ?? 120}&hb=${opts.hb ?? 0}`, opts.method ?? 'POST')));
else if (mode === 'burst') console.log(JSON.stringify(await burst(base, Number(opts.count ?? 100), Number(opts.hold ?? 3000))));
else {
    console.error('usage: server [port] | stream|delay|silent|burst <base-url> [key=value...]');
    process.exit(2);
}
