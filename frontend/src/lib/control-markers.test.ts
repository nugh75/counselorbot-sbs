import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONTROL_MARKERS, extractControlSignals, stripControlMarkers, stripControlMarkersForDisplay } from './control-markers.ts';
import { streamChat } from './chat-stream.ts';

const event = (data: object) => `data: ${JSON.stringify(data)}\n\n`;

test('the registry is the same one the backend filters', () => {
    const backend = readFileSync(new URL('../../../backend/control_markers.py', import.meta.url), 'utf8');
    const match = backend.match(/CONTROL_MARKERS: tuple\[str, \.\.\.\] = \(([^)]*)\)/);
    assert.ok(match, 'backend registry not found');
    assert.deepEqual([...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]), [...CONTROL_MARKERS]);
});

test('signals leave the visible text, in any spelling the model uses', () => {
    assert.deepEqual(extractControlSignals('Testo.\n\n[[AVANZA_STEP]]'), { visible: 'Testo.', signals: ['AVANZA_STEP'] });
    assert.deepEqual(extractControlSignals('[[AVANZA_STEP]]'), { visible: '', signals: ['AVANZA_STEP'] });
    assert.equal(stripControlMarkers('Escaped [[AVANZA\\_STEP]]'), 'Escaped');
    assert.equal(stripControlMarkers('Prima [[ avanza_step ]] dopo'), 'Prima  dopo');
    assert.equal(stripControlMarkers('Un [[Wiki]] resta'), 'Un [[Wiki]] resta');
    for (const partial of ['Testo [', 'Testo [[', 'Testo [[AVAN', 'Testo [[AVANZA_STEP]']) {
        assert.equal(stripControlMarkersForDisplay(partial), 'Testo');
    }
});

test('streamChat never hands a signal to a chat, and reports it apart', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(
        event({ display: 'Bozza [[AVAN' }) + event({ delta: 'ZA_STEP]]' })
        + event({ done: true, response: 'Bozza\n\n[[AVANZA_STEP]]', session_id: 's1' }),
    ));
    const updates: string[] = [];
    const result = await streamChat({}, (text: string) => updates.push(text));
    assert.ok(updates.every((text) => !/AVANZA|\[\[/.test(text)), updates.join('|'));
    assert.equal(result.response, 'Bozza');
    assert.deepEqual(result.control_signals, ['AVANZA_STEP']);
});

test('signals sent by the server apart from the text are kept', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(
        event({ display: '' }) + event({ done: true, response: '', control_signals: ['AVANZA_STEP', 'UNKNOWN_SIGNAL'] }),
    ));
    const result = await streamChat({}, () => {});
    assert.equal(result.response, '');
    assert.deepEqual(result.control_signals, ['AVANZA_STEP']);
});

// Guardia: ogni chat legge lo stream da streamChat, quindi eredita il filtro.
// Un nuovo lettore SSE di chat fuori da qui salterebbe il filtro.
test('no component reads a chat stream without streamChat', () => {
    const root = new URL('..', import.meta.url).pathname;
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) files.push(path);
        }
    };
    walk(root);
    const readers = files.filter((file) => readFileSync(file, 'utf8').includes('getReader()'));
    const allowed = ['lib/chat-stream.ts', 'lib/voice-reader.ts'];
    assert.deepEqual(readers.map((file) => file.slice(root.length)).sort(), allowed);
});
