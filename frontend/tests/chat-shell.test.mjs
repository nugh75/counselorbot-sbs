import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// ChatShell (#653): Bussola e Assistente condividono trascritto, riga, campo e
// pulsante della chat guidata; il composer (#656) ha la stessa forma. Fixture sintetiche, nessun backend o modello.
const origin = process.env.CHAT_SHELL_BASE_URL || 'http://127.0.0.1:3173';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); });
after(async () => { await browser?.close(); });
const event = data => `data: ${JSON.stringify(data)}\n\n`;
const ANSWER = 'Possiamo partire da un esempio concreto del tuo studio.';

async function fixture(width) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(120000);
    const control = { posts: [], errors: [], release: null };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('counselorbot_selected_counselor', '1');
    });
    const session = { session_id: 'shell-fixture', status: 'in_progress', counselor_id: 1, language: 'it', recommendations: [],
        messages: [{ role: 'assistant', content: 'Che cosa ti porta qui oggi?' }] };
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(origin).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        if (request.method() === 'POST') control.posts.push(url.pathname);
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'shell-fixture', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true, latest_session_id: 'shell-fixture' };
        else if (url.pathname.startsWith('/api/orientation/sessions')) {
            if (url.pathname.endsWith('/message')) {
                await new Promise(resolve => { control.release = resolve; });
                session.messages.push({ role: 'user', content: request.postDataJSON().message }, { role: 'assistant', content: ANSWER });
            }
            data = session;
        } else if (url.pathname === '/api/site-chat/stream') {
            await new Promise(resolve => { control.release = resolve; });
            return route.fulfill({ contentType: 'text/event-stream', body: event({ session_id: 'shell', conversation_id: 'shell' }) + event({ display: ANSWER }) + event({ done: true, response: ANSWER }) });
        }
        return route.fulfill({ json: data });
    });
    return { page, context, control };
}

async function waitRelease(page, control) {
    for (let i = 0; i < 100 && !control.release; i++) await page.waitForTimeout(50);
    assert.ok(control.release, 'request reached the fixture');
}

const surfaces = {
    bussola: { path: '/bussola', composer: '#bussola-composer', send: 'Invia alla Bussola', stop: null, pending: 'La Bussola sta collegando', suggestion: 'Come funziona la piattaforma?', resume: 'Rivedi l’ultimo orientamento' },
    assistente: { path: '/assistente', composer: 'form.assistente-composer textarea', send: 'Invia', stop: 'Ferma la risposta', pending: 'Sto pensando...' },
};

for (const [name, surface] of Object.entries(surfaces)) {
    for (const width of [390, 1440]) {
        test(`${name} uses the shared chat shell at ${width}px`, async () => {
            const { page, context, control } = await fixture(width);
            try {
                await page.goto(`${origin}${surface.path}`);
                // Bussola riapre la sessione salvata dalla scelta iniziale.
                if (surface.resume) await page.getByRole('button', { name: surface.resume, exact: true }).click({ timeout: 120000 });
                const composer = page.locator(surface.composer);
                await composer.waitFor({ timeout: 120000 });
                const log = page.locator('[role="log"]');
                assert.equal(await log.count(), 1);
                // Annuncio separato: mai dentro il trascritto, mai aria-live sul log.
                const live = page.locator('[aria-live="polite"].sr-only');
                assert.equal(await live.count(), 1);
                assert.equal(await log.locator('[aria-live]').count(), 0);
                assert.equal(await log.getAttribute('aria-live'), null);

                assert.ok(await composer.getAttribute('aria-label'));
                assert.equal(await composer.getAttribute('rows'), '1');
                const send = page.getByRole('button', { name: surface.send, exact: true });
                const box = await send.boundingBox();
                assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box));
                assert.ok(await send.isDisabled());
                // Composer (#656): opzioni a sinistra, stesso pulsante di invio.
                const options = page.getByRole('button', { name: 'Opzioni della conversazione', exact: true });
                const optionsBox = await options.boundingBox();
                assert.equal(optionsBox.width, box.width);
                assert.equal(optionsBox.height, box.height);
                assert.ok(optionsBox.x < (await composer.boundingBox()).x && box.x > (await composer.boundingBox()).x);
                const radius = element => getComputedStyle(element).borderRadius;
                assert.equal(await options.evaluate(radius), await send.evaluate(radius));
                if (surface.suggestion) {
                    // Il suggerimento si aggiunge alla bozza, non la sostituisce.
                    await page.getByText('Domande suggerite', { exact: true }).click();
                    await composer.fill('Ciao');
                    await page.getByRole('button', { name: surface.suggestion, exact: true }).click();
                    assert.equal(await composer.inputValue(), `Ciao\n\n${surface.suggestion}`);
                    await composer.fill('');
                }

                // Tastiera: Maiusc+Invio va a capo e il campo cresce, Invio invia.
                await composer.focus();
                await page.keyboard.type('Vorrei studiare meglio');
                // Da vuoto il campo misura anche il segnaposto, che può andare a capo.
                const before = (await composer.boundingBox()).height;
                await page.keyboard.press('Shift+Enter');
                await page.keyboard.type('con un metodo');
                assert.equal(await composer.inputValue(), 'Vorrei studiare meglio\ncon un metodo');
                assert.ok((await composer.boundingBox()).height > before);
                assert.equal(control.posts.filter(path => !path.endsWith('/sessions')).length, 0);
                await page.keyboard.press('Enter');
                await waitRelease(page, control);

                // Attesa: un solo segnale nel trascritto e annuncio di stato.
                await log.getByText(surface.pending).waitFor();
                if (surface.stop) await page.getByRole('button', { name: surface.stop, exact: true }).waitFor();
                assert.notEqual((await live.textContent()).trim(), '');
                control.release();

                await log.getByText(ANSWER).waitFor();
                await page.waitForFunction(text => document.querySelector('[aria-live="polite"].sr-only')?.textContent?.includes(text), ANSWER);

                // Larghezza unica della bolla: piena su telefono, 90% da lg.
                const widths = await log.locator('.chat-message').evaluateAll(nodes => nodes.map(node => {
                    const column = node.parentElement, row = column.parentElement;
                    return { column: getComputedStyle(column).maxWidth, inside: node.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1 };
                }));
                assert.ok(widths.length >= 2);
                for (const item of widths) {
                    assert.ok(item.inside);
                    assert.equal(item.column, width >= 1024 ? '90%' : '100%');
                }
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
                assert.deepEqual(control.errors, []);
            } finally { await context.close(); }
        });
    }
}
