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
        const path = new URL(route.request().url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'tools-test', name: 'Studente', email: 'student@example.test', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/user/timeline') data = { revision: 1, workspace: emptyWorkspace };
        else if (path === '/api/orientation-directory') data = { institution: null, events: [], referrals: [] };
        else if (path === '/api/tavolo/enabled') data = { enabled: false };
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

const routes = [
    ['/profilo/azioni', 'Bacheca delle azioni'],
    ['/profilo/carte', 'Carte da ordinare'],
    ['/profilo/confronto', 'Confronto'],
    ['/profilo/timeline', 'Linea del tempo'],
];

for (const width of [390, 1280]) {
    test(`personal workspaces are four independent screens at ${width}px`, async () => {
        const { page, context, errors } = await fixture(width);
        try {
            for (const [path, title] of routes) {
                await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
                const workspace = page.getByRole('dialog', { name: title, exact: true });
                const back = workspace.getByRole('button', { name: 'Indietro', exact: true });
                const heading = workspace.getByRole('heading', { name: title, exact: true, level: 2 });
                await heading.waitFor();
                const [backBox, headingBox] = await Promise.all([back.boundingBox(), heading.boundingBox()]);
                assert.ok(backBox.x < headingBox.x, 'back stays to the left of the title');
                assert.equal(await back.evaluate(element => element === document.activeElement), true);
                assert.equal(await workspace.getByRole('tablist').count(), 0, 'there is no shared tools switcher');
                assert.equal(await workspace.getByRole('tab').count(), 0, 'other workspaces are not embedded');
                assert.equal(await workspace.getByRole('button', { name: 'Chiudi', exact: true }).count(), 0);
                assert.equal(new URL(page.url()).pathname, path);
                assert.equal(await page.title(), `${title} - CounselorBot`);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            }
            await page.screenshot({ path: `/tmp/personal-timeline-independent-${width}.png`, fullPage: true });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('an unsaved action asks before returning to the personal area', async () => {
    const { page, context, errors } = await fixture(1280);
    try {
        await page.goto(`${origin}/profilo/azioni`, { waitUntil: 'networkidle' });
        const workspace = page.getByRole('dialog', { name: 'Bacheca delle azioni', exact: true });
        await workspace.getByLabel('Azione', { exact: true }).fill('Attività non salvata');
        await workspace.getByRole('button', { name: 'Aggiungi azione', exact: true }).click();

        page.once('dialog', dialog => dialog.dismiss());
        await workspace.getByRole('button', { name: 'Indietro', exact: true }).click();
        assert.equal(new URL(page.url()).pathname, '/profilo/azioni');

        page.once('dialog', dialog => dialog.accept());
        await workspace.getByRole('button', { name: 'Indietro', exact: true }).click();
        await page.waitForURL('**/profilo');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
