import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.AUDIO_INPUT_BASE_URL || 'http://127.0.0.1:3108';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, args: process.env.AUDIO_INPUT_LIVE ? [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=/tmp/audio-input-it.wav',
] : [] }); });
after(async () => { await browser.close(); });
const audioFile = { name: 'example.wav', mimeType: 'audio/wav', buffer: Buffer.from('audio fixture') };

async function fixture({ bussola = false, width = 390, lang = 'it', live = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const control = { requests: [], uploads: [], errors: [], text: 'Vorrei studiare meglio.', status: 200, wait: null };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(({ lang, dark, live }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
        if (live) return;
        window.__tracks = [];
        window.__denyMicrophone = false;
        window.__recordings = [];
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
            if (window.__denyMicrophone) throw new DOMException('Denied', 'NotAllowedError');
            if (window.__waitPermission) await new Promise(resolve => { window.__grantPermission = resolve; });
            const track = { stopped: false, stop() { this.stopped = true; } };
            window.__tracks.push(track);
            return { getTracks: () => [track] };
        } });
        window.MediaRecorder = class {
            state = 'inactive'; mimeType = 'audio/webm';
            static isTypeSupported() { return true; }
            constructor() { window.__recordings.push(this); }
            start() { this.state = 'recording'; }
            stop() {
                this.state = 'inactive';
                queueMicrotask(() => { this.ondataavailable?.({data: new Blob(['recorded audio'], {type:this.mimeType})}); this.onstop?.(); });
            }
        };
    }, { lang, dark: width < 1024, live });
    const session = { session_id: 'audio-fixture', status: 'in_progress', counselor_id: 1, language: lang,
        messages: [{ role: 'assistant', content: 'Da dove vuoi cominciare?' }], recommendations: [] };
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (path === '/api/audio/transcribe') {
            control.uploads.push(request.postDataBuffer().toString());
            if (live) {
                const response = await route.fetch({url:'http://127.0.0.1:3111/transcribe'});
                console.log('Local transcription:', response.status(), await response.json());
                return route.fulfill({response});
            }
            if (control.wait) await control.wait;
            return route.fulfill({ status: control.status, json: control.status === 200 ? {text: control.text, language: lang} : {detail:'busy'} });
        }
        if (request.method() === 'POST') control.requests.push({path, body: request.postDataJSON()});
        let data = [];
        if (path === '/api/auth/me') data = {authenticated:true, is_admin:false, username:'audio-fixture', groups:['studenti']};
        else if (path === '/api/user/account-preferences') data = {counselor_id:1, counselor_ready:true, notebook_ready:true, setup_completed:true};
        else if (path === '/api/counselors') data = [{id:1,name:'Counselor',language:['it','en'],is_active:true,suitable:true}];
        else if (path === '/api/orientation/status') data = {required:false,completed:true,latest_session_id:'audio-fixture'};
        else if (path.startsWith('/api/orientation/sessions')) {
            if (path.endsWith('/message')) session.messages.push({role:'user',content:request.postDataJSON().message}, {role:'assistant',content:'Proseguiamo.'});
            data=session;
        } else if (path === '/api/session/frozen/audio-fixture') data = {...session,questionnaire_type:'QSA',current_phase:'intro',experience:'standard',scores:{C1:7}};
        else if (path === '/api/qsa/guided-ui-texts') data = {guided_steps:[{id:'intro',label:'Introduzione',sort_order:1,system_prompt_mode:'qsa-intro',suggested_questions:[]}]};
        else if (path === '/api/chat/stream') return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({done:true,response:'Proseguiamo.',session_id:'audio-fixture'})+'\n\n'});
        return route.fulfill({json:data});
    });
    async function open() {
        await page.goto(`${origin}/${bussola ? 'bussola' : '?frozen=audio-fixture'}`);
        if (bussola) await page.getByRole('button', {name:lang === 'it' ? 'Inizia un nuovo orientamento' : 'Start a new orientation',exact:true}).click();
        await page.locator(bussola ? '#bussola-composer' : '#guided-composer').waitFor();
    }
    await open();
    const composer = page.locator(bussola ? '#bussola-composer' : '#guided-composer');
    const sent = () => control.requests.filter(r => (r.path === '/api/chat/stream' || r.path.endsWith('/message')) && r.body.message?.trim());
    const menu = page.getByRole('group', {name:lang === 'it' ? 'Inserisci audio' : 'Add audio',exact:true});
    async function audio() {
        await page.getByRole('button', {name:lang === 'it' ? 'Inserisci audio' : 'Add audio',exact:true}).click();
        await menu.waitFor();
    }
    async function automatic(enabled) {
        await page.getByRole('button', {name:lang === 'it' ? 'Opzioni della conversazione' : 'Conversation options',exact:true}).click();
        const option = page.getByRole('checkbox', {name:lang === 'it' ? /Invia subito dopo/ : /Send immediately/});
        await option.setChecked(enabled);
        await page.keyboard.press('Escape');
    }
    return { page, context, composer, control, sent, menu, audio, automatic, open };
}

for (const bussola of [false, true]) {
    test(`${bussola ? 'Bussola' : 'guided chat'} reviews microphone and file input before sending`, async () => {
        const f = await fixture({bussola});
        try {
            await f.composer.fill('Bozza esistente');
            await f.audio();
            await f.menu.getByRole('button', {name:'Registra dal microfono'}).click();
            await f.menu.getByRole('status').filter({hasText:'Registrazione:'}).waitFor();
            await f.menu.getByRole('button', {name:'Ferma e trascrivi'}).click();
            await f.page.waitForFunction(id => document.querySelector(id).value.includes('Vorrei studiare meglio.'), bussola ? '#bussola-composer' : '#guided-composer');
            assert.equal(await f.composer.inputValue(), 'Bozza esistente\nVorrei studiare meglio.');
            assert.equal(f.sent().length, 0);
            assert.equal(await f.page.evaluate(() => window.__tracks.every(t => t.stopped)), true);
            await f.audio();
            await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
            await f.page.waitForFunction(id => document.querySelector(id).value.split('Vorrei studiare meglio.').length === 3, bussola ? '#bussola-composer' : '#guided-composer');
            assert.equal(f.sent().length, 0);
            assert.equal(f.control.uploads.length, 2);
            assert.match(f.control.uploads[0], /name="language"\r\n\r\nit/);
            assert.deepEqual(f.control.errors, []);
        } finally { await f.context.close(); }
    });

    test(`${bussola ? 'Bussola' : 'guided chat'} remembers immediate sending and sends each audio once`, async () => {
        const f = await fixture({bussola,width:1440});
        try {
            await f.automatic(true);
            await f.open();
            await f.composer.fill('Premessa');
            await f.audio();
            await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
            await f.page.getByRole('log').getByText('Premessa\nVorrei studiare meglio.', {exact:true}).waitFor();
            assert.equal(f.sent().length, 1);
            assert.equal(f.sent()[0].body.message, 'Premessa\nVorrei studiare meglio.');
            assert.equal(await f.composer.inputValue(), '');
            await f.audio();
            await f.menu.getByRole('button', {name:'Registra dal microfono'}).click();
            await f.menu.getByRole('button', {name:'Ferma e trascrivi'}).click();
            await f.page.waitForResponse(r => r.url().includes(bussola ? '/message' : '/chat/stream'));
            assert.equal(f.sent().length, 2);
            await f.automatic(false);
            await f.audio();
            await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
            await f.page.waitForFunction(id => document.querySelector(id).value === 'Vorrei studiare meglio.', bussola ? '#bussola-composer' : '#guided-composer');
            assert.equal(f.sent().length, 2);
            assert.deepEqual(f.control.errors, []);
        } finally { await f.context.close(); }
    });
}

test('cancellation releases the microphone, discards pending permission and leaves the draft intact', async () => {
    const f = await fixture();
    try {
        await f.composer.fill('Da conservare');
        await f.audio();
        await f.menu.getByRole('button', {name:'Registra dal microfono'}).click();
        await f.menu.getByRole('button', {name:'Ferma e trascrivi'}).waitFor();
        await f.page.keyboard.press('Escape');
        await f.page.waitForFunction(() => window.__tracks.every(t => t.stopped));
        assert.equal(f.control.uploads.length, 0);
        await f.page.evaluate(() => { window.__waitPermission = true; });
        await f.audio();
        await f.menu.getByRole('button', {name:'Registra dal microfono'}).click();
        await f.menu.getByRole('status').filter({hasText:'In attesa'}).waitFor();
        await f.menu.getByRole('button', {name:'Annulla'}).click();
        await f.page.evaluate(() => window.__grantPermission());
        await f.page.waitForFunction(() => window.__tracks.length === 2 && window.__tracks.every(t => t.stopped));
        assert.equal(await f.composer.inputValue(), 'Da conservare');
        assert.equal(f.control.uploads.length, 0);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('permission denial still allows file upload, transient errors retry without losing draft edits', async () => {
    const f = await fixture();
    try {
        await f.page.evaluate(() => { window.__denyMicrophone = true; });
        await f.audio();
        await f.menu.getByRole('button', {name:'Registra dal microfono'}).click();
        await f.menu.getByRole('alert').filter({hasText:'Consenti'}).waitFor();
        f.control.status = 503;
        await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
        await f.menu.getByRole('button', {name:'Riprova la trascrizione'}).waitFor();
        f.control.status = 200;
        let release;
        f.control.wait = new Promise(resolve => { release = resolve; });
        await f.menu.getByRole('button', {name:'Riprova la trascrizione'}).click();
        await f.menu.getByRole('status').filter({hasText:'Trascrizione'}).waitFor();
        await f.composer.evaluate(el => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, 'Aggiunta mentre aspettavo e altri dettagli'); el.dispatchEvent(new Event('input',{bubbles:true})); });
        release();
        await f.page.waitForFunction(() => document.querySelector('#guided-composer').value.includes('Vorrei studiare meglio.'));
        assert.equal(await f.composer.inputValue(), 'Aggiunta mentre aspettavo e altri dettagli\nVorrei studiare meglio.');
        assert.equal(f.sent().length, 0);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('empty speech never auto-sends and overlong text is retained for editing', async () => {
    const f = await fixture({bussola:true});
    try {
        await f.automatic(true);
        await f.composer.fill('Bozza');
        f.control.text = '';
        await f.audio();
        await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
        await f.menu.getByRole('alert').filter({hasText:'Non è stato riconosciuto'}).waitFor();
        assert.equal(f.sent().length, 0);
        f.control.text = 'testo '.repeat(700);
        await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
        await f.menu.getByLabel('Trascrizione', {exact:true}).waitFor();
        assert.equal(await f.menu.getByLabel('Trascrizione', {exact:true}).inputValue(), f.control.text);
        assert.equal(await f.composer.inputValue(), 'Bozza');
        assert.equal(f.sent().length, 0);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('English audio options fit on a narrow screen and use the selected language', async () => {
    const f = await fixture({width:320,lang:'en'});
    try {
        await f.audio();
        assert.equal(await f.menu.getByRole('button').count(), 3);
        for (const button of await f.menu.getByRole('button').all()) {
            const box = await button.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height >= 44);
        }
        await f.page.evaluate(() => document.fonts.ready);
        await f.page.screenshot({path:'/tmp/chat-audio-input-320.png'});
        await f.menu.getByLabel('Upload audio file').setInputFiles(audioFile);
        await f.page.waitForFunction(() => document.querySelector('#guided-composer').value.length > 0);
        assert.match(f.control.uploads[0], /name="language"\r\n\r\nen/);
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('cancelled transcription cannot change the draft or send a late response', async () => {
    const f = await fixture();
    let release;
    try {
        await f.automatic(true);
        await f.composer.fill('Bozza da conservare');
        f.control.wait = new Promise(resolve => { release = resolve; });
        await f.audio();
        await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
        await f.menu.getByRole('status').filter({hasText:'Trascrizione'}).waitFor();
        const failed = f.page.waitForEvent('requestfailed', request => request.url().endsWith('/audio/transcribe'));
        await f.menu.getByRole('button', {name:'Annulla'}).click();
        release();
        await failed;
        assert.equal(await f.composer.inputValue(), 'Bozza da conservare');
        assert.equal(f.sent().length, 0);
        assert.deepEqual(f.control.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('real MediaRecorder audio and WAV upload reach local Whisper', {skip:!process.env.AUDIO_INPUT_LIVE}, async () => {
    const f = await fixture({live:true});
    try {
        await f.audio();
        await f.menu.getByRole('button', {name:'Registra dal microfono'}).click();
        await f.menu.getByRole('button', {name:'Ferma e trascrivi'}).waitFor();
        await new Promise(resolve => setTimeout(resolve, 4000));
        await f.menu.getByRole('button', {name:'Ferma e trascrivi'}).click();
        await f.page.waitForFunction(() => document.querySelector('#guided-composer').value.includes('organizzare'), null, {timeout:30000});
        assert.equal(f.sent().length, 0);
        console.log('MediaRecorder transcript:', await f.composer.inputValue());
        await f.composer.fill('');
        await f.automatic(true);
        await f.audio();
        // In-memory File preserves bytes when Playwright forwards the intercepted request.
        await f.menu.getByLabel('Carica file audio').setInputFiles({name:'example.wav', mimeType:'audio/wav', buffer:await readFile('/tmp/audio-input-it.wav')});
        await f.page.getByRole('log').getByText(/vorrei organizzare/i).waitFor({timeout:30000});
        assert.equal(f.sent().length, 1);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});
