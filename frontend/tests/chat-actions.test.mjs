import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Azioni sotto la risposta (#658): Bussola e Assistente usano la riga della
// chat guidata (diagramma, ascolto, feedback). Fixture sintetiche, nessun modello.
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
    const control = { posts: [], errors: [] };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('counselorbot_selected_counselor', '1');
    });
    const session = { session_id: 'actions-fixture', status: 'in_progress', counselor_id: 1, language: 'it', recommendations: [],
        messages: [{ role: 'assistant', content: ANSWER }] };
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(origin).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        if (request.method() === 'POST') control.posts.push({ path: url.pathname, body: request.postDataJSON() });
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'actions-fixture', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true, latest_session_id: 'actions-fixture' };
        else if (url.pathname.startsWith('/api/orientation/sessions')) data = session;
        else if (url.pathname === '/api/site-chat/stream') {
            return route.fulfill({ contentType: 'text/event-stream', body: event({ session_id: 'a', conversation_id: 'a' }) + event({ display: ANSWER }) + event({ done: true, response: ANSWER, response_id: 'resp-1' }) });
        } else if (url.pathname === '/api/strategy-feedback') data = { ok: true };
        return route.fulfill({ json: data });
    });
    return { page, context, control };
}

// Riga sotto la bolla, non dentro: stessa colonna, pulsanti da 44px, niente
// scorrimento orizzontale.
async function checkRow(page, log, width) {
    const group = log.getByRole('group', { name: 'Azioni del messaggio' }).last();
    await group.waitFor();
    assert.equal(await group.locator('xpath=ancestor::*[contains(@class,"chat-message")]').count(), 0);
    const buttons = group.getByRole('button');
    assert.ok(await buttons.count() >= 1);
    for (const box of await buttons.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))) {
        assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box));
    }
    await group.getByRole('button', { name: 'Diagramma', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll at ${width}px`);
    return group;
}

for (const width of [390, 1440]) {
    test(`bussola shows the shared message actions at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        try {
            await page.goto(`${origin}/bussola`);
            await page.getByRole('button', { name: 'Rivedi l’ultimo orientamento', exact: true }).click({ timeout: 120000 });
            const log = page.locator('[role="log"]');
            await log.getByText(ANSWER).waitFor({ timeout: 120000 });
            await checkRow(page, log, width);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });

    test(`assistente shows the shared message actions and feedback at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        try {
            await page.goto(`${origin}/assistente`);
            const composer = page.locator('form.assistente-composer textarea');
            await composer.waitFor({ timeout: 120000 });
            await composer.fill('Come organizzo lo studio?');
            await composer.press('Enter');
            const log = page.locator('[role="log"]');
            await log.getByText(ANSWER).waitFor();
            const group = await checkRow(page, log, width);

            // Feedback con lo stile della chat guidata: aria-pressed, un voto solo.
            const up = group.getByRole('button', { name: 'Risposta utile', exact: true });
            assert.equal(await up.getAttribute('aria-pressed'), 'false');
            await up.click();
            assert.equal(await up.getAttribute('aria-pressed'), 'true');
            await group.getByRole('status').getByText('Grazie!').waitFor();
            assert.ok(await up.isDisabled());
            assert.equal(control.posts.filter(post => post.path === '/api/strategy-feedback').length, 1);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}
