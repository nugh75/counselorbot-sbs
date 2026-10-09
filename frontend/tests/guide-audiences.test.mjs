import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { guideAudienceText } from '../src/lib/i18n-guide-audiences.ts';
import { forumText } from '../src/lib/i18n-forum.ts';
import { classSettingsText } from '../src/lib/i18n-class-settings.ts';

const origin = new URL(process.env.GUIDE_BASE_URL || 'http://127.0.0.1:3000').origin;
const evidenceDir = fileURLToPath(new URL('../.next/guide-audiences/', import.meta.url));
mkdirSync(evidenceDir, { recursive: true });
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
            // The audience selector is shown only to teachers, researchers and admins.
            return route.fulfill({ json: url.pathname === '/api/auth/me' ? { authenticated: true, username: 'teacher.demo', groups: ['docenti'], is_admin: false } : [] });
        });
        const l = key => guideAudienceText(lang, key);
        try {
            await page.goto(`${origin}/guide?audience=teacher#guide-teacher-section-5`, { waitUntil: 'networkidle' });
            const chooser = page.getByRole('navigation', { name: l('audience'), exact: true });
            const teacher = chooser.getByRole('link', { name: l('teacher'), exact: true });
            const student = chooser.getByRole('link', { name: l('student'), exact: true });
            assert.equal(await teacher.getAttribute('aria-current'), 'page');
            assert.equal(await page.locator('li[id^="guide-teacher-section-"]').count(), 8);
            assert.equal(await page.locator('li[id^="guide-section-"]').count(), 0);
            assert.equal(await page.locator('#guide-teacher-section-5 h2').innerText(), l('teacher5Title'));
            for (let n = 1; n <= 8; n++) {
                const section = page.locator(`#guide-teacher-section-${n}`);
                assert.ok((await section.locator('p').first().innerText()).length > 100);
                assert.ok(await section.locator('figure').count() > 0, `Missing screenshot: teacher section ${n}`);
                await page.locator(`a[href="#guide-teacher-section-${n}"]`).click();
                assert.equal(new URL(page.url()).hash, `#guide-teacher-section-${n}`);
            }
            const figures = page.locator('figure');
            assert.equal(await figures.count(), 16); // Institutes and credentials join the class and forum screenshots.
            const settings = page.locator('#guide-teacher-section-2');
            for (const key of ['teacherInstitutesBody', 'teacherInstituteCredentialsBody', 'classSettingsTeacher', 'classSettingsAccess', 'classSettingsCounselors', 'classSettingsHistory', 'classPathDistinction']) {
                assert.ok((await settings.innerText()).includes(l(key)), `Missing class guidance: ${key}`);
                if (lang !== 'en') assert.notEqual(l(key), guideAudienceText('en', key), `English placeholder: ${key}`);
            }
            assert.equal(await settings.locator('figure').count(), 6);
            assert.equal(await page.locator('#guide-admin-class-settings').count(), 0);
            const teacherForum = page.locator('#guide-teacher-section-8');
            assert.equal(await teacherForum.locator('h2').innerText(), l('teacher8Title'));
            assert.ok((await teacherForum.locator('p').first().innerText()).includes(forumText(lang, 'guideLinks')));
            assert.equal(await teacherForum.locator('a[href="/docente/classi"]').count(), 1);
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
            await page.screenshot({ path: `${evidenceDir}/guide-teacher-${lang}-${width}.png` });
            await student.focus(); await page.keyboard.press('Enter');
            await page.locator('#guide-section-15').waitFor({ state: 'attached' });
            assert.equal(new URL(page.url()).searchParams.get('audience'), 'student');
            // The explicit student view hides the audience selector.
            assert.equal(await chooser.getByRole('link').count(), 0);
            assert.equal(await page.locator('li[id^="guide-section-"]').count(), 16);
            assert.equal(await page.locator('#guide-section-15 p').innerText(), l('personalGroups'));
            assert.ok((await page.locator('#guide-section-4').innerText()).includes(l('classSettingsCounselors')));
            assert.ok((await page.locator('#guide-section-5').innerText()).includes(l('classSettingsAccess')));
            const studentForum = page.locator('#guide-section-16');
            assert.ok((await studentForum.locator('p').first().innerText()).includes(forumText(lang, 'guideLinks')));
            assert.equal(await studentForum.locator('figure').count(), 1);
            await page.reload({ waitUntil: 'networkidle' });
            await page.locator('#guide-section-16').waitFor({ state: 'attached' });
            assert.equal(await chooser.getByRole('link').count(), 0);
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

for (const [lang, width] of [['it', 1440], ['en', 390], ['es', 390], ['fr', 1440], ['de', 320], ['sv', 390]]) {
    test(`administrator class guide, real screenshots and read-only navigation in ${lang}`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const errors = []; const writes = [];
        page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'dark'); }, lang);
        await page.route('**/*', route => {
            const request = route.request(); const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (!url.pathname.startsWith('/api/')) return route.continue();
            if (request.method() !== 'GET') writes.push(url.pathname);
            return route.fulfill({ json: url.pathname === '/api/auth/me'
                ? { authenticated: true, username: 'admin.demo', groups: ['admins'], is_admin: true } : [] });
        });
        try {
            await page.goto(`${origin}/guide?audience=teacher#guide-admin-class-settings`, { waitUntil: 'networkidle' });
            const admin = page.locator('#guide-admin-class-settings');
            await admin.waitFor();
            const text = guideAudienceText(lang, 'classSettingsAdmin');
            assert.ok((await admin.innerText()).includes(text));
            if (lang !== 'en') assert.notEqual(text, guideAudienceText('en', 'classSettingsAdmin'));
            assert.equal(await admin.getByRole('link', { name: classSettingsText(lang, 'adminEdit'), exact: true }).getAttribute('href'), '/admin/classi');
            const figures = page.locator('#guide-teacher-section-2 figure');
            assert.equal(await figures.count(), 9); // Includes the institute credentials screenshot (#149).
            for (const key of ['adminClasses', 'adminEdit', 'audit']) {
                const figure = figures.filter({ has: page.getByRole('img', { name: classSettingsText(lang, key), exact: true }) });
                assert.equal(await figure.count(), 1);
                await figure.locator('img').scrollIntoViewIfNeeded();
                await figure.locator('img').evaluate(img => img.decode());
                await figure.getByRole('button').focus();
                await page.keyboard.press('Enter');
                const zoom = page.getByRole('dialog');
                await zoom.waitFor();
                await zoom.locator('img').evaluate(img => img.decode());
                await page.keyboard.press('Escape');
                assert.equal(await page.getByRole('dialog').count(), 0);
                assert.equal(await figure.getByRole('button').evaluate(el => el === document.activeElement), true);
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.equal(await page.locator('#guide-teacher-section-8 figure').count(), 1);
            assert.deepEqual(errors, []);
            assert.deepEqual(writes, []);
        } finally { await context.close(); }
    });
}
