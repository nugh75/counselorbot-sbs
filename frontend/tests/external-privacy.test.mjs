import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { externalPrivacyText } from '../src/lib/i18n-external-privacy.ts';

const origin = process.env.PRIVACY_BASE_URL || 'http://127.0.0.1:3135';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true }); });
after(async () => { await browser.close(); });
async function fixture({ lang = 'it', width = 1440, mode = 'local', forbidden = false, dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1100 } });
    await context.addInitScript(({ lang, dark }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { lang, dark });
    const page = await context.newPage(), writes = [], errors = [];
    const policy = { mode, local_model: 'qwen3:0.6b' };
    let fail = false;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'privacy-fixture', is_admin: !forbidden, is_researcher: forbidden, groups: forbidden ? ['researchers'] : [] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, setup_completed: true };
        else if (url.pathname === '/api/user/api-settings') data = { available: false };
        else if (url.pathname === '/api/user/chatgpt') data = { enabled: false };
        else if (url.pathname === '/api/admin/external-privacy') {
            if (forbidden) return route.fulfill({ status: 403, json: { detail: 'Forbidden' } });
            if (request.method() === 'PUT') {
                assert.equal(request.headers()['x-requested-with'], 'CounselorBot');
                writes.push(request.postDataJSON());
                if (fail) return route.fulfill({ status: 503, json: {} });
                policy.mode = request.postDataJSON().mode;
            }
            data = policy;
        } else if (url.pathname === '/api/admin/personal-api-policy') data = { enabled: false, encryption_ready: true };
        else if (url.pathname === '/api/admin/chatgpt/settings') data = { enabled: false, ready: true };
        return route.fulfill({ json: data });
    });
    return { page, context, policy, writes, errors, fail: () => { fail = true; } };
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) for (const width of [320, 1440]) {
    test(`explicit basic mode in ${lang} at ${width}px without changing it on page load`, async () => {
        const f = await fixture({ lang, width, dark: true });
        try {
            await f.page.goto(`${origin}/admin`);
            const panel = f.page.getByTestId('external-privacy-settings');
            const select = panel.getByLabel(externalPrivacyText(lang, 'mode'));
            await select.waitFor();
            assert.equal(await select.inputValue(), 'local'); assert.equal(f.writes.length, 0);
            await select.selectOption('basic');
            await panel.getByText(externalPrivacyText(lang, 'limits'), { exact: true }).waitFor();
            await panel.getByRole('button', { name: externalPrivacyText(lang, 'save'), exact: true }).click();
            await panel.getByText(externalPrivacyText(lang, 'saved'), { exact: true }).waitFor();
            assert.deepEqual(f.writes, [{ mode: 'basic' }]);
            assert.equal(await select.inputValue(), 'basic');
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await f.page.reload(); await panel.getByLabel(externalPrivacyText(lang, 'mode')).waitFor();
            assert.equal(await panel.getByLabel(externalPrivacyText(lang, 'mode')).inputValue(), 'basic');
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

test('a failed save preserves the previous active mode and the retryable choice', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/admin`);
        const panel = f.page.getByTestId('external-privacy-settings');
        await panel.getByLabel('Modalità di protezione').selectOption('basic'); f.fail();
        await panel.getByRole('button', { name: 'Salva protezione dei dati' }).click();
        await panel.getByText(externalPrivacyText('it', 'error'), { exact: true }).waitFor();
        assert.equal(f.policy.mode, 'local');
        assert.equal(await panel.getByLabel('Modalità di protezione').inputValue(), 'basic');
        assert.equal(await panel.getByRole('button', { name: 'Salva protezione dei dati' }).isDisabled(), false);
    } finally { await f.context.close(); }
});

test('researchers cannot see or change the privacy mode', async () => {
    const f = await fixture({ forbidden: true });
    try {
        const loaded = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/external-privacy');
        await f.page.goto(`${origin}/admin`); await loaded;
        await f.page.getByTestId('external-privacy-settings').waitFor({ state: 'hidden' });
        assert.equal(f.writes.length, 0);
        await f.page.goto(`${origin}/guide`);
        assert.equal(await f.page.locator('#guide-external-privacy').count(), 0);
    } finally { await f.context.close(); }
});

test('administrator guide explains the local-service block and shows the new settings', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/guide`);
        const section = f.page.locator('section[aria-labelledby="guide-external-privacy"]');
        await section.waitFor();
        assert.ok(await section.getByText(externalPrivacyText('it', 'guide'), { exact: true }).isVisible());
        assert.equal(await section.locator('img').count(), 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('existing custom configuration is preserved until an explicit save, guide screenshot is fake', async () => {
    const f = await fixture({ mode: 'custom' });
    try {
        await f.page.goto(`${origin}/admin`);
        const panel = f.page.getByTestId('external-privacy-settings');
        await panel.getByLabel('Modalità di protezione').waitFor();
        assert.equal(await panel.getByLabel('Modalità di protezione').inputValue(), 'custom');
        assert.equal(f.writes.length, 0);
        await panel.getByLabel('Modalità di protezione').selectOption('basic');
        await panel.getByRole('button', { name: 'Salva protezione dei dati' }).click();
        await panel.getByText(externalPrivacyText('it', 'saved'), { exact: true }).waitFor();
        if (process.env.PRIVACY_CAPTURE_GUIDE === '1') await panel.screenshot({ path: 'public/guide/protezione-dati.png' });
    } finally { await f.context.close(); }
});
