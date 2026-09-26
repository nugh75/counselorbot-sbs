import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.RESULT_DISCLOSURE_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

for (const [lang, width, instrument] of [
    ['it', 1440, 'QSA'], ['it', 390, 'SAVICKAS'],
    ['en', 390, 'QSA'], ['es', 390, 'QSA'], ['fr', 390, 'QSA'],
    ['de', 390, 'QSA'], ['sv', 390, 'QSA'],
]) {
    test(`collapsing submission result hides details and conversation (${lang}, ${width}, ${instrument})`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addInitScript(lang => {
            localStorage.setItem('cb_lang', lang);
            localStorage.setItem('cb_theme', 'light');
        }, lang);
        const page = await context.newPage();
        const errors = [];
        const writes = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url()); });
        await page.route('**/api/**', async route => {
            const path = new URL(route.request().url()).pathname.slice(4);
            let data = [];
            if (path === '/auth/me') data = { authenticated: true, username: 'disclosure-test', name: 'Test', groups: ['studenti'], is_admin: false };
            else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
            else if (path === '/orientation/status') data = { required: false, completed: true };
            else if (path === '/tavolo/enabled') data = { enabled: false };
            else if (path === '/user/questionnaire-results') data = [{ id: 1, session_id: 'disclosure-fixture', questionnaire_type: instrument, scores: instrument === 'QSA' ? { C1: 7, C2: 3 } : null, submitted_at: '2026-09-25T10:00:00Z' }];
            else if (path.endsWith('/conversation')) data = [{ role: 'student', text: 'CONVERSATION_FIXTURE' }];
            else if (path.endsWith('/summary')) data = { summary: 'SUMMARY_FIXTURE' };
            else if (path === '/user/readings') data = null;
            else if (path === '/user/cross-synthesis/availability') data = { available: false };
            await route.fulfill({ json: data });
        });
        try {
            await page.goto(`${origin}/profilo/compilazioni`, { waitUntil: 'domcontentloaded' });
            const toggle = page.locator('#selected-session-details button');
            const content = page.locator('#submission-result-content');
            const summary = page.getByText('SUMMARY_FIXTURE', { exact: true });
            const conversation = page.getByText('CONVERSATION_FIXTURE', { exact: true });
            await summary.waitFor();
            await conversation.waitFor();
            assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
            assert.equal(await toggle.getAttribute('aria-controls'), await content.getAttribute('id'));
            assert.ok((await toggle.innerText()).trim());
            const chart = content.locator('.recharts-responsive-container');
            assert.equal(await chart.count(), instrument === 'QSA' ? 1 : 0);
            await toggle.click();
            await content.waitFor({ state: 'hidden' });
            assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
            assert.equal(await summary.isVisible(), false);
            assert.equal(await conversation.isVisible(), false);
            assert.equal(await summary.count(), 1, 'collapsed content stays mounted');
            assert.equal(await conversation.count(), 1, 'collapsed conversation stays mounted');
            await toggle.focus();
            await page.keyboard.press('Enter');
            await summary.waitFor();
            await conversation.waitFor();
            assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
            assert.equal(await summary.isVisible(), true);
            assert.equal(await conversation.isVisible(), true);
            if (instrument === 'QSA') assert.ok((await chart.boundingBox()).width > 0);
            await page.keyboard.press('Space');
            await content.waitFor({ state: 'hidden' });
            assert.equal(await conversation.isVisible(), false);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
            if (lang === 'it') await page.screenshot({ path: `/tmp/submission-result-collapsed-${width}.png`, fullPage: true });
            assert.deepEqual(errors, []);
            assert.deepEqual(writes, []);
        } finally {
            await context.close();
        }
    });
}
