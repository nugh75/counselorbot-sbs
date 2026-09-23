import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { personalAreaName, personalAreaText } from '../src/lib/i18n-personal-area.ts';

const origin = process.env.PERSONAL_HEADER_BASE_URL || 'http://127.0.0.1:3109';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });
for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`orientation header: left return link, focus and responsive layout (${lang})`, async () => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
        const page = await context.newPage();
        const errors = []; const writes = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
        try {
            await page.goto(`${origin}/profilo/orientamento?preview=1#directory`, { waitUntil: 'domcontentloaded' });
            const header = page.locator('[data-personal-area-header]');
            await header.waitFor();
            assert.equal(await page.locator('main h1').count(), 1);
            assert.equal(await header.locator('h1').textContent(), personalAreaName(lang, 'orientamento'));
            const root = header.getByRole('link', { name: personalAreaText(lang, 'title'), exact: true });
            assert.equal(await root.getAttribute('href'), '/profilo');
            assert.equal(await header.getByRole('button').count(), 0);
            assert.equal(await header.getByRole('navigation').count(), 0);
            assert.equal(await header.getByRole('link').count(), 1);
            await root.focus();
            assert.equal(await root.evaluate(el => el === document.activeElement), true);
            for (const [width, height] of [[320, 740], [390, 740], [1440, 900], [844, 390]]) {
                await page.setViewportSize({ width, height });
                await header.locator('img').evaluate(el => el.decode());
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
    assert.equal((await fetch(`${origin}/api/user/learner-profile`, { method: 'PUT', body: '{}' })).status, 405);
    assert.equal((await fetch(`${origin}/api/admin/config`)).status, 404);
    assert.equal((await fetch(`${origin}/_next/image?url=%2Fapi%2Fadmin%2Fconfig&w=64&q=75`)).status, 403);
});
