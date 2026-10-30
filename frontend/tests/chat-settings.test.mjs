import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Impostazioni di risposta (#657): formato, lunghezza e analisi stanno nel
// popover «Opzioni della conversazione» con le stesse righe della chat guidata.
// Sezioni titolate e sottolivello del selettore (#682).
// Fixture sintetiche, nessun backend o modello.
const origin = process.env.CHAT_SHELL_BASE_URL || 'http://127.0.0.1:3173';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); });
after(async () => { await browser?.close(); });

async function fixture(width) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('counselorbot_selected_counselor', '1');
    });
    const session = { session_id: 'settings-fixture', status: 'in_progress', counselor_id: 1, language: 'it', recommendations: [],
        messages: [{ role: 'assistant', content: 'Che cosa ti porta qui oggi?' }] };
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(origin).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'settings-fixture', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true, latest_session_id: 'settings-fixture' };
        else if (url.pathname.startsWith('/api/orientation/sessions')) data = session;
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

const surfaces = {
    bussola: { path: '/bussola', composer: '#bussola-composer', resume: 'Rivedi l’ultimo orientamento', sections: ['Azioni', 'Risposte'], rows: ['Formato: Discorsivo'], guide: true },
    assistente: { path: '/assistente', composer: 'form.assistente-composer textarea', sections: ['Azioni', 'Risposte'], rows: ['Formato: Discorsivo', 'Lunghezza: Media'], guide: false },
};

for (const [name, surface] of Object.entries(surfaces)) {
    for (const width of [390, 1440]) {
        test(`${name} keeps response settings in the options popover at ${width}px`, async () => {
            const { page, context, errors } = await fixture(width);
            try {
                await page.goto(`${origin}${surface.path}`);
                if (surface.resume) await page.getByRole('button', { name: surface.resume, exact: true }).click({ timeout: 120000 });
                await page.locator(surface.composer).waitFor({ timeout: 120000 });
                // Nessun selettore nella riga del composer: solo dentro «Opzioni».
                assert.equal(await page.locator('[role="radiogroup"]:visible').count(), 0);

                await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
                const settings = page.getByTestId('chat-response-settings');
                await settings.waitFor();
                const menu = page.locator('.chat-options:popover-open');
                // Sezioni come gruppi con intestazione; righe con valore corrente.
                const sections = menu.locator('[role="group"][aria-labelledby]');
                assert.deepEqual(await sections.locator(':scope > h3').allTextContents(), surface.sections);
                for (const title of surface.sections) await menu.getByRole('group', { name: title, exact: true }).waitFor();
                const rows = settings.getByRole('button', { name: /^(Formato|Lunghezza): / });
                await rows.first().waitFor();
                assert.deepEqual(await rows.evaluateAll(items => items.map(item => item.getAttribute('aria-label'))), surface.rows);
                for (const row of await rows.all()) assert.ok((await row.boundingBox()).height >= 44);
                assert.equal(await menu.getByRole('link', { name: 'Guida a questa attività' }).count(), surface.guide ? 1 : 0);
                assert.equal(await settings.locator('[role="radiogroup"]').count(), 0, 'selectors live in the sub-level');

                // Sottolivello: il fuoco va su «‹», la scelta resta selezionata e il valore si aggiorna.
                await rows.first().click();
                const back = menu.getByRole('button', { name: 'Torna alle opzioni', exact: true });
                assert.equal(await back.evaluate(element => element === document.activeElement), true);
                await menu.getByRole('group', { name: 'Formato', exact: true }).waitFor();
                assert.equal(await menu.getByRole('group', { name: 'Azioni', exact: true }).count(), 0);
                const radios = menu.getByRole('radiogroup', { name: 'Formato' }).getByRole('radio');
                assert.deepEqual(await radios.allTextContents(), ['Discorsivo', 'Per punti']);
                for (const radio of await radios.all()) assert.ok((await radio.boundingBox()).height >= 44);
                await radios.nth(1).click();
                assert.equal(await radios.nth(1).getAttribute('aria-checked'), 'true');
                // Escape torna al livello principale, con il fuoco sulla riga.
                await page.keyboard.press('Escape');
                await menu.waitFor();
                const format = settings.getByRole('button', { name: 'Formato: Per punti', exact: true });
                assert.equal(await format.evaluate(element => element === document.activeElement), true);
                // Tastiera: Invio riapre il sottolivello, «‹» torna indietro.
                await page.keyboard.press('Enter');
                await back.waitFor();
                await page.keyboard.press('Enter');
                assert.equal(await format.evaluate(element => element === document.activeElement), true);
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('.chat-options:popover-open').count(), 0);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
                assert.deepEqual(errors, []);
            } finally { await context.close(); }
        });
    }
}
