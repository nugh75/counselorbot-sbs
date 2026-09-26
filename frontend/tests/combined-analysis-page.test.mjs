import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.RESULT_DISCLOSURE_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

for (const available of [false, true]) {
    test(`combined analysis has its own destination (available: ${available})`, async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
        await context.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); });
        const page = await context.newPage();
        const errors = [];
        const generations = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', async route => {
            const request = route.request();
            const path = new URL(request.url()).pathname.slice(4);
            let data = [];
            if (path === '/auth/me') data = { authenticated: true, username: 'combined-test', name: 'Test', groups: ['studenti'], is_admin: false };
            else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
            else if (path === '/orientation/status') data = { required: false, completed: true };
            else if (path === '/tavolo/enabled') data = { enabled: false };
            else if (path === '/user/cross-synthesis/availability') data = { available, min_instruments: 2, instruments: available ? [{ questionnaire_type: 'QSA' }, { questionnaire_type: 'ZTPI' }] : [] };
            else if (path === '/user/cross-synthesis') {
                assert.equal(request.method(), 'POST');
                generations.push(request.postDataJSON());
                data = { content: 'GENERATED_ANALYSIS' };
            }
            await route.fulfill({ json: data });
        });
        try {
            await page.goto(`${origin}/profilo`);
            const reflection = page.getByRole('navigation', { name: 'Conoscermi e riflettere', exact: true });
            const link = reflection.getByRole('link', { name: 'Analisi Combinata dei Profili', exact: true });
            assert.equal(await link.getAttribute('href'), '/profilo/analisi-combinata');
            await link.click();
            await page.waitForURL(`${origin}/profilo/analisi-combinata`);
            const heading = page.getByRole('heading', { name: 'Analisi Combinata dei Profili', exact: true });
            await heading.waitFor();
            assert.equal(await heading.count(), 1);
            assert.equal(await heading.evaluate(el => el.tagName), 'H1');
            const generate = page.getByRole('button', { name: 'Genera la sintesi', exact: true });
            assert.deepEqual(generations, [], 'opening the tool never generates automatically');
            if (available) {
                await generate.click();
                await page.getByText('GENERATED_ANALYSIS', { exact: true }).waitFor();
                assert.deepEqual(generations, [{ language: 'it' }]);
            } else {
                await page.getByText('Compila almeno due strumenti', { exact: false }).waitFor();
                assert.equal(await generate.count(), 0);
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.getByRole('link', { name: 'Area personale', exact: true }).click();
            await page.waitForURL(`${origin}/profilo`);
            await page.goto(`${origin}/profilo/compilazioni`);
            await page.getByRole('heading', { name: 'Risultati e conversazioni', exact: true }).waitFor();
            assert.equal(await page.getByText('Analisi Combinata dei Profili', { exact: true }).count(), 0);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
