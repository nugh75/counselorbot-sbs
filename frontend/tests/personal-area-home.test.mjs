import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { personalAreaGroups, personalAreaImages } from '../src/lib/personal-area.ts';
import { personalAreaName, personalAreaText, personalAreaDescription } from '../src/lib/i18n-personal-area.ts';

const origin = process.env.PERSONAL_AREA_BASE_URL || 'http://127.0.0.1:3000';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const workspace = { actions: [{ id: 'target', title: 'Azione da riprendere', detail: '', reflection: '', source: '', stage: 'todo' }], cards: [], comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' }, timeline: { title: '', events: [] } };
const goals = [{ id: 1, title: 'Obiettivo di prova', status: 'active', review_date: null, links: [{ kind: 'action', target_id: 'target', title: 'Azione da riprendere', available: true, stage: 'todo', href: '/profilo/azioni' }] }];
async function fixture(lang = 'it', populated = false) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; const requests = []; let fail = false;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        requests.push([route.request().method(), path]);
        assert.equal(route.request().method(), 'GET', 'opening the personal area never writes');
        if (fail && path === '/api/user/goals') return route.fulfill({ status: 503, json: { detail: 'unavailable' } });
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'personal-area-test', name: 'Persona di prova', email: 'test@example.test', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/tavolo/enabled') data = { enabled: false };
        else if (path === '/api/user/goals') data = populated ? goals : [];
        else if (path === '/api/user/assignments') data = populated ? [1, 2, 3, 4].map(id => ({ id, snapshot: { title: `Consegna ${id}` }, due_date: null })) : [];
        else if (path === '/api/user/timeline') data = { revision: 1, workspace };
        return route.fulfill({ json: data });
    });
    return { page, context, errors, requests, fail: value => { fail = value; } };
}
for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`illustrated personal entry: all destinations, responsive and accessible in ${lang}`, async () => {
        const f = await fixture(lang);
        try {
            await f.page.goto(`${origin}/profilo`, { waitUntil: 'networkidle' });
            const home = f.page.locator('[data-personal-area-home]');
            await home.waitFor();
            assert.equal(await home.getByRole('navigation').count(), 5);
            assert.equal(await home.getByRole('link').count(), 16);
            assert.equal(await f.page.getByRole('region', { name: personalAreaText(lang, 'resume'), exact: true }).count(), 0);
            assert.ok(!f.requests.some(([, path]) => path === '/api/user/questionnaire-results'));
            for (const group of personalAreaGroups) {
                const nav = home.getByRole('navigation', { name: personalAreaText(lang, group.id), exact: true });
                for (const slug of group.slugs) {
                    const link = nav.getByRole('link', { name: personalAreaName(lang, slug), exact: true });
                    assert.equal(await link.getAttribute('href'), `/profilo/${slug}`);
                    assert.ok((await link.innerText()).includes(personalAreaDescription(lang, slug)));
                    assert.equal(await link.locator('img').getAttribute('alt'), '');
                    assert.ok((await link.locator('img').getAttribute('src')).includes(encodeURIComponent(personalAreaImages[slug])));
                }
            }
            for (const img of await home.locator('img').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(el => el.decode()); }
            for (const width of [320, 390, 1440]) {
                await f.page.setViewportSize({ width, height: 900 });
                await home.scrollIntoViewIfNeeded();
                const firstNav = home.getByRole('navigation').first();
                const links = firstNav.getByRole('link');
                const first = await links.nth(0).boundingBox(); const second = await links.nth(1).boundingBox();
                assert.ok(first.height >= 44);
                if (width < 768) assert.ok(second.y > first.y && second.x === first.x, 'mobile uses one column');
                else assert.ok(second.x > first.x && second.y === first.y, 'desktop uses two columns');
                assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
                if (lang === 'it') {
                    await f.page.evaluate(() => window.scrollTo(0, 0));
                    await f.page.screenshot({ path: `/tmp/personal-area-approved-${width}.png`, fullPage: true });
                }
            }
            const firstLink = home.getByRole('link').first();
            await firstLink.focus(); await f.page.keyboard.press('Tab');
            assert.equal(await home.getByRole('link').nth(1).evaluate(el => el === document.activeElement), true);
            await f.page.evaluate(() => document.documentElement.classList.add('dark'));
            await f.page.setViewportSize({ width: 390, height: 900 });
            for (const img of await home.locator('img').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(el => el.decode()); }
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            if (lang === 'it') { await f.page.evaluate(() => window.scrollTo(0, 0)); await f.page.screenshot({ path: '/tmp/personal-area-approved-dark.png', fullPage: true }); }
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}
test('overview is bounded, handles partial failure and retry, and focuses the linked action', async () => {
    const f = await fixture('it', true);
    try {
        f.fail(true);
        await f.page.goto(`${origin}/profilo`, { waitUntil: 'networkidle' });
        const resume = f.page.getByRole('region', { name: 'Da riprendere', exact: true });
        await resume.getByRole('alert').waitFor();
        assert.equal(await f.page.locator('[data-personal-area-home] nav a').count(), 16);
        assert.equal(await resume.getByRole('link').count(), 3);
        f.fail(false); await resume.getByRole('button', { name: 'Riprova' }).click();
        await resume.getByRole('alert').waitFor({ state: 'detached' });
        assert.equal(await resume.getByRole('link').count(), 3);
        await resume.getByRole('link', { name: /Azione da riprendere/ }).click();
        await f.page.waitForURL('**/profilo/azioni#action-target');
        await f.page.waitForFunction(() => document.activeElement?.id === 'action-target');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('a pending overview request never blocks the illustrated navigation', async () => {
    const f = await fixture();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await f.page.route('**/api/user/goals', async route => { await gate; await route.fulfill({ json: [] }); });
    try {
        await f.page.goto(`${origin}/profilo`, { waitUntil: 'domcontentloaded' });
        await f.page.locator('[data-personal-area-home] nav').first().waitFor();
        assert.equal(await f.page.locator('[data-personal-area-home] nav a').count(), 16);
        await f.page.getByRole('status').filter({ hasText: 'Caricamento del riepilogo' }).waitFor();
        release();
        await f.page.getByRole('region', { name: 'Da riprendere', exact: true }).waitFor({ state: 'detached' });
        assert.deepEqual(f.errors, []);
    } finally { release(); await f.context.close(); }
});
