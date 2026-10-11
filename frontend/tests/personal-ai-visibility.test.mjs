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
    const flags = { api, chatgpt }, writes = [], errors = [], audienceWrites = [];
    const audiences = { api: { teachers: true, students: true }, chatgpt: { teachers: true, students: true } };
    page.on('pageerror', error => errors.push(error.message));
    const apiPolicy = { enabled: false, encryption_ready: false, reason: 'notConfigured', key_source: 'managed' };
    const chatgptPolicy = { enabled: false, ready: false, reason: 'notConfigured', key_source: 'managed' };
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'visibility-fixture', is_admin: role === 'admin', groups: role === 'teacher' ? ['docenti'] : ['studenti'] };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/admin/external-privacy') data = { mode: 'local', local_model: 'qwen3:0.6b' };
        else if (path === '/api/user/api-connections') data = { available: flags.api || flags.chatgpt, api_enabled: flags.api, chatgpt_enabled: flags.chatgpt, chatgpt_models: [], providers: ['openai'], enabled: false, connections: [], bindings: [], counselors: [], default_connection_id: null, default_chatgpt_model: null };
        else if (path === '/api/user/api-settings') data = { available: flags.api, providers: ['openai'], configured: false, provider: 'openai', model: '', enabled: false, active: false };
        else if (path === '/api/user/chatgpt') data = { enabled: flags.chatgpt, available: flags.chatgpt, reason: flags.chatgpt ? null : 'disabled', connected: false, use_subscription: false, models: [], pending_link: false };
        else if (path === '/api/admin/personal-ai-audiences') {
            if (request.method() === 'PUT') { audienceWrites.push(request.postDataJSON()); Object.assign(audiences, request.postDataJSON()); }
            data = audiences;
        }
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
    return { page, context, flags, writes, errors, audienceWrites };
}

for (const role of ['student', 'teacher']) {
    for (const [api, chatgpt] of [[false, false], [true, false], [false, true], [true, true]]) {
        test(`${role}: only enabled personal connection entries appear (API=${api}, ChatGPT=${chatgpt})`, async () => {
            const f = await fixture({ role, api, chatgpt });
            const area = role === 'teacher' ? 'docente' : 'profilo';
            try {
                const loaded = Promise.all(['/api/user/api-settings', '/api/user/chatgpt'].map(path => f.page.waitForResponse(r => new URL(r.url()).pathname === path)));
                await f.page.goto(`${origin}/${area}`); await loaded;
                // #200: one entry, shown when either personal source is enabled.
                const entry = f.page.locator(`[data-testid="personal-ai-connections"] a[href="/${area}/api-personali"]`);
                await entry.waitFor({ state: api || chatgpt ? 'visible' : 'hidden' });
                assert.equal(await f.page.locator(`[data-testid="personal-ai-connections"] a`).count(), api || chatgpt ? 1 : 0);
                if (!api && !chatgpt) {
                    for (const path of ['api-personali', 'chatgpt']) {
                        await f.page.goto(`${origin}/${area}/${path}`);
                        await f.page.waitForURL(`${origin}/${area}`);
                        assert.equal(await f.page.locator('#personal-key, [data-testid="chatgpt-link"]').count(), 0);
                    }
                } else {
                    await entry.click();
                    await f.page.locator('#personal-default-connection').waitFor();
                    assert.equal(await f.page.getByRole('heading', { name: 'Il tuo abbonamento ChatGPT', exact: true }).count(), chatgpt ? 1 : 0);
                    assert.equal(await f.page.getByRole('button', { name: 'Aggiungi connessione', exact: true }).count(), api ? 1 : 0);
                }
                const guideLoaded = Promise.all(['/api/user/api-settings', '/api/user/chatgpt'].map(path => f.page.waitForResponse(r => new URL(r.url()).pathname === path)));
                await f.page.goto(`${origin}/guide`); await guideLoaded;
                await f.page.locator('#guide-personal-api').waitFor({ state: api ? 'visible' : 'hidden' });
                await f.page.locator('#guide-chatgpt').waitFor({ state: chatgpt ? 'visible' : 'hidden' });
                if (chatgpt) assert.equal(await f.page.locator('#guide-chatgpt a').getAttribute('href'), `/${area}/api-personali#chatgpt`);
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
                // #ai-admin: the switches live on the "APIs and ChatGPT" page, open to admins even with both off.
                await f.page.goto(`${origin}/profilo/api-personali`);
                await f.page.locator('#ai-admin').waitFor();
                const api = f.page.getByTestId('personal-api-settings');
                const toggle = api.getByRole('checkbox', { name: personalAPIText(lang, 'adminToggle'), exact: true });
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

test('admin switches teachers and students independently for each feature', async () => {
    const f = await fixture({ role: 'admin', lang: 'it', width: 390 });
    try {
        await f.page.goto(`${origin}/profilo/api-personali`);
        const api = f.page.getByTestId('personal-api-settings');
        await api.getByRole('checkbox', { name: personalAPIText('it', 'adminToggle'), exact: true }).check();
        const switches = f.page.getByTestId('audience-api');
        await switches.getByRole('checkbox', { name: personalAPIText('it', 'audienceShareApi'), exact: true }).waitFor({ state: 'attached' }).catch(() => {});
        await switches.getByRole('checkbox', { name: personalAPIText('it', 'audienceStudentsApi'), exact: true }).uncheck();
        for (let i = 0; i < 100 && f.audienceWrites.length < 1; i++) await f.page.waitForTimeout(100);
        assert.deepEqual(f.audienceWrites, [{ api: { teachers: true, students: false } }]);
        assert.equal(await switches.getByRole('checkbox', { name: personalAPIText('it', 'audienceTeachersApi'), exact: true }).isChecked(), true);
        const chatgpt = f.page.getByTestId('chatgpt-settings');
        await chatgpt.getByRole('button', { name: CHATGPT_DICTS.it['chatgpt.admin.enable'], exact: true }).click();
        await f.page.getByTestId('audience-chatgpt').getByRole('checkbox', { name: personalAPIText('it', 'audienceTeachersChatgpt'), exact: true }).uncheck();
        for (let i = 0; i < 100 && f.audienceWrites.length < 2; i++) await f.page.waitForTimeout(100);
        assert.deepEqual(f.audienceWrites.at(-1), { chatgpt: { teachers: false, students: true } });
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
