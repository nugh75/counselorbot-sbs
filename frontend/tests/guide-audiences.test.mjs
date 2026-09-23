import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { guideAudienceText } from '../src/lib/i18n-guide-audiences.ts';

const origin = new URL(process.env.GUIDE_BASE_URL || 'http://127.0.0.1:3000').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

for (const [lang, width, dark] of [['it', 1440, false], ['en', 390, false], ['es', 390, true], ['fr', 1440, false], ['de', 320, true], ['sv', 390, false]]) {
    test(`public guide audience links, screenshots and keyboard at ${width}px in ${lang}`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = []; const writes = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(({ lang, dark }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { lang, dark });
        await page.route('**/*', route => {
            const request = route.request(); const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (!url.pathname.startsWith('/api/')) return route.continue();
            if (request.method() !== 'GET') writes.push(url.pathname);
            return route.fulfill({ json: url.pathname === '/api/auth/me' ? { authenticated: false, groups: [], is_admin: false } : [] });
        });
        const l = key => guideAudienceText(lang, key);
        try {
            await page.goto(`${origin}/guide?audience=teacher#guide-teacher-section-5`, { waitUntil: 'networkidle' });
            const chooser = page.getByRole('navigation', { name: l('audience'), exact: true });
            const teacher = chooser.getByRole('link', { name: l('teacher'), exact: true });
            const student = chooser.getByRole('link', { name: l('student'), exact: true });
            assert.equal(await teacher.getAttribute('aria-current'), 'page');
            assert.equal(await page.locator('li[id^="guide-teacher-section-"]').count(), 7);
            assert.equal(await page.locator('li[id^="guide-section-"]').count(), 0);
            assert.equal(await page.locator('#guide-teacher-section-5 h2').innerText(), l('teacher5Title'));
            for (let n = 1; n <= 7; n++) {
                const section = page.locator(`#guide-teacher-section-${n}`);
                assert.ok((await section.locator('p').innerText()).length > 100);
                assert.ok(await section.locator('figure').count() > 0, `Missing screenshot: teacher section ${n}`);
                await page.locator(`a[href="#guide-teacher-section-${n}"]`).click();
                assert.equal(new URL(page.url()).hash, `#guide-teacher-section-${n}`);
            }
            const figures = page.locator('figure');
            assert.equal(await figures.count(), 8);
            for (const figure of await figures.all()) {
                const thumbnail = figure.locator('img');
                await thumbnail.scrollIntoViewIfNeeded();
                await thumbnail.evaluate(img => img.decode());
                assert.ok(await thumbnail.getAttribute('alt'));
                const trigger = figure.getByRole('button');
                await trigger.focus(); await page.keyboard.press('Enter');
                const zoom = page.getByRole('dialog');
                await zoom.waitFor();
                await zoom.locator('img').evaluate(img => img.decode());
                await page.keyboard.press('Tab');
                assert.equal(await zoom.getByRole('button').evaluate(el => el === document.activeElement), true);
                // Clickable close button must stay above the full-screen image.
                await zoom.getByRole('button').click();
                assert.equal(await page.getByRole('dialog').count(), 0);
                assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await teacher.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `/tmp/guide-teacher-${lang}-${width}.png` });
            await student.focus(); await page.keyboard.press('Enter');
            await page.locator('#guide-section-15').waitFor({ state: 'attached' });
            assert.equal(new URL(page.url()).searchParams.get('audience'), 'student');
            assert.equal(await student.getAttribute('aria-current'), 'page');
            assert.equal(await page.locator('#guide-section-15 p').innerText(), l('personalGroups'));
            await page.reload({ waitUntil: 'networkidle' });
            assert.equal(await student.getAttribute('aria-current'), 'page');
            await page.goBack({ waitUntil: 'networkidle' });
            await page.locator('#guide-teacher-section-1').waitFor({ state: 'attached' });
            assert.equal(await teacher.getAttribute('aria-current'), 'page');
            await page.goto(`${origin}/guide?audience=unknown`, { waitUntil: 'networkidle' });
            assert.equal(await student.getAttribute('aria-current'), 'page');
            assert.deepEqual(errors, []);
            assert.deepEqual(writes, []);
        } finally { await context.close(); }
    });
}
