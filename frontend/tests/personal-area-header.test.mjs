import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';
import { personalAreaName, personalAreaText } from '../src/lib/i18n-personal-area.ts';
import { PRIVACY_DICTS } from '../src/lib/i18n-privacy.ts';

const origin = process.env.PERSONAL_HEADER_BASE_URL || 'http://127.0.0.1:3109';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

// The header fixture needs a signed-in student. Synthetic API responses keep the
// suite independent from the read-only preview proxy, whose demo fixtures lag
// behind the current app (runtime config and /api/user/access).
async function serveFixtureApis(page) {
    await page.route('**/runtime-config.js', route => route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        body: 'window.__COUNSELORBOT_CONFIG__={};',
    }));
    await page.route('**/api/**', route => {
        assert.equal(route.request().method(), 'GET', 'opening the orientation page never writes');
        const path = new URL(route.request().url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'personal-header-test', name: 'Persona di prova', email: 'test@example.test', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/access') data = { restricted: false, tool_keys: ['bussola'] };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/tavolo/enabled') data = { enabled: false };
        else if (path === '/api/orientation-directory') data = { institution: null, events: [], referrals: [] };
        return route.fulfill({ json: data });
    });
}
for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`orientation header: left return link, focus and responsive layout (${lang})`, async () => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
        const page = await context.newPage();
        const errors = []; const writes = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
        try {
            await serveFixtureApis(page);
            await page.goto(`${origin}/profilo/orientamento?preview=1#directory`, { waitUntil: 'domcontentloaded' });
            const header = page.locator('[data-personal-area-header]');
            await header.waitFor();
            assert.equal(await page.locator('main h1').count(), 1);
            assert.equal(await header.locator('h1').textContent(), personalAreaName(lang, 'orientamento'));
            const root = header.getByRole('link', { name: personalAreaText(lang, 'title'), exact: true });
            assert.equal(await root.getAttribute('href'), '/profilo');
            assert.equal(await header.getByRole('button').count(), 0);
            const crumbs = header.getByRole('navigation', { name: personalAreaText(lang, 'breadcrumbs'), exact: true });
            assert.equal(await crumbs.count(), 1);
            assert.equal(await crumbs.locator('[aria-current="page"]').textContent(), personalAreaName(lang, 'orientamento'));
            assert.equal(await header.getByRole('link').count(), 2);
            const privacy = header.getByRole('link', { name: PRIVACY_DICTS[lang]['privacy.title'], exact: true });
            assert.equal(await privacy.getAttribute('href'), '/privacy');
            await root.focus();
            assert.equal(await root.evaluate(el => el === document.activeElement), true);
            for (const [width, height] of [[320, 740], [390, 740], [1440, 900], [844, 390]]) {
                await page.setViewportSize({ width, height });
                await header.locator('svg[aria-hidden="true"]').first().waitFor({ state: 'visible' });
                const box = await root.boundingBox();
                assert.ok(box.height >= 44);
                assert.ok(box.x < width / 2, 'return link stays on the left');
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow ${width}`);
                if (lang === 'it') await page.screenshot({ path: `/tmp/personal-header-${width}.png` });
            }
            assert.equal(page.url(), `${origin}/profilo/orientamento?preview=1#directory`);
            await page.evaluate(() => document.documentElement.classList.add('dark'));
            if (lang === 'it') await page.screenshot({ path: '/tmp/personal-header-dark.png' });
            // An unrelated previous URL must not determine the root-link destination.
            await page.evaluate(() => history.pushState({ cbPreviousPage: '/guide' }, '', '/profilo/orientamento?preview=1'));
            await root.click(); await page.waitForURL(`${origin}/profilo`);
            await page.locator('[data-personal-area-home]').waitFor();
            assert.equal(await page.locator('[data-personal-area-header]').count(), 0);
            assert.deepEqual(errors, []); assert.deepEqual(writes, []);
        } finally { await context.close(); }
    });
}
test('public demo rejects writes and unlisted backend routes', async () => {
    const devPort = Number(new URL(origin).port);
    const previewPort = await freePort();
    const preview = `http://127.0.0.1:${previewPort}`;
    const child = spawn(process.execPath, ['scripts/personal-area-preview.mjs'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, PREVIEW_DEV_PORT: String(devPort), PREVIEW_PORT: String(previewPort) },
        stdio: 'ignore',
    });
    try {
        await waitForHttp(`${preview}/profilo/orientamento`);
        assert.equal((await fetch(`${preview}/api/user/learner-profile`, { method: 'PUT', body: '{}' })).status, 405);
        assert.equal((await fetch(`${preview}/api/admin/config`)).status, 404);
        assert.equal((await fetch(`${preview}/_next/image?url=%2Fapi%2Fadmin%2Fconfig&w=64&q=75`)).status, 403);
    } finally {
        child.kill('SIGTERM');
    }
});

async function freePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const { port } = server.address();
    await new Promise(resolve => server.close(resolve));
    return port;
}

async function waitForHttp(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try { await fetch(url); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    throw new Error(`preview proxy did not start on ${url}`);
}
