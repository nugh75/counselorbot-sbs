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

async function fixture({ bussola = false, width = 390, lang = 'it', live = false, phase = 'intro' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const control = { requests: [], uploads: [], errors: [], text: 'Vorrei studiare meglio.', status: 200, wait: null, replyWait: null, incomplete: false, reply: 'Proseguiamo.', deltas: null };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(({ lang, dark, live }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
        if (live) {
            window.__speakers = [];
            window.__streams = [];
            const NativeAudio = window.Audio;
            window.Audio = function (...args) { const audio = new NativeAudio(...args); window.__speakers.push(audio); return audio; };
            const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async options => { const stream = await getUserMedia(options); window.__streams.push(stream); return stream; };
            return;
        }
        window.__tracks = [];
        window.__denyMicrophone = false;
        window.__recordings = [];
        window.__speakers = [];
        window.__overlap = false;
        window.Audio = class {
            src = ''; currentTime = 0; paused = true;
            constructor() { window.__speakers.push(this); }
            async play() {
                if (window.__blockPlayback) throw new Error('Playback blocked');
                if (window.__tracks.some(t => !t.stopped)) window.__overlap = true;
                this.paused = false; this.onplaying?.();
            }
            pause() { this.paused = true; }
            load() {}
            removeAttribute() { this.src = ''; }
        };
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
        if (path === '/api/tts/stream') {
            if (live) return route.fallback();
            const text = request.postDataJSON().text;
            return route.fulfill({contentType:'text/event-stream',body:[
                {type:'init',segments:[{index:0,paragraph_id:0,text}]},
                {type:'chunk',index:0,audio:Buffer.from('audio').toString('base64'),mime:'audio/wav',words:[]},
                {type:'done'},
            ].map(event => 'data: '+JSON.stringify(event)+'\n\n').join('')});
        }
        if ((path === '/api/chat/stream' || path.endsWith('/message')) && request.postDataJSON().message?.trim() && control.replyWait) await control.replyWait;
        let data = [];
        if (path === '/api/auth/me') data = {authenticated:true, is_admin:false, username:'audio-fixture', groups:['studenti']};
        else if (path === '/api/user/account-preferences') data = {counselor_id:1, counselor_ready:true, notebook_ready:true, setup_completed:true};
        else if (path === '/api/counselors') data = [{id:1,name:'Counselor',language:['it','en'],is_active:true,suitable:true}];
        else if (path === '/api/orientation/status') data = {required:false,completed:true,latest_session_id:'audio-fixture'};
        else if (path.startsWith('/api/orientation/sessions')) {
            if (path.endsWith('/message')) session.messages.push({role:'user',content:request.postDataJSON().message}, {role:'assistant',content:'Proseguiamo.'});
            data=session;
        } else if (path === '/api/session/frozen/audio-fixture') data = {...session,questionnaire_type:'QSA',current_phase:phase,experience:'standard',scores:{C1:7}};
        else if (path === '/api/qsa/guided-ui-texts') data = {guided_steps:[{id:'intro',label:'Introduzione',sort_order:1,system_prompt_mode:'qsa-intro',suggested_questions:[]}]};
        else if (path === '/api/chat/stream') {
            const frames = (control.deltas || []).map(delta => ({delta}));
            const reply = control.deltas ? control.deltas.join('') : control.reply;
            return route.fulfill({contentType:'text/event-stream',body:[...frames, {done:true,response:reply,session_id:'audio-fixture',incomplete:control.incomplete}]
                .map(event => 'data: '+JSON.stringify(event)+'\n\n').join('')});
        }
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
    async function voice() {
        await page.getByRole('button', {name:'Opzioni della conversazione',exact:true}).click();
        await page.getByRole('button', {name:'Conversazione vocale',exact:true}).click();
        await page.getByRole('group', {name:'Conversazione vocale',exact:true}).waitFor();
    }
    async function options() {
        const trigger = page.getByRole('button', {name:'Opzioni della conversazione',exact:true});
        if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
        const panel = page.getByRole('group', {name:'Opzioni della conversazione',exact:true});
        await panel.waitFor();
        return panel;
    }
    return { page, context, composer, control, sent, menu, audio, automatic, open, voice, options };
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
            assert.match(f.control.uploads[0], /name="language"\r\n\r\nauto/);
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
        assert.match(f.control.uploads[0], /name="language"\r\n\r\nauto/);
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

for (const bussola of [false, true]) for (const width of [320, 1440]) test(`${bussola ? 'Bussola' : 'guided chat'} voice turns at ${width}px keep the full transcript visible and wait for an explicit microphone press`, async () => {
    const f = await fixture({bussola,width});
    try {
        await f.page.evaluate(() => localStorage.setItem('cb_voice_it_counselor_1','piper:'));
        await f.composer.fill('La mia premessa');
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        assert.equal(await f.page.getByRole('log').isVisible(), true);
        assert.equal(await f.composer.isVisible(), false);
        assert.equal(await panel.getByRole('button').count(), 1, 'Only the talk button stays in the composer');
        assert.equal((await panel.innerText()).trim(), 'Premi per parlare', 'No extra heading, status or instructions');
        assert.ok((await panel.boundingBox()).height <= 52, 'Voice controls occupy a single compact row');
        assert.equal(await f.page.getByRole('button', {name:'Torna a scrivere'}).isVisible(), false);
        const options = await f.options();
        await options.getByText(/Il testo resta nella chat/).waitFor();
        await options.getByRole('button', {name:'Torna a scrivere'}).waitFor();
        await f.page.keyboard.press('Escape');
        assert.equal(await panel.isVisible(), true, 'Escape in the menu closes it without exiting voice mode');
        assert.equal(await f.page.evaluate(() => window.__tracks.length), 0);
        assert.equal(f.control.requests.filter(r => r.path === '/api/tts/stream').length, 0, 'Never replay restored history on entry');
        await panel.getByRole('button', {name:'Premi per parlare',exact:true}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        await panel.getByRole('button', {name:'Interrompi e parla'}).waitFor();
        assert.equal(f.sent().length, 1);
        assert.equal(f.sent()[0].body.message, 'La mia premessa\nVorrei studiare meglio.');
        await f.page.getByRole('log').getByText('La mia premessa\nVorrei studiare meglio.',{exact:true}).waitFor();
        assert.equal(await f.page.getByRole('log').getByText('Proseguiamo.',{exact:true}).last().isVisible(), true);
        const spoken = f.control.requests.filter(r => r.path === '/api/tts/stream');
        assert.equal(spoken.length, 1);
        assert.equal(spoken[0].body.text, 'Proseguiamo.');
        assert.equal(spoken[0].body.counselor_id, 1);
        assert.equal(spoken[0].body.language, 'it');
        assert.equal(spoken[0].body.engine, 'piper');
        assert.equal(spoken[0].body.voice_override, false);
        assert.equal(await f.page.evaluate(() => window.__overlap), false);
        await f.options();
        await options.getByRole('button', {name:'Pausa',exact:true}).click();
        assert.equal(await f.page.evaluate(() => window.__speakers.every(a => a.paused)), true);
        await options.getByRole('button', {name:'Riprendi',exact:true}).click();
        await options.getByRole('status').filter({hasText:'In lettura'}).waitFor();
        await f.page.evaluate(() => window.__speakers.at(-1).onended());
        await options.getByRole('button', {name:'Riascolta la risposta'}).click();
        await options.getByRole('status').filter({hasText:'In lettura'}).waitFor();
        assert.equal(f.sent().length, 1, 'Playback commands never resend the chat message');
        await f.page.evaluate(() => window.__speakers.at(-1).onended());
        await f.page.screenshot({path:`/tmp/compact-voice-options-${bussola ? 'bussola' : 'chat'}-${width}.png`});
        await f.page.keyboard.press('Escape');
        await panel.getByRole('button', {name:'Premi per parlare',exact:true}).waitFor();
        assert.equal(await f.page.evaluate(() => window.__tracks.length), 1, 'No automatic microphone restart');
        for (const button of await panel.getByRole('button').all()) {
            const box = await button.boundingBox();
            assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
        }
        await f.page.screenshot({path:`/tmp/compact-voice-conversation-${bussola ? 'bussola' : 'chat'}-${width}.png`});
        await panel.getByRole('button', {name:'Premi per parlare',exact:true}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        await panel.getByRole('button', {name:'Interrompi e parla'}).waitFor();
        assert.equal(f.sent().length, 2);
        await panel.getByRole('button', {name:'Interrompi e parla'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).waitFor();
        assert.equal(await f.page.evaluate(() => window.__speakers.every(a => a.paused)), true);
        await (await f.options()).getByRole('button', {name:'Torna a scrivere'}).click();
        await f.composer.waitFor();
        assert.ok((await f.composer.boundingBox()).height >= 44, 'Composer restores its usable height');
        assert.equal(await f.page.evaluate(() => window.__tracks.every(t => t.stopped)), true);
        assert.equal(f.sent().length, 2, 'Exiting while recording discards it');
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('leaving voice mode during a reply keeps the conversation but suppresses late speech', async () => {
    const f = await fixture();
    let release;
    try {
        f.control.replyWait = new Promise(resolve => { release = resolve; });
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        await panel.getByRole('button', {name:/Il counselor sta rispondendo/}).waitFor();
        await (await f.options()).getByRole('button', {name:'Torna a scrivere'}).click();
        release();
        await f.page.getByRole('log').getByText('Proseguiamo.',{exact:true}).last().waitFor();
        await f.page.getByRole('button',{name:'Invia',exact:true}).waitFor();
        assert.equal(f.control.requests.filter(r => r.path === '/api/tts/stream').length, 0);
        assert.equal(f.sent().length, 1);
        assert.deepEqual(f.control.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('blocked playback resumes without sending again and incomplete replies are never spoken', async () => {
    const f = await fixture();
    try {
        await f.page.evaluate(() => { window.__blockPlayback = true; });
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        const options = f.page.getByRole('group', {name:'Opzioni della conversazione',exact:true});
        await options.getByRole('alert').filter({hasText:'Premi Riprendi'}).waitFor();
        await f.page.evaluate(() => { window.__blockPlayback = false; });
        await options.getByRole('button', {name:'Riprendi',exact:true}).click();
        await f.page.keyboard.press('Escape');
        await panel.getByRole('button', {name:'Interrompi e parla'}).waitFor();
        assert.equal(f.sent().length, 1);
        f.control.incomplete = true;
        await panel.getByRole('button', {name:'Interrompi e parla'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        const continueReply = f.page.getByRole('button', {name:'Continua',exact:true});
        await continueReply.waitFor();
        assert.equal(f.control.requests.filter(r => r.path === '/api/tts/stream').length, 1);
        assert.equal(await f.page.evaluate(() => window.__tracks.every(t => t.stopped)), true);
        f.control.incomplete = false;
        await continueReply.click();
        await panel.getByRole('button', {name:'Interrompi e parla'}).waitFor();
        assert.equal(f.control.requests.filter(r => r.path === '/api/tts/stream').length, 2, 'Speak only when continuation finishes');
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('live voice turn records, transcribes locally and plays Piper while showing the chat', {skip:!process.env.AUDIO_INPUT_LIVE}, async () => {
    const f = await fixture({live:true});
    try {
        await f.page.evaluate(() => localStorage.setItem('cb_voice_it_counselor_1','piper:'));
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).waitFor();
        await new Promise(resolve => setTimeout(resolve, 4000));
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        await f.page.waitForFunction(() => window.__speakers.some(audio => audio.currentTime > 0), null, {timeout:30000});
        await panel.getByRole('button', {name:'Premi per parlare',exact:true}).waitFor();
        await f.page.getByRole('log').getByText(/organizzare/).waitFor();
        assert.equal(f.sent().length, 1);
        assert.equal(await f.page.evaluate(() => window.__streams.length), 1);
        assert.equal(await f.page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), true);
        assert.equal(await f.page.getByRole('log').isVisible(), true);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('manual listening stops voice capture and the next recording stops manual listening', async () => {
    const f = await fixture();
    try {
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).waitFor();
        // Playwright can click through opacity 0 during the page entrance animation;
        // the reader deliberately skips invisible text, so wait for the actual message.
        await f.page.waitForFunction(() => document.querySelector('[data-voice-source]')?.checkVisibility({checkOpacity:true}));
        await f.page.getByRole('log').getByRole('button', {name:'Ascolta',exact:true}).first().click();
        await f.page.getByRole('complementary', {name:'Lettore audio'}).getByRole('status').filter({hasText:'In lettura'}).waitFor();
        assert.equal(await f.page.evaluate(() => window.__tracks.every(t => t.stopped)), true);
        assert.equal(f.sent().length, 0);
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).waitFor();
        assert.equal(await f.page.evaluate(() => window.__speakers.every(a => a.paused)), true);
        await panel.getByRole('button', {name:'Ferma e invia'}).focus();
        await f.page.keyboard.press('Escape');
        await f.composer.waitFor();
        assert.equal(await f.page.evaluate(() => window.__tracks.every(t => t.stopped)), true);
        assert.equal(await f.page.evaluate(() => window.__overlap), false);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('the final guided reply remains audible after the path completes', async () => {
    const f = await fixture({phase:'questions'});
    try {
        f.control.reply = 'Proseguiamo. [[AVANZA_STEP]]';
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        await panel.getByRole('button', {name:'Interrompi e parla'}).waitFor();
        assert.equal(f.control.requests.find(r => r.path === '/api/tts/stream').body.text, 'Proseguiamo.');
        assert.equal(await panel.getByRole('button', {name:'Interrompi e parla'}).isDisabled(), true);
        await (await f.options()).getByRole('button', {name:'Torna a scrivere'}).click();
        assert.equal(await f.composer.count(), 0, 'Completed paths keep their normal closed composer');
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('shortening an overlong voice transcript sends it once and clears its error', async () => {
    const f = await fixture({bussola:true});
    try {
        f.control.text = 'parole '.repeat(600);
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        const options = f.page.getByRole('group', {name:'Opzioni della conversazione',exact:true});
        await options.getByLabel('Trascrizione',{exact:true}).fill('Una domanda più breve.');
        assert.equal(f.sent().length, 0);
        await options.getByRole('button', {name:'Ferma e invia'}).click();
        await options.getByRole('status').filter({hasText:'In lettura'}).waitFor();
        assert.equal(f.sent().length, 1);
        assert.equal(f.sent()[0].body.message, 'Una domanda più breve.');
        assert.equal(await options.getByLabel('Trascrizione',{exact:true}).count(), 0);
        assert.equal(await options.getByRole('alert').count(), 0);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('the spoken language is chosen apart from the interface language', async () => {
    const f = await fixture();
    try {
        const panel = await f.options();
        await panel.getByRole('combobox', {name:'Lingua del parlato'}).selectOption('en');
        await f.page.keyboard.press('Escape');
        await f.audio();
        await f.menu.getByLabel('Carica file audio').setInputFiles(audioFile);
        await f.page.waitForFunction(() => document.querySelector('#guided-composer').value.length > 0);
        assert.match(f.control.uploads[0], /name="language"\r\n\r\nen/);
        await f.open();
        const restored = await f.options();
        assert.equal(await restored.getByRole('combobox', {name:'Lingua del parlato'}).inputValue(), 'en');
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});

test('a long reply is spoken in pieces while it is still being written', async () => {
    const f = await fixture();
    try {
        await f.page.evaluate(() => localStorage.setItem('cb_voice_it_counselor_1','piper:'));
        f.control.deltas = [
            'Cominciamo dal tempo che dedichi allo studio ogni giorno della settimana. ',
            'Poi guardiamo insieme come organizzi le pause e il ripasso. ',
            'Che cosa ti sembra più faticoso?',
        ];
        await f.voice();
        const panel = f.page.getByRole('group', {name:'Conversazione vocale',exact:true});
        await panel.getByRole('button', {name:'Premi per parlare'}).click();
        await panel.getByRole('button', {name:'Ferma e invia'}).click();
        await panel.getByRole('button', {name:'Interrompi e parla'}).waitFor();
        const spoken = f.control.requests.filter(r => r.path === '/api/tts/stream');
        assert.ok(spoken.length > 1, `the reply is read in pieces, got ${spoken.length}`);
        assert.equal(spoken.map(r => r.body.text).join(''), f.control.deltas.join(''), 'every word is spoken once, in order');
        assert.equal(f.sent().length, 1);
        assert.deepEqual(f.control.errors, []);
    } finally { await f.context.close(); }
});
