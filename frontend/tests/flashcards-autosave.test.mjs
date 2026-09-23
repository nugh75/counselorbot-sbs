import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.ACCOUNT_BASE_URL || 'http://127.0.0.1:3000';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });

for (const width of [390, 1440]) {
    test(`flashcards save silently without moving the editor at ${width}px`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        let state = { revision: 1, workspace: { decks: [{ id: 'deck', title: 'Prova', cards: [{ id: 'card', front: 'Domanda', back: 'Risposta' }] }] } };
        let release;
        const blocked = new Promise(resolve => { release = resolve; });
        let fail = false;
        await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
        await page.route('**/api/**', async route => {
            const request = route.request(), path = new URL(request.url()).pathname;
            let data = [];
            if (path === '/api/auth/me') data = { authenticated: true, username: 'autosave-test', groups: ['studenti'], is_admin: false };
            else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
            else if (path === '/api/orientation/status') data = { required: false, completed: true };
            else if (path === '/api/user/flashcards') {
                if (request.method() === 'PUT') {
                    await blocked;
                    if (fail) return route.fulfill({ status: 503, json: {} });
                    state = { revision: state.revision + 1, workspace: request.postDataJSON().workspace };
                }
                data = state;
            }
            return route.fulfill({ json: data });
        });
        try {
            await page.goto(`${origin}/profilo/flashcard`);
            await page.getByRole('button', { name: 'Modifica: Prova', exact: true }).click();
            const field = page.locator('article').getByRole('textbox').first();
            await field.scrollIntoViewIfNeeded();
            const before = await field.boundingBox();
            const writing = page.waitForRequest(request => request.method() === 'PUT' && request.url().endsWith('/flashcards'));
            await field.fill('Domanda aggiornata');
            assert.equal(await page.getByRole('status').filter({ hasText: /Salvataggio|Salvato|Modifiche non salvate/ }).count(), 0);
            await writing;
            assert.deepEqual(await field.boundingBox(), before);
            assert.equal(await page.getByText('Salvataggio…', { exact: true }).count(), 0);
            const written = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/flashcards'));
            release();
            await written;
            assert.equal(state.workspace.decks[0].cards[0].front, 'Domanda aggiornata');
            assert.deepEqual(await field.boundingBox(), before);
            assert.equal(await page.getByText('Salvato', { exact: true }).count(), 0);
            fail = true;
            await field.fill('Bozza da conservare');
            await page.getByRole('alert').filter({ hasText: 'Salvataggio non riuscito' }).waitFor();
            assert.equal(await field.inputValue(), 'Bozza da conservare');
        } catch (error) { console.log(await page.locator('body').innerText()); throw error; }
        finally { release(); await context.close(); }
    });
}
