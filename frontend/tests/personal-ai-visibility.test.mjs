import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { CHATGPT_DICTS } from '../src/lib/i18n-chatgpt.ts';
import { personalAPIText } from '../src/lib/i18n-personal-api.ts';

const origin = process.env.PERSONAL_API_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true }); });
after(async () => { await browser.close(); });

async function fixture({ role = 'student', api = false, chatgpt = false, lang = 'it', width = 390 } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(locale => localStorage.setItem('cb_lang', locale), lang);
    const page = await context.newPage();
    const flags = { api, chatgpt }, writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const apiPolicy = { enabled: false, encryption_ready: false, reason: 'notConfigured', key_source: 'managed' };
    const chatgptPolicy = { enabled: false, ready: false, reason: 'notConfigured', key_source: 'managed' };
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'visibility-fixture', is_admin: role === 'admin', groups: role === 'teacher' ? ['docenti'] : ['studenti'] };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/user/api-settings') data = { available: flags.api, providers: ['openai'], configured: false, provider: 'openai', model: '', enabled: false, active: false };
        else if (path === '/api/user/chatgpt') data = { enabled: flags.chatgpt, available: flags.chatgpt, reason: flags.chatgpt ? null : 'disabled', connected: false, use_subscription: false, models: [], pending_link: false };
        else if (path === '/api/admin/personal-api-policy' || path === '/api/admin/chatgpt/settings') {
            const policy = path.includes('chatgpt') ? chatgptPolicy : apiPolicy;
            if (request.method() === 'PUT') {
                assert.equal(request.headers()['x-requested-with'], 'CounselorBot');
                writes.push({ path, ...request.postDataJSON() });
                Object.assign(policy, { enabled: request.postDataJSON().enabled, reason: null, ...(path.includes('chatgpt') ? { ready: true } : { encryption_ready: true }) });
            }
            data = policy;
        }
        return route.fulfill({ json: data });
    });
    return { page, context, flags, writes, errors };
}

for (const role of ['student', 'teacher']) {
    for (const [api, chatgpt] of [[false, false], [true, false], [false, true], [true, true]]) {
        test(`${role}: only enabled personal connection entries appear (API=${api}, ChatGPT=${chatgpt})`, async () => {
            const f = await fixture({ role, api, chatgpt });
            const area = role === 'teacher' ? 'docente' : 'profilo';
            try {
                const loaded = Promise.all(['/api/user/api-settings', '/api/user/chatgpt'].map(path => f.page.waitForResponse(r => new URL(r.url()).pathname === path)));
                await f.page.goto(`${origin}/${area}`); await loaded;
                for (const [visible, path] of [[api, 'api-personali'], [chatgpt, 'chatgpt']]) {
                    const entry = f.page.locator(`[data-testid="personal-ai-connections"] a[href="/${area}/${path}"]`);
                    await entry.waitFor({ state: visible ? 'visible' : 'hidden' });
                    assert.equal(await entry.count(), visible ? 1 : 0);
                    if (!visible) {
                        await f.page.goto(`${origin}/${area}/${path}`);
                        await f.page.waitForURL(`${origin}/${area}`);
                        assert.equal(await f.page.locator('#personal-key, #chatgpt-model, [data-testid="chatgpt-link"]').count(), 0);
                    }
                }
                if (chatgpt) {
                    await f.page.locator(`[data-testid="personal-ai-connections"] a[href="/${area}/chatgpt"]`).click();
                    await f.page.getByRole('heading', { name: 'Il tuo abbonamento ChatGPT', exact: true }).waitFor();
                }
                const guideLoaded = Promise.all(['/api/user/api-settings', '/api/user/chatgpt'].map(path => f.page.waitForResponse(r => new URL(r.url()).pathname === path)));
                await f.page.goto(`${origin}/guide`); await guideLoaded;
                await f.page.locator('#guide-personal-api').waitFor({ state: api ? 'visible' : 'hidden' });
                await f.page.locator('#guide-chatgpt').waitFor({ state: chatgpt ? 'visible' : 'hidden' });
                if (chatgpt) assert.equal(await f.page.locator('#guide-chatgpt a').getAttribute('href'), `/${area}/chatgpt`);
                assert.deepEqual(f.errors, []);
            } finally { await f.context.close(); }
        });
    }
    test(`${role}: administrative disable hides both entries when returning to the tab`, async () => {
        const f = await fixture({ role, api: true, chatgpt: true });
        const area = role === 'teacher' ? 'docente' : 'profilo';
        try {
            await f.page.goto(`${origin}/${area}`);
            await f.page.getByTestId('personal-ai-connections').waitFor();
            f.flags.api = false; f.flags.chatgpt = false;
            await f.page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await f.page.getByTestId('personal-ai-connections').waitFor({ state: 'hidden' });
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    for (const width of [390, 1440]) {
        test(`admin can enable both functions without preconfigured keys in ${lang} at ${width}px`, async () => {
            const f = await fixture({ role: 'admin', lang, width });
            try {
                await f.page.goto(`${origin}/admin`);
                const api = f.page.getByTestId('personal-api-settings');
                const toggle = api.getByRole('checkbox');
                await toggle.waitFor();
                assert.equal(await toggle.isDisabled(), false);
                await api.getByText(personalAPIText(lang, 'automatic'), { exact: true }).waitFor();
                assert.equal((await api.textContent()).includes('PERSONAL_API_ENCRYPTION_KEY'), false);
                await toggle.check();
                await api.getByText(personalAPIText(lang, 'protected'), { exact: true }).waitFor();
                const chatgpt = f.page.getByTestId('chatgpt-settings');
                await chatgpt.getByRole('button', { name: CHATGPT_DICTS[lang]['chatgpt.admin.enable'], exact: true }).click();
                await chatgpt.getByText(CHATGPT_DICTS[lang]['chatgpt.admin.enabled'], { exact: true }).waitFor();
                assert.equal(f.writes.length, 2);
                assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                assert.deepEqual(f.errors, []);
                if (lang === 'it') await api.screenshot({ path: `/tmp/personal-api-admin-${width}.png` });
            } finally { await f.context.close(); }
        });
    }
}
