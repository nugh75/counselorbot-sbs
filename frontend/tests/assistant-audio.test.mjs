import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Audio nell'Assistente (#655): stessa dettatura, conversazione a voce e
// lettura delle risposte di chat guidata e Bussola. Microfono, MediaRecorder,
// Audio, trascrizione, TTS e risposta del modello sono finti: nessun backend.
const origin = process.env.ASSISTANT_AUDIO_BASE_URL || 'http://127.0.0.1:3173';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); });
after(async () => { await browser?.close(); });
const event = data => `data: ${JSON.stringify(data)}\n\n`;
const DELTAS = ['Cominciamo dal tempo che dedichi allo studio ogni giorno della settimana. ', 'Poi guardiamo le pause. ', 'Che cosa ti pesa di più?'];
const REPLY = DELTAS.join('');

async function fixture(width) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(120000);
    const control = { posts: [], errors: [] };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('counselorbot_selected_counselor', '1');
        window.__tracks = [];
        window.Audio = class {
            src = ''; currentTime = 0; paused = true;
            async play() { this.paused = false; this.onplaying?.(); }
            pause() { this.paused = true; }
            load() {}
            removeAttribute() { this.src = ''; }
        };
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
            const track = { stopped: false, stop() { this.stopped = true; } };
            window.__tracks.push(track);
            return { getTracks: () => [track] };
        } });
        window.MediaRecorder = class {
            state = 'inactive'; mimeType = 'audio/webm';
            static isTypeSupported() { return true; }
            start() { this.state = 'recording'; }
            stop() {
                this.state = 'inactive';
                queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.(); });
            }
        };
    });
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(origin).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        if (url.pathname === '/api/audio/transcribe') return route.fulfill({ json: { text: 'Come organizzo lo studio?', language: 'it' } });
        if (request.method() === 'POST') control.posts.push({ path: url.pathname, body: request.postDataJSON() });
        if (url.pathname === '/api/tts/stream') return route.fulfill({ contentType: 'text/event-stream', body: [
            { type: 'init', segments: [{ index: 0, paragraph_id: 0, text: request.postDataJSON().text }] },
            { type: 'chunk', index: 0, audio: Buffer.from('audio').toString('base64'), mime: 'audio/wav', words: [] },
            { type: 'done' },
        ].map(event).join('') });
        if (url.pathname === '/api/site-chat/stream') return route.fulfill({ contentType: 'text/event-stream',
            body: event({ session_id: 's', conversation_id: 'c' }) + DELTAS.map(delta => event({ delta })).join('') + event({ done: true, response: REPLY }) });
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'audio-fixture', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true, is_active: true }];
        return route.fulfill({ json: data });
    });
    await page.goto(`${origin}/assistente`);
    const composer = page.locator('#assistente-composer');
    await composer.waitFor({ timeout: 120000 });
    const sent = () => control.posts.filter(p => p.path === '/api/site-chat/stream');
    const spoken = () => control.posts.filter(p => p.path === '/api/tts/stream');
    return { page, context, control, composer, sent, spoken };
}

for (const width of [390, 1440]) {
    test(`Assistente dictates into the draft and reads a finished reply at ${width}px`, async () => {
        const f = await fixture(width);
        try {
            await f.composer.fill('Bozza');
            await f.page.getByRole('button', { name: 'Inserisci audio', exact: true }).click();
            const menu = f.page.getByRole('group', { name: 'Inserisci audio', exact: true });
            await menu.getByRole('button', { name: 'Registra dal microfono' }).click();
            await menu.getByRole('button', { name: 'Ferma e trascrivi' }).click();
            await f.page.waitForFunction(() => document.querySelector('#assistente-composer').value === 'Bozza\nCome organizzo lo studio?');
            assert.equal(f.sent().length, 0, 'dictation never sends on its own');
            assert.equal(await f.page.evaluate(() => window.__tracks.every(t => t.stopped)), true, 'microphone released');

            await f.page.getByRole('button', { name: 'Invia', exact: true }).click();
            const log = f.page.getByRole('log');
            await log.getByText('Che cosa ti pesa di più?').waitFor();
            await log.getByRole('button', { name: 'Ascolta', exact: true }).click();
            const panel = f.page.getByRole('complementary', { name: 'Lettore audio' });
            await panel.getByRole('status').filter({ hasText: 'In lettura' }).waitFor();
            assert.equal(f.spoken().at(-1).body.counselor_id, 1);
            assert.equal(f.sent().length, 1);
            assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal page scroll');
            assert.deepEqual(f.control.errors, []);
        } finally { await f.context.close(); }
    });

    test(`Assistente voice conversation sends once and speaks the streamed reply at ${width}px`, async () => {
        const f = await fixture(width);
        try {
            await f.page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
            await f.page.getByRole('button', { name: 'Conversazione vocale', exact: true }).click();
            const voice = f.page.getByRole('group', { name: 'Conversazione vocale', exact: true });
            await voice.getByRole('button', { name: 'Premi per parlare' }).click();
            await voice.getByRole('button', { name: 'Ferma e invia' }).click();
            await f.page.getByRole('log').getByText('Che cosa ti pesa di più?').waitFor();
            for (let i = 0; i < 50 && f.spoken().map(r => r.body.text).join('') !== REPLY; i++) await f.page.waitForTimeout(100);
            assert.equal(f.sent().length, 1);
            assert.equal(f.sent()[0].body.message, 'Come organizzo lo studio?');
            assert.equal(f.spoken().map(r => r.body.text).join(''), REPLY, 'every word is spoken once, in order');
            assert.equal(await f.composer.isHidden(), true, 'the talk button replaces the composer');
            assert.deepEqual(f.control.errors, []);
        } finally { await f.context.close(); }
    });
}
