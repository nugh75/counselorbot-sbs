// Adapted from TD_daniele be44ce5: codaAudio.ts / streamVoce.ts.
// One controller per provider; no Svelte state or editorial dependencies.
export type ReaderStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'complete' | 'error';
export type ReaderError = 'request' | 'interrupted' | 'playback' | 'segments' | 'empty' | null;
export type WordTiming = { word: string; start: number; end: number; from: number; to: number };
export type Segment = { index: number; paragraph_id: number; text: string; words: WordTiming[]; url?: string; failed?: boolean };
export type ReaderState = { status: ReaderStatus; generating: boolean; segments: Segment[]; current: number; word: number; error: ReaderError };
export type ReaderInput = { text: string; language: string; voice: string; counselor_id?: number | null; voice_override?: boolean; engine: 'edge' | 'piper'; pronunciations?: { term: string; spoken: string }[]; plain_text?: boolean };
const initial = (): ReaderState => ({ status: 'idle', generating: false, segments: [], current: -1, word: -1, error: null });

export function normalizeWords(raw: unknown, text: string): WordTiming[] {
    if (!Array.isArray(raw)) return [];
    let cursor = 0;
    return raw.flatMap(item => {
        const [word, start, end] = Array.isArray(item) ? item : [item?.word, item?.start, item?.end];
        if (typeof word !== 'string' || !word || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return [];
        const from = text.toLocaleLowerCase().indexOf(word.toLocaleLowerCase(), cursor);
        if (from < 0) return []; // Never highlight a guessed token after normalization.
        cursor = from + word.length;
        return [{ word, start, end, from, to: cursor }];
    });
}

export async function readVoiceEvents(response: Response, receive: (event: Record<string, unknown>) => void) {
    if (!response.ok || !response.body) throw new Error('request');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '', done = false;
    try {
        while (!done) {
            const part = await reader.read();
            pending += decoder.decode(part.value, { stream: !part.done }).replace(/\r/g, '');
            let boundary;
            while ((boundary = pending.indexOf('\n\n')) >= 0) {
                const frame = pending.slice(0, boundary);
                pending = pending.slice(boundary + 2);
                const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
                if (!data) continue;
                const event = JSON.parse(data);
                receive(event);
                if (event.type === 'done') { done = true; break; }
            }
            if (part.done) break;
        }
        if (!done) throw new Error('interrupted');
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

export class VoiceReaderController {
    private state = initial();
    private listeners = new Set<() => void>();
    private audio: HTMLAudioElement | null = null;
    private abort: AbortController | null = null;
    private frame: number | null = null;
    private wantsPlay = false;
    private revision = 0;
    private selection = 0;
    private streams = 0;
    private queue: Promise<void> = Promise.resolve();
    private loaded = -1;

    getSnapshot = () => this.state;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private update(patch: Partial<ReaderState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach(listener => listener());
    }
    private cancelFrame() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
    }
    stop = () => {
        this.revision++;
        this.selection++;
        this.abort?.abort();
        this.abort = null;
        this.wantsPlay = false;
        this.cancelFrame();
        if (this.audio) {
            this.audio.onended = this.audio.onplaying = this.audio.onerror = null;
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
        }
        this.audio = null;
        this.loaded = -1;
        this.streams = 0;
        this.queue = Promise.resolve();
        for (const segment of this.state.segments) if (segment.url) URL.revokeObjectURL(segment.url);
        this.state = initial();
        this.listeners.forEach(listener => listener());
    };

    start = async (input: ReaderInput) => {
        this.stop();
        if (!input.text.trim()) { this.update({ status: 'error', error: 'empty' }); return; }
        this.abort = new AbortController();
        this.audio = new Audio();
        this.wantsPlay = true;
        this.audio.onended = () => { this.cancelFrame(); this.advance(); };
        this.audio.onplaying = () => {
            if (!this.wantsPlay) { this.audio?.pause(); return; }
            this.update({ status: 'playing' });
            this.trackWord();
        };
        this.audio.onerror = () => this.fail('playback');
        this.streams = 1;
        this.update({ status: 'buffering', generating: true });
        this.queue = this.run(input, this.revision);
        await this.queue;
    };

    /** Speak text that arrived after playback began, without cutting off what is
     *  already playing: a reply read aloud while the model is still writing it. */
    enqueue = async (input: ReaderInput) => {
        if (!this.audio || this.state.status === 'error') return this.start(input);
        if (!input.text.trim()) return;
        if (this.state.status === 'complete') this.wantsPlay = true;
        this.streams++;
        this.update({ generating: true });
        // Runs are serialized: each one numbers its segments after those already
        // known, so two requests in flight would claim the same indices.
        const revision = this.revision;
        this.queue = this.queue.then(() => this.run(input, revision));
        await this.queue;
    };

    private async run(input: ReaderInput, revision: number) {
        const signal = this.abort?.signal;
        if (!signal || revision !== this.revision) return;
        // Appended segments continue the numbering: indices are what playback follows.
        const offset = this.state.segments.reduce((top, segment) => Math.max(top, segment.index + 1), 0);
        let expected = 0;
        try {
            const response = await fetch('/api/tts/stream', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
            });
            await readVoiceEvents(response, event => {
                if (revision !== this.revision || signal.aborted) return;
                if (event.type === 'init') {
                    const incoming = (event.segments as Segment[]).map(s => ({ ...s, index: s.index + offset, words: [] })).sort((a, b) => a.index - b.index);
                    expected = incoming.length;
                    const segments = [...this.state.segments, ...incoming];
                    this.update({ segments, current: this.state.current === -1 ? (incoming[0]?.index ?? -1) : this.state.current });
                } else if (event.type === 'chunk' || event.type === 'chunk_error') {
                    const index = (event.index as number) + offset;
                    const segment = this.state.segments.find(s => s.index === index);
                    if (!segment || segment.url || segment.failed) return;
                    const failed = event.type === 'chunk_error';
                    let url: string | undefined;
                    if (!failed) {
                        const bytes = Uint8Array.from(atob(event.audio as string), c => c.charCodeAt(0));
                        url = URL.createObjectURL(new Blob([bytes], { type: event.mime === 'audio/wav' ? 'audio/wav' : 'audio/mpeg' }));
                    }
                    this.update({ segments: this.state.segments.map(s => s === segment ? { ...s, url, failed, words: normalizeWords(event.words, s.text) } : s),
                        ...(failed ? { error: 'segments' as const } : {}) });
                    if (this.state.current === segment.index) this.select(segment.index);
                } else if (event.type === 'done') {
                    const mine = this.state.segments.filter(s => s.index >= offset && s.index < offset + expected);
                    if (mine.some(s => !s.url && !s.failed)) throw new Error('interrupted');
                    this.streams = Math.max(0, this.streams - 1);
                    if (this.streams === 0) {
                        this.update({ generating: false });
                        if (this.state.current === -1) this.complete();
                    }
                }
            });
        } catch (error) {
            if (revision !== this.revision || signal.aborted) return;
            this.streams = 0;
            this.fail(error instanceof Error && error.message === 'interrupted' ? 'interrupted' : 'request');
        }
    }

    private fail(error: ReaderError) {
        this.wantsPlay = false;
        this.audio?.pause();
        this.cancelFrame();
        this.update({ status: 'error', error, generating: false });
        this.abort?.abort();
    }
    private complete() {
        this.wantsPlay = false;
        this.update({ status: this.state.segments.some(s => s.url) ? 'complete' : 'error', current: -1, word: -1 });
    }
    private advance() {
        const next = this.state.segments.find(s => s.index > this.state.current && !s.failed);
        if (next) this.select(next.index);
        else if (this.state.generating) this.update({ current: -1, word: -1, status: this.wantsPlay ? 'buffering' : 'paused' });
        else this.complete();
    }
    select = (index: number) => {
        const segment = this.state.segments.find(s => s.index === index);
        if (!segment || !this.audio) return;
        this.selection++;
        this.audio.pause();
        this.cancelFrame();
        this.update({ current: index, word: -1 });
        if (segment.failed) { this.advance(); return; }
        this.loaded = -1;
        if (!segment.url) { this.update({ status: this.wantsPlay ? 'buffering' : 'paused' }); return; }
        this.audio.src = segment.url;
        this.loaded = index;
        if (this.wantsPlay) void this.playAudio();
        else this.update({ status: 'paused' });
    };
    private async playAudio() {
        if (!this.audio) return;
        const revision = this.revision, selection = ++this.selection;
        this.update({ status: 'buffering' });
        try {
            await this.audio.play();
            if (revision === this.revision && selection === this.selection && this.wantsPlay) {
                this.update({ status: 'playing' });
                this.trackWord();
            }
        } catch {
            if (revision !== this.revision || selection !== this.selection) return;
            this.wantsPlay = false;
            this.update({ status: 'paused', error: 'playback' });
        }
    }
    pause = () => {
        this.selection++;
        this.wantsPlay = false;
        this.audio?.pause();
        this.cancelFrame();
        this.update({ status: 'paused' });
    };
    resume = () => {
        this.wantsPlay = true;
        if (this.state.error === 'playback') this.update({ error: null });
        if (this.state.current === -1) {
            const first = this.state.segments.find(s => !s.failed);
            if (first) this.select(first.index);
        } else if (this.loaded === this.state.current) void this.playAudio();
        else this.select(this.state.current);
    };
    previous = () => {
        const previous = this.state.segments.filter(s => s.index < this.state.current && !s.failed).at(-1);
        if (previous) this.select(previous.index);
    };
    next = () => {
        const next = this.state.segments.find(s => s.index > this.state.current && !s.failed);
        if (next) this.select(next.index);
    };
    private trackWord() {
        this.cancelFrame();
        const tick = () => {
            if (!this.audio || !this.wantsPlay || this.state.status !== 'playing') return;
            const words = this.state.segments.find(s => s.index === this.state.current)?.words ?? [];
            const currentTime = this.audio.currentTime;
            const word = words.findIndex(w => currentTime >= w.start && currentTime <= w.end);
            if (word !== this.state.word) this.update({ word });
            this.frame = requestAnimationFrame(tick);
        };
        tick();
    }
}
