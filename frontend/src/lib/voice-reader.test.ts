import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { VoiceReaderController, normalizeWords, readVoiceEvents } from './voice-reader.ts';

const saved = { fetch: globalThis.fetch, Audio: globalThis.Audio, raf: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame };
class FakeAudio {
    static latest: FakeAudio;
    static blocked = false;
    src = ''; currentTime = 0; plays = 0; paused = true;
    onended: (() => void) | null = null;
    onplaying: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { FakeAudio.latest = this; }
    async play() { this.plays++; if (FakeAudio.blocked) throw new Error('blocked'); this.paused = false; this.onplaying?.(); }
    pause() { this.paused = true; }
    load() {}
    removeAttribute() { this.src = ''; }
}
const input = { text: 'Ciao mondo.', language: 'it', voice: 'it-IT-IsabellaNeural', engine: 'edge' as const };
const segment = (index: number) => ({ index, paragraph_id: index, text: `Parola ${index}.` });
const chunk = (index: number) => ({ type: 'chunk', index, audio: btoa('audio'), words: [['Parola', 0, 1]] });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let player: VoiceReaderController;
function fixture() {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { stream = controller; } }));
    player = new VoiceReaderController();
    const pending = player.start(input);
    return { player, pending, send: (event: object) => stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)), end: () => stream.close() };
}
afterEach(() => {
    player?.stop();
    FakeAudio.blocked = false;
    Object.assign(globalThis, { fetch: saved.fetch, Audio: saved.Audio, requestAnimationFrame: saved.raf, cancelAnimationFrame: saved.cancel });
});

test('word timings preserve canonical accented text and reject invalid or unmatched words', () => {
    assert.deepEqual(normalizeWords([['È', 0, .2], { word: 'così', start: .3, end: .6 }, ['missing', .7, 1], ['È', -1, 2]], 'È così.'), [
        { word: 'È', start: 0, end: .2, from: 0, to: 1 }, { word: 'così', start: .3, end: .6, from: 2, to: 6 },
    ]);
});
test('out-of-order chunks use stable IDs; generation can finish before playback', async () => {
    const f = fixture();
    f.send({ type: 'init', segments: [segment(10), segment(30)] }); f.send(chunk(30)); await tick();
    assert.equal(FakeAudio.latest.plays, 0);
    f.send(chunk(10)); f.send({ type: 'done' }); await f.pending;
    assert.equal(f.player.getSnapshot().current, 10);
    assert.equal(f.player.getSnapshot().status, 'playing');
    assert.equal(f.player.getSnapshot().generating, false);
    FakeAudio.latest.onended?.(); await tick();
    assert.equal(f.player.getSnapshot().current, 30);
    FakeAudio.latest.onended?.();
    assert.equal(f.player.getSnapshot().status, 'complete');
});
test('pause while waiting survives chunk arrival and resumes explicitly', async () => {
    const f = fixture(); f.send({ type: 'init', segments: [segment(0)] }); await tick();
    f.player.pause(); f.send(chunk(0)); f.send({ type: 'done' }); await f.pending;
    assert.equal(FakeAudio.latest.plays, 0);
    assert.equal(f.player.getSnapshot().status, 'paused');
    f.player.resume(); await tick(); assert.equal(f.player.getSnapshot().status, 'playing');
});
test('failed first segment is reported and skipped without losing a later segment', async () => {
    const f = fixture(); f.send({ type: 'init', segments: [segment(2), segment(8)] });
    f.send({ type: 'chunk_error', index: 2 }); f.send(chunk(8)); f.send({ type: 'done' }); await f.pending;
    assert.equal(f.player.getSnapshot().current, 8);
    assert.equal(f.player.getSnapshot().error, 'segments');
});
test('next segment waits for generation, previous navigation keeps paused state', async () => {
    const f = fixture(); f.send({ type: 'init', segments: [segment(0), segment(1)] }); f.send(chunk(0)); await tick();
    FakeAudio.latest.onended?.(); assert.equal(f.player.getSnapshot().status, 'buffering');
    f.send(chunk(1)); await tick(); assert.equal(f.player.getSnapshot().status, 'playing');
    f.player.pause(); f.player.previous(); assert.equal(f.player.getSnapshot().current, 0);
    assert.equal(f.player.getSnapshot().status, 'paused');
    f.send({ type: 'done' }); await f.pending;
});
test('rejected play is paused and can be retried, never falsely playing', async () => {
    FakeAudio.blocked = true;
    const f = fixture(); f.send({ type: 'init', segments: [segment(0)] }); f.send(chunk(0)); f.send({ type: 'done' }); await f.pending;
    assert.equal(f.player.getSnapshot().status, 'paused');
    assert.equal(f.player.getSnapshot().error, 'playback');
    FakeAudio.blocked = false; f.player.resume(); await tick();
    assert.equal(f.player.getSnapshot().status, 'playing');
});
test('premature EOF stops playback and reports interruption', async () => {
    const f = fixture(); f.send({ type: 'init', segments: [segment(0), segment(1)] }); f.send(chunk(0)); await tick(); f.end(); await f.pending;
    assert.equal(f.player.getSnapshot().status, 'error');
    assert.equal(f.player.getSnapshot().error, 'interrupted');
    assert.equal(FakeAudio.latest.paused, true);
});
test('stop cancels the request, revokes audio, and ignores late events', async () => {
    const revoked: string[] = [], revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
    try {
        const f = fixture(); f.send({ type: 'init', segments: [segment(0), segment(1)] }); f.send(chunk(0)); await tick();
        const audio = FakeAudio.latest; f.player.stop(); f.send(chunk(1)); f.send({ type: 'done' }); await f.pending;
        assert.equal(audio.paused, true); assert.equal(audio.src, ''); assert.equal(revoked.length, 1);
        assert.equal(f.player.getSnapshot().status, 'idle'); assert.equal(f.player.getSnapshot().segments.length, 0);
    } finally { URL.revokeObjectURL = revoke; }
});
test('SSE supports fragmented UTF-8 and CRLF; incomplete done is an interruption', async () => {
    const bytes = new TextEncoder().encode('data: {"type":"init","text":"città"}\r\n\r\ndata: {"type":"done"}\r\n\r\n');
    const events: Record<string, unknown>[] = [];
    await readVoiceEvents(new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } })), e => events.push(e));
    assert.equal(events[0].text, 'città'); assert.equal(events.length, 2);
    const f = fixture(); f.send({ type: 'init', segments: [segment(0)] }); f.send({ type: 'done' }); await f.pending;
    assert.equal(f.player.getSnapshot().error, 'interrupted');
});
