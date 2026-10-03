import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium } from 'playwright';
import { CHATGPT_DICTS } from '../src/lib/i18n-chatgpt.ts';

const origin = process.env.CHATGPT_TEST_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true }); });
after(async () => { await browser.close(); });

async function fixture(language, width, administrator = true) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.addInitScript(lang => localStorage.setItem('cb_lang', lang), language);
    const page = await context.newPage();
    const settings = { enabled: false, ready: false, reason: 'notConfigured', key_source: 'managed' };
    const writes = [], errors = [];
    let failure = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: administrator, is_researcher: !administrator, groups: administrator ? ['admins'] : ['researchers'] };
        if (path === '/api/admin/config') data = [{ key: 'active_provider', value: 'ollama', description: '' }];
        if (path === '/api/admin/config/env-status') data = {};
        if (path === '/api/admin/chatgpt/settings') {
            if (!administrator) return route.fulfill({ status: 403, json: { detail: 'chatgpt.errors.adminOnly' } });
            if (request.method() === 'PUT') {
                assert.equal(request.headers()['x-requested-with'], 'CounselorBot');
                assert.equal(request.headers()['x-counselorbot-language'], language);
                writes.push(request.postDataJSON());
                if (failure) return route.fulfill({ status: 503, json: { detail: 'chatgpt.errors.notConfigured' } });
                settings.enabled = request.postDataJSON().enabled;
                settings.ready = true; settings.reason = null;
            }
            data = settings;
        }
        if (path === '/api/user/chatgpt') data = { available: settings.enabled, reason: settings.enabled ? null : 'disabled', connected: false, use_subscription: false, models: [] };
        return route.fulfill({ json: data });
    });
    return { page, context, settings, writes, errors, fail: value => { failure = value; } };
}

for (const language of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    for (const width of [390, 1440]) {
        test(`admin enables ChatGPT immediately without code in ${language} at ${width}px`, async () => {
            const f = await fixture(language, width);
            const t = key => CHATGPT_DICTS[language]['chatgpt.' + key];
            try {
                await f.page.goto(origin + '/admin');
                const panel = f.page.getByTestId('chatgpt-settings');
                await panel.getByRole('heading', { name: t('admin.title') }).waitFor();
                await panel.getByText(t('admin.disabled'), { exact: true }).waitFor();
                assert.equal(f.writes.length, 0);
                await panel.getByRole('button', { name: t('admin.enable'), exact: true }).click();
                await panel.getByText(t('admin.saved'), { exact: true }).waitFor();
                await panel.getByText(t('admin.enabled'), { exact: true }).waitFor();
                assert.deepEqual(f.writes, [{ enabled: true }]);
                assert.equal(await panel.locator('code, input[type=password], textarea').count(), 0);
                assert.equal(await panel.getByRole('link', { name: t('admin.personal') }).getAttribute('href'), '/profilo#chatgpt');
                if (language === 'it') await panel.screenshot({ path: `/tmp/chatgpt-admin-${width}.png` });
                await panel.getByRole('link', { name: t('admin.personal') }).click();
                await f.page.locator('#chatgpt').getByRole('button', { name: t('connect'), exact: true }).waitFor();
                await f.page.goto(origin + '/admin');
                await panel.getByText(t('admin.enabled'), { exact: true }).waitFor();
                await panel.getByRole('button', { name: t('admin.disable'), exact: true }).click();
                await panel.getByText(t('admin.disabled'), { exact: true }).waitFor();
                assert.deepEqual(f.writes, [{ enabled: true }, { enabled: false }]);
                assert.equal(await panel.getByRole('link', { name: t('admin.personal') }).count(), 0);
                f.fail(true);
                await panel.getByRole('button', { name: t('admin.enable'), exact: true }).click();
                await panel.getByRole('alert').getByText(t('errors.notConfigured'), { exact: true }).waitFor();
                await panel.getByText(t('admin.disabled'), { exact: true }).waitFor();
                assert.equal(f.settings.enabled, false);
                assert.equal(await panel.getByText(t('admin.saved'), { exact: true }).count(), 0);
                assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
                assert.deepEqual(f.errors, []);
            } finally { await f.context.close(); }
        });
    }
}

test('researcher cannot see the installation activation control', async () => {
    const f = await fixture('it', 390, false);
    try {
        const denied = f.page.waitForResponse(response => response.url().endsWith('/api/admin/chatgpt/settings') && response.status() === 403);
        await f.page.goto(origin + '/admin');
        await denied;
        await f.page.getByTestId('chatgpt-settings').waitFor({ state: 'hidden' });
        assert.equal(await f.page.getByRole('button', { name: CHATGPT_DICTS.it['chatgpt.admin.enable'], exact: true }).count(), 0);
        assert.equal(f.writes.length, 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
