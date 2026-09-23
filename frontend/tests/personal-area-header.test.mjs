import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { personalAreaGroups } from '../src/lib/personal-area.ts';
import { personalAreaName, personalAreaText } from '../src/lib/i18n-personal-area.ts';

const origin = process.env.PERSONAL_HEADER_BASE_URL || 'http://127.0.0.1:3109';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });
for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`orientation header: grouped navigation, focus, filters and responsive layout (${lang})`, async () => {
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
            const directory = page.locator('main section[aria-label]').last();
            await directory.getByRole('button').nth(1).click();
            const filtered = await directory.innerText();
            const trigger = header.getByRole('button', { name: personalAreaText(lang, 'goTo'), exact: true });
            const nav = header.getByRole('navigation');
            await trigger.click();
            assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
            const close = nav.getByRole('button', { name: personalAreaText(lang, 'close'), exact: true });
            assert.equal(await close.evaluate(el => el === document.activeElement), true);
            assert.equal(await nav.getByRole('link').count(), 16);
            assert.equal(await nav.locator('img').count(), 17);
            assert.equal(await nav.getByRole('heading', { level: 3 }).count(), 5);
            assert.ok((await nav.locator('[aria-current="page"]').innerText()).includes(personalAreaText(lang, 'currentPage')));
            for (const group of personalAreaGroups) for (const slug of group.slugs) {
                if (slug !== 'orientamento') assert.equal(await nav.getByRole('link', { name: personalAreaName(lang, slug), exact: true }).getAttribute('href'), `/profilo/${slug}`);
            }
            await page.keyboard.press('Tab');
            assert.equal(await nav.getByRole('link').first().evaluate(el => el === document.activeElement), true);
            await page.keyboard.press('Escape');
            assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
            assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
            assert.equal(await directory.innerText(), filtered);
            assert.equal(page.url(), `${origin}/profilo/orientamento?preview=1#directory`);
            await trigger.click(); await close.click();
            assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
            await trigger.click(); await trigger.click();
            assert.equal(await nav.count(), 0);
            await trigger.click(); await header.locator('h1').click();
            assert.equal(await nav.count(), 0);
            await trigger.click(); await directory.getByRole('button').first().focus();
            assert.equal(await nav.count(), 0);
            await trigger.click(); await root.focus();
            assert.equal(await nav.count(), 0);
            for (const width of [320, 390, 1440]) {
                await page.setViewportSize({ width, height: 740 });
                await trigger.click();
                for (const img of await nav.locator('img').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(el => el.decode()); }
                await nav.evaluate(el => { el.scrollTop = 0; });
                const box = await nav.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 740, `panel fits ${width}`);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow ${width}`);
                if (lang === 'it') await page.screenshot({ path: `/tmp/personal-header-${width}.png` });
                await page.keyboard.press('Escape');
            }
            await page.evaluate(() => document.documentElement.classList.add('dark'));
            await page.setViewportSize({ width: 844, height: 390 });
            await trigger.click();
            const landscape = await nav.boundingBox();
            assert.ok(landscape.y + landscape.height <= 390, 'panel fits landscape mobile');
            if (lang === 'it') await page.screenshot({ path: '/tmp/personal-header-dark.png' });
            await page.keyboard.press('Escape');
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
