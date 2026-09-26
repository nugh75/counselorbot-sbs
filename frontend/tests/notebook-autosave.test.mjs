import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.ACCOUNT_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });

async function fixture(width, intake = false) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const state = { fail: false, writes: [], errors: [], revision: intake ? null : { id: 1, data: { goal: 'Obiettivo precedente' }, source: 'manual', created_at: '2026-09-09' } };
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    page.on('pageerror', e => state.errors.push(e.message));
    await page.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'autosave-test', email: 'autosave@example.test', name: 'Test', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: !intake, setup_completed: !intake };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/user/learner-profile') {
            if (req.method() === 'POST') {
                if (state.fail) return route.fulfill({ status: 503, json: {} });
                const { source, session_id, save_mode, ...fields } = req.postDataJSON();
                state.writes.push({ data: fields, save_mode });
                state.revision = { id: (state.revision?.id ?? 0) + 1, data: fields, source, session_id, created_at: '2026-09-09' };
            }
            data = state.revision;
        }
        return route.fulfill({ json: data });
    });
    return { page, context, state };
}
for (const width of [390, 1440]) {
    test(`typing saves automatically and survives navigation at ${width}px`, async () => {
        const { page, context, state } = await fixture(width);
        try {
            await page.goto(`${origin}/profilo/taccuino`);
            await page.getByRole('button', { name: 'Modifica', exact: true }).click();
            assert.equal(await page.getByLabel(/Il tuo obiettivo in questo momento/i).count(), 0);
            // Il ponte obiettivi è ora il bottone condizionale «→ Rendi obiettivo la
            // difficoltà» (mostrato solo con una difficoltà compilata): è coperto da test:goals.
            const field = page.getByLabel(/Altro che vuoi aggiungere/i);
            await field.scrollIntoViewIfNeeded();
            const before = await field.boundingBox();
            let release;
            const blocked = new Promise(resolve => { release = resolve; });
            await page.route('**/api/user/learner-profile', async route => {
                if (route.request().method() === 'POST') await blocked;
                return route.fallback();
            });
            const saving = page.waitForRequest(request => request.url().endsWith('/api/user/learner-profile') && request.method() === 'POST');
            const saved = page.waitForResponse(response => response.url().endsWith('/api/user/learner-profile') && response.request().method() === 'POST');
            await field.fill('Voglio organizzare meglio lo studio');
            assert.equal(await page.getByTestId('notebook-autosave-status').count(), 0);
            await saving;
            try {
                assert.equal(await page.getByTestId('notebook-autosave-status').count(), 0);
                assert.deepEqual(await field.boundingBox(), before);
            } finally { release(); }
            await saved;
            await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Salva versione' && !button.disabled));
            assert.equal(await page.getByTestId('notebook-autosave-status').count(), 0);
            assert.deepEqual(await field.boundingBox(), before);
            assert.equal(state.revision.data.notes, 'Voglio organizzare meglio lo studio');
            assert.equal(state.writes.at(-1).save_mode, 'autosave');
            assert.equal(await field.inputValue(), 'Voglio organizzare meglio lo studio');
            await page.getByRole('button', { name: 'Salva versione', exact: true }).click();
            await page.getByText('Versione salvata nella cronologia', { exact: true }).first().waitFor();
            assert.equal(state.writes.at(-1).save_mode, 'manual');
            await page.getByRole('button', { name: 'Modifica', exact: true }).click();
            await field.fill('Ultime parole prima del cambio pagina');
            await page.goto(`${origin}/profilo`);
            await page.goto(`${origin}/profilo/taccuino`);
            await page.getByText('Ultime parole prima del cambio pagina', { exact: true }).first().waitFor();
            assert.deepEqual(state.errors, []);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: `/tmp/notebook-autosave-${width}.png`, fullPage: true });
        } catch (e) { console.log('Browser state:', await page.locator('body').innerText(), state.errors); throw e; } finally { await context.close(); }
    });
}
test('failed save survives reload, retries online, and never advances intake automatically', async () => {
    const { page, context, state } = await fixture(390, true);
    try {
        state.fail = true;
        await page.goto(`${origin}/inizia`);
        const field = page.getByLabel(/Parlaci del luogo dove studi/i);
        await field.fill('La mia bozza da conservare');
        await page.getByLabel('Salvataggio non riuscito. Riprova.', { exact: true }).waitFor();
        await page.reload();
        await field.waitFor();
        assert.equal(await field.inputValue(), 'La mia bozza da conservare');
        await page.getByLabel('Salvataggio non riuscito. Riprova.', { exact: true }).waitFor();
        state.fail = false;
        const saved = page.waitForResponse(response => response.url().endsWith('/api/user/learner-profile') && response.request().method() === 'POST' && response.ok());
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await saved;
        await page.getByTestId('notebook-autosave-status').waitFor({ state: 'detached' });
        assert.equal(state.revision.data.context, 'La mia bozza da conservare');
        assert.equal(state.writes.at(-1).save_mode, 'autosave');
        assert.equal(new URL(page.url()).pathname, '/inizia');
        assert.equal(await field.inputValue(), 'La mia bozza da conservare');
        assert.deepEqual(state.errors, []);
    } catch (e) { console.log('Browser state:', await page.locator('body').innerText(), state.errors); throw e; } finally { await context.close(); }
});
