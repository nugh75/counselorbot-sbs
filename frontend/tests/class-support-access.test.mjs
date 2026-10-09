import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { classSettingsText } from '../src/lib/i18n-class-settings.ts';

const origin = new URL(process.env.CLASS_SUPPORT_BASE_URL || 'http://127.0.0.1:3172').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({ keys = ['QSA'], width = 1440, groups = ['studenti'], restricted = true, required = false, lang = 'en' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'support.fixture', name: 'Test student', groups, is_admin: false };
        if (url.pathname === '/api/user/access') data = { restricted, tool_keys: keys, class_ids: [1], counselor_ids: null, default_counselor_id: null };
        if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        if (url.pathname === '/api/orientation/status') data = { eligible: true, required, completed: false, legacy_exempt: false };
        if (url.pathname === '/api/counselors') data = [{ id: 1, name: 'Clio', slug: 'clio', is_active: true, suitable: true, questionnaire_types: ['QSA'] }];
        if (url.pathname === '/api/user/learner-profile') data = { created_at: '2026-10-09T08:00:00Z', profile: {} };
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

for (const width of [390, 1440]) {
    test(`Disabled Compass and Assistant disappear from header and menu at ${width}px`, async () => {
        const f = await fixture({ width });
        try {
            await f.page.goto(`${origin}/?view=questionnaires`, { waitUntil: 'domcontentloaded' });
            await f.page.locator('header').getByRole('button', { name: 'Menu', exact: true }).click();
            assert.equal(await f.page.locator('header a[href="/bussola"]').count(), 0);
            assert.equal(await f.page.locator('header a[href="/assistente"]').count(), 0);
            assert.ok(await f.page.locator('header a[href="/guide"]').count() > 0);
            assert.equal(await f.page.getByTestId('compass-entry').count(), 0);
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

for (const keys of [['QSA', 'bussola'], ['QSA', 'assistant'], ['QSA', 'bussola', 'assistant']]) {
    test(`Support toggles are independent: ${keys.join(', ')}`, async () => {
        const f = await fixture({ keys });
        try {
            await f.page.goto(`${origin}/?view=home`, { waitUntil: 'domcontentloaded' });
            await f.page.locator('header').getByRole('button', { name: 'Menu', exact: true }).waitFor();
            await f.page.locator('header a[href="/guide"]').first().waitFor();
            // Access is ready when the catalog has rendered its enabled tool.
            await f.page.getByRole('heading', { name: 'Activities and paths', exact: true }).waitFor();
            assert.equal(await f.page.locator('header a[href="/bussola"]').count() > 0, keys.includes('bussola'));
            assert.equal(await f.page.locator('header a[href="/assistente"]').count() > 0, keys.includes('assistant'));
        } finally { await f.context.close(); }
    });
}

test('A student with Compass disabled reaches the catalog without an orientation redirect', async () => {
    const f = await fixture({ required: false });
    try {
        await f.page.goto(`${origin}/?view=home`, { waitUntil: 'domcontentloaded' });
        await f.page.getByRole('heading', { name: 'Activities and paths', exact: true }).waitFor();
        assert.equal(new URL(f.page.url()).pathname, '/');
        assert.equal(await f.page.locator('a[href^="/bussola"]').count(), 0);
        await f.page.goto(`${origin}/?view=intro`, { waitUntil: 'domcontentloaded' });
        await f.page.getByTestId('intro-screen').waitFor();
        assert.equal(await f.page.getByRole('button', { name: 'Open the Compass', exact: true }).count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('Direct Assistant navigation shows class access denial without a composer', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/assistente`, { waitUntil: 'domcontentloaded' });
        await f.page.getByRole('heading', { name: 'Assistant not available' }).waitFor();
        assert.equal(await f.page.locator('textarea').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('An existing Compass session is readable after disabling, without resuming writes or disabled cards', async () => {
    const f = await fixture({ keys: ['QSAr'] });
    const writes = [];
    try {
        await f.page.route('**/api/orientation/**', route => {
            const request = route.request();
            const url = new URL(request.url());
            if (request.method() === 'POST') writes.push(url.pathname);
            if (url.pathname.endsWith('/status')) return route.fulfill({ json: {
                required: false, completed: false, latest_session_id: 'readable', in_progress_session_id: 'readable',
            } });
            return route.fulfill({ json: {
                session_id: 'readable', status: 'in_progress', language: 'en', counselor_id: null,
                messages: [{ role: 'assistant', content: 'Your saved Compass conversation.' }],
                recommendations: [{ id: 'QSA', reason: 'An old disabled choice' }, { id: 'QSAr', reason: 'An enabled choice' }],
            } });
        });
        await f.page.goto(`${origin}/bussola`, { waitUntil: 'domcontentloaded' });
        await f.page.getByRole('button', { name: 'Review the latest orientation' }).click();
        await f.page.getByRole('log').getByText('Your saved Compass conversation.').waitFor();
        assert.equal(await f.page.locator('#bussola-composer').count(), 0);
        assert.equal(await f.page.getByRole('button', { name: 'Start a new orientation', exact: true }).count(), 0);
        assert.equal(await f.page.locator('#orientation-recommendations').getByRole('heading', { name: /\bQSA\b/ }).count(), 0);
        assert.deepEqual(writes, []);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`The guide explains support availability and keeps screenshots readable in ${lang}`, async () => {
        const f = await fixture({ lang, groups: ['docenti'], restricted: false, keys: ['bussola', 'assistant'], width: 390 });
        try {
            await f.page.goto(`${origin}/guide?audience=teacher`, { waitUntil: 'domcontentloaded' });
            await f.page.getByText(classSettingsText(lang, 'supportGuide'), { exact: false }).waitFor();
            await f.page.goto(`${origin}/guide?audience=student`, { waitUntil: 'domcontentloaded' });
            await f.page.getByText(classSettingsText(lang, 'studentSupportGuide'), { exact: false }).waitFor();
            for (const image of await f.page.locator('figure img').all()) {
                await image.scrollIntoViewIfNeeded();
                await image.evaluate(img => img.decode());
            }
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}
