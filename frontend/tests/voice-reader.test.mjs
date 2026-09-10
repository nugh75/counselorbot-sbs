import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.VOICE_BASE_URL || 'http://127.0.0.1:3000';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });

async function fixture({ width = 1440, guest = false, live = false, dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ dark, live }) => {
        localStorage.setItem('cb_lang', 'it');
        if (dark) localStorage.setItem('cb_theme', 'dark');
        window.__audios = [];
        if (!live) window.Audio = class {
            src = ''; currentTime = .2; paused = true;
            constructor() { window.__audios.push(this); }
            async play() { this.paused = false; this.onplaying?.(); }
            pause() { this.paused = true; }
            load() {}
            removeAttribute() { this.src = ''; }
        };
        else {
            const Audio = window.Audio;
            window.Audio = function (...args) { const audio = new Audio(...args); window.__audios.push(audio); return audio; };
        }
    }, { dark, live });
    const session = { session_id: 'voice-fixture', status: 'in_progress', counselor_id: 1, language: 'it',
        messages: [{ role: 'assistant', content: 'Possiamo riflettere sul tuo modo di studiare. Quale difficoltà vorresti affrontare?' }], recommendations: [] };
    await page.route('**/api/**', route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() === 'POST') requests.push({ path: url.pathname, body: request.postDataJSON() });
        if (url.pathname.startsWith('/api/tts') && live) return route.fallback();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: !guest, is_admin: false, username: guest ? '' : 'voice-fixture', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, name: 'Counselor 1', language: ['it'], is_active: true, suitable: true }];
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true, latest_session_id: 'voice-fixture' };
        else if (url.pathname.startsWith('/api/orientation/sessions')) data = session;
        else if (url.pathname === '/api/user/learner-profile') data = { id: 1, data: { goal: 'Organizzare lo studio' } };
        else if (url.pathname === '/api/tts/voices') data = { voices: url.searchParams.get('engine') === 'piper'
            ? [{ id: 'it_IT-paola-medium', name: 'Paola', locale: 'it-IT' }, { id: 'it_IT-riccardo-x_low', name: 'Riccardo', locale: 'it-IT' }]
            : [{ id: 'it-IT-IsabellaNeural', name: 'Isabella', locale: 'it-IT' }, { id: 'it-IT-DiegoNeural', name: 'Diego', locale: 'it-IT' }] };
        else if (url.pathname === '/api/tts/stream') {
            const { text, engine } = request.postDataJSON();
            const segments = text.split(/\n\n/).filter(Boolean).slice(0, 3).map((text, index) => ({ text, index, paragraph_id: index }));
            const events = [{ type: 'init', segments }, ...segments.map(s => ({ type: 'chunk', ...s, audio: 'YXVkaW8=',
                words: engine === 'piper' ? [] : [[s.text.split(/\s/)[0], 0, 1]] })), { type: 'done' }];
            return route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') });
        } else if (url.pathname === '/api/session/frozen/voice-fixture') data = { ...session, questionnaire_type: 'QSA', current_phase: 'intro', experience: 'standard', scores: { C1: 7 } };
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro', suggested_questions: [] }] };
        return route.fulfill({ json: data });
    });
    return { page, context, requests, errors };
}

for (const width of [390, 1440]) {
    test(`public page reader, highlighting, controls, voice persistence and focus at ${width}px`, async () => {
        const f = await fixture({ width, guest: true, dark: width === 390 });
        try {
            const { page, requests } = f;
            await page.goto(`${origin}/guide`);
            await page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
            const panel = page.getByRole('dialog', { name: 'Lettore audio' });
            await panel.getByLabel('Voce', { exact: true }).selectOption('it-IT-DiegoNeural');
            await panel.getByRole('button', { name: 'Ascolta pagina' }).click();
            await panel.locator('[data-active-word="true"]').waitFor();
            const body = requests.find(r => r.path === '/api/tts/stream').body;
            assert.equal(body.voice, 'it-IT-DiegoNeural'); assert.equal(body.voice_override, true);
            assert.ok(body.text.length > 1000, 'reads the full static guide');
            assert.ok(!body.text.includes('Prova voce'), 'reader controls are excluded');
            await panel.getByRole('button', { name: 'Pausa', exact: true }).click();
            assert.equal(await page.evaluate(() => window.__audios.at(-1).paused), true);
            await panel.getByRole('button', { name: 'Riprendi', exact: true }).click();
            await panel.getByRole('button', { name: 'Segmento successivo' }).click();
            await panel.getByRole('status').filter({ hasText: 'Segmento 2' }).waitFor();
            await panel.getByRole('button', { name: 'Segmento precedente' }).click();
            await page.screenshot({ path: `/tmp/voice-reader-${width}.png` });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => window.__audios.at(-1).src), '');
            assert.equal(await page.getByRole('button', { name: 'Lettore audio', exact: true }).evaluate(el => el === document.activeElement), true);
            await page.reload();
            await page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
            assert.equal(await panel.getByLabel('Voce', { exact: true }).inputValue(), 'it-IT-DiegoNeural');
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

test('Bussola uses chosen Piper voice and preserves the unsent draft', async () => {
    const f = await fixture({ width: 390 });
    try {
        const { page, requests } = f;
        await page.goto(`${origin}/bussola`);
        await page.getByRole('button', { name: 'Inizia un nuovo orientamento', exact: true }).click();
        await page.locator('#bussola-composer').fill('La mia bozza da conservare');
        await page.getByRole('log').getByRole('button', { name: 'Ascolta', exact: true }).click();
        const panel = page.getByRole('dialog', { name: 'Lettore audio' });
        await panel.getByLabel('Motore').selectOption('piper');
        await panel.getByLabel('Voce', { exact: true }).selectOption('it_IT-riccardo-x_low');
        await panel.getByRole('button', { name: 'Ascolta', exact: true }).click();
        await panel.getByRole('status').filter({ hasText: 'In lettura' }).waitFor();
        const body = requests.filter(r => r.path === '/api/tts/stream').at(-1).body;
        assert.equal(body.engine, 'piper'); assert.equal(body.voice, 'it_IT-riccardo-x_low'); assert.equal(body.counselor_id, 1);
        assert.equal(await panel.locator('[data-active-word="true"]').count(), 0, 'Piper does not invent word timings');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#bussola-composer').inputValue(), 'La mia bozza da conservare');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('guided chat uses the same reader and keeps its composer mounted', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/?frozen=voice-fixture`);
        await f.page.locator('#guided-composer').fill('Una domanda non inviata');
        await f.page.getByRole('button', { name: 'Ascolta', exact: true }).first().click();
        await f.page.getByRole('dialog', { name: 'Lettore audio' }).locator('[data-active-word="true"]').waitFor();
        assert.equal(f.requests.find(r => r.path === '/api/tts/stream').body.counselor_id, 1);
        await f.page.keyboard.press('Escape');
        assert.equal(await f.page.locator('#guided-composer').inputValue(), 'Una domanda non inviata');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('static page extraction excludes drafts, hidden content, chat logs and buttons', async () => {
    const f = await fixture({ guest: true });
    try {
        await f.page.goto(`${origin}/guide`);
        await f.page.locator('main').evaluate(el => {
            el.innerHTML = '<h1>Titolo leggibile</h1><p>Paragrafo <strong>importante</strong>.</p><div hidden>SEGRETO_NASCOSTO</div><div style="display:none">SEGRETO_CSS</div><textarea>BOZZA_PRIVATA</textarea><button>COMANDO</button><div role="log">CONVERSAZIONE</div><p class="sr-only">SOLO_SCREEN_READER</p>';
        });
        await f.page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
        await f.page.getByRole('button', { name: 'Ascolta pagina' }).click();
        await f.page.getByRole('dialog').locator('[data-active-word="true"]').waitFor();
        assert.equal(f.requests.find(r => r.path === '/api/tts/stream').body.text, 'Titolo leggibile\n\nParagrafo importante.');
    } finally { await f.context.close(); }
});

test('imported pronunciation rules can be edited, previewed, disabled and persist', async () => {
    const f = await fixture({ guest: true, width: 390 });
    try {
        const { page } = f;
        await page.goto(`${origin}/guide`);
        await page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
        const panel = page.getByRole('dialog');
        await panel.locator('summary').filter({ hasText: 'Correzione della pronuncia (80)' }).click();
        await panel.getByRole('button', { name: 'Modifica mediano', exact: true }).click();
        assert.equal(await panel.getByLabel('Leggi come', { exact: true }).inputValue(), 'mèdiano');
        await panel.getByLabel('Leggi come', { exact: true }).fill('me diàno');
        await panel.getByRole('button', { name: 'Prova pronuncia', exact: true }).click();
        await panel.getByRole('status').filter({ hasText: 'In lettura' }).waitFor();
        assert.deepEqual(f.requests.filter(r => r.path === '/api/tts/stream').at(-1).body.pronunciations, [], 'an unsaved spelling preview must not reapply old rules');
        await panel.getByRole('button', { name: 'Salva correzione', exact: true }).click();
        await panel.getByLabel('Testo di prova', { exact: true }).fill('Il valore mediano nei domini della ricerca.');
        await panel.getByRole('button', { name: 'Ascolta il testo corretto' }).click();
        await panel.getByRole('status').filter({ hasText: 'In lettura' }).waitFor();
        const request = f.requests.filter(r => r.path === '/api/tts/stream').at(-1).body;
        assert.equal(request.pronunciations.length, 80);
        assert.equal(request.pronunciations.find(r => r.term === 'mediano').spoken, 'me diàno');
        await page.screenshot({ path: '/tmp/voice-pronunciation-mobile.png' });
        await panel.getByLabel('Applica le correzioni', { exact: true }).uncheck();
        await panel.getByRole('button', { name: 'Ascolta il testo corretto' }).click();
        await panel.getByRole('status').filter({ hasText: 'In lettura' }).waitFor();
        assert.deepEqual(f.requests.filter(r => r.path === '/api/tts/stream').at(-1).body.pronunciations, []);
        await page.keyboard.press('Escape');
        await page.reload();
        await page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
        await panel.locator('summary').click();
        assert.equal(await panel.getByLabel('Applica le correzioni', { exact: true }).isChecked(), false);
        await panel.getByRole('button', { name: 'Modifica mediano', exact: true }).click();
        assert.equal(await panel.getByLabel('Leggi come', { exact: true }).inputValue(), 'me diàno');
        await panel.getByRole('button', { name: 'Elimina mediano', exact: true }).click();
        assert.equal(await panel.getByRole('button', { name: 'Modifica mediano', exact: true }).count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('language changes stop audio and load a separate pronunciation dictionary', async () => {
    const f = await fixture({ guest: true });
    try {
        await f.page.goto(`${origin}/guide`);
        await f.page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
        await f.page.getByLabel('Voce', { exact: true }).selectOption('it-IT-DiegoNeural');
        await f.page.getByRole('button', { name: 'Prova voce' }).click();
        await f.page.getByRole('status').filter({ hasText: 'In lettura' }).waitFor();
        await f.page.evaluate(() => { localStorage.setItem('cb_lang', 'en'); window.dispatchEvent(new Event('storage')); });
        await f.page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await f.page.evaluate(() => window.__audios.at(-1).src), '');
        await f.page.getByRole('button', { name: 'Audio reader', exact: true }).click();
        assert.equal(await f.page.getByLabel('Voice', { exact: true }).inputValue(), '');
        await f.page.getByRole('dialog').locator('summary').filter({ hasText: 'Pronunciation corrections (49)' }).waitFor();
        await f.page.getByRole('button', { name: 'Try voice' }).click();
        await f.page.getByRole('status').filter({ hasText: 'Reading' }).waitFor();
        const request = f.requests.filter(r => r.path === '/api/tts/stream').at(-1).body;
        assert.equal(request.language, 'en'); assert.equal(request.pronunciations.length, 49);
        await f.page.evaluate(() => history.pushState({}, '', '/bussola'));
        await f.page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await f.page.evaluate(() => window.__audios.at(-1).src), '');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('live Edge playback highlights actual word timings', { skip: !process.env.VOICE_LIVE }, async () => {
    const f = await fixture({ guest: true, live: true });
    try {
        await f.page.goto(`${origin}/guide`);
        await f.page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
        const panel = f.page.getByRole('dialog');
        await panel.getByRole('button', { name: 'Prova voce' }).click();
        await panel.locator('[data-active-word="true"]').waitFor({ timeout: 45000 });
        assert.ok(await f.page.evaluate(() => window.__audios.at(-1).currentTime > 0));
        await panel.getByRole('status').filter({ hasText: 'Lettura completata' }).waitFor();
        assert.equal(await panel.getByRole('alert').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('live Piper delivers playable WAV through the Next streaming proxy', { skip: !process.env.VOICE_LIVE }, async () => {
    const f = await fixture({ guest: true, live: true });
    try {
        await f.page.goto(`${origin}/guide`);
        await f.page.getByRole('button', { name: 'Lettore audio', exact: true }).click();
        const panel = f.page.getByRole('dialog');
        await panel.getByLabel('Motore').selectOption('piper');
        await panel.getByLabel('Voce', { exact: true }).selectOption('it_IT-paola-medium');
        await panel.getByRole('button', { name: 'Prova voce' }).click();
        await f.page.waitForFunction(() => window.__audios.some(audio => audio.currentTime > .15 && audio.duration > 0), null, { timeout: 45000 });
        assert.equal(await panel.getByRole('alert').count(), 0);
        await panel.getByRole('status').filter({ hasText: 'Lettura completata' }).waitFor();
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
