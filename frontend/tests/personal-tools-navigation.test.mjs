import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.PERSONAL_TOOLS_BASE_URL || 'http://127.0.0.1:3000';
let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const emptyWorkspace = {
    actions: [],
    cards: [],
    comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' },
    timeline: { title: '', events: [] },
};

async function fixture(width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') {
            data = { authenticated: true, username: 'tools-test', name: 'Studente', email: 'student@example.test', groups: ['studenti'], is_admin: false };
        } else if (path === '/api/user/account-preferences') {
            data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        } else if (path === '/api/orientation/status') {
            data = { required: false, completed: true };
        } else if (path === '/api/user/timeline') {
            data = { revision: 1, workspace: emptyWorkspace };
        } else if (path === '/api/orientation-directory') {
            data = { institution: null, events: [], referrals: [] };
        } else if (path === '/api/tavolo/enabled') {
            data = { enabled: false };
        }
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

for (const width of [390, 1280]) {
    test(`personal tools keep route, title and exit sequence aligned at ${width}px`, async () => {
        const { page, context, errors } = await fixture(width);
        try {
            await page.goto(`${origin}/profilo/timeline?tab=board`, { waitUntil: 'networkidle' });
            let workspace = page.getByRole('dialog');
            const back = workspace.getByRole('button', { name: 'Indietro', exact: true });
            let heading = workspace.getByRole('heading', { name: 'Bacheca delle azioni', exact: true, level: 2 });
            await heading.waitFor();
            const [backBox, headingBox] = await Promise.all([back.boundingBox(), heading.boundingBox()]);
            assert.ok(backBox.x < headingBox.x, 'the page back control stays to the left of the title');
            assert.equal(await back.evaluate(element => element === document.activeElement), true);
            assert.equal(await workspace.getByRole('button', { name: 'Chiudi', exact: true }).count(), 0);
            assert.equal(await workspace.getByRole('tab').count(), 4);
            assert.equal(await workspace.getByRole('tab', { name: 'Taccuino', exact: true }).count(), 0);
            assert.equal(await workspace.getByRole('tab', { name: 'Tavolo di lavoro', exact: true }).count(), 0);
            assert.equal(await page.title(), 'Bacheca delle azioni - CounselorBot');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: `/tmp/personal-tools-navigation-board-${width}.png`, fullPage: true });

            await workspace.getByRole('tab', { name: 'Carte da ordinare', exact: true }).click();
            await page.waitForURL('**/profilo/timeline?tab=cards');
            await workspace.getByRole('heading', { name: 'Carte da ordinare', exact: true, level: 2 }).waitFor();
            assert.equal(await page.title(), 'Carte da ordinare - CounselorBot');

            await workspace.getByRole('tab', { name: 'Confronto', exact: true }).click();
            await page.waitForURL('**/profilo/timeline?tab=comparison');
            await workspace.getByRole('heading', { name: 'Confronto', exact: true, level: 2 }).waitFor();

            await workspace.getByRole('tab', { name: 'Linea del tempo', exact: true }).click();
            await page.waitForURL('**/profilo/timeline?tab=timeline');
            await workspace.getByRole('heading', { name: 'Linea del tempo', exact: true, level: 2 }).waitFor();
            assert.equal(await page.title(), 'Linea del tempo - CounselorBot');

            await workspace.getByRole('tab', { name: 'Bacheca delle azioni', exact: true }).click();
            await page.waitForURL('**/profilo/timeline?tab=board');
            workspace = page.getByRole('dialog');
            await workspace.getByLabel('Attività', { exact: true }).fill('Attività non salvata');
            await workspace.getByRole('button', { name: 'Aggiungi attività', exact: true }).click();

            page.once('dialog', dialog => dialog.dismiss());
            await workspace.getByRole('button', { name: 'Indietro', exact: true }).click();
            assert.equal(new URL(page.url()).pathname, '/profilo/timeline');

            page.once('dialog', dialog => dialog.accept());
            await workspace.getByRole('button', { name: 'Indietro', exact: true }).click();
            await page.waitForURL('**/profilo');

            await page.goto(`${origin}/profilo/timeline?tab=cards`, { waitUntil: 'networkidle' });
            await page.getByRole('dialog').getByRole('heading', { name: 'Carte da ordinare', exact: true, level: 2 }).waitFor();
            await page.keyboard.press('Escape');
            await page.waitForURL('**/profilo');
            assert.deepEqual(errors, []);
        } finally {
            await context.close();
        }
    });
}
