import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium } from 'playwright';
import { CHATGPT_DICTS } from '../src/lib/i18n-chatgpt.ts';

const origin = process.env.CHATGPT_TEST_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true }); });
after(async () => { await browser.close(); });

// #134: the wizard picks the helper from the browser's user agent.
const AGENTS = {
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

for (const language of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    for (const width of [390, 1440]) {
        test(`personal ChatGPT: explicit selection, cancellation and quota in ${language} at ${width}px`, async () => {
            const context = await browser.newContext({ viewport: { width, height: 1000 }, userAgent: AGENTS.macos });
            await context.addInitScript(lang => localStorage.setItem('cb_lang', lang), language);
            const page = await context.newPage();
            const writes = [], errors = [];
            page.on('pageerror', error => errors.push(error.message));
            let failModels = false;
            const status = { available: true, enabled: true, reason: null, connected: false, email: null, use_subscription: false,
                model: null, needs_reconnect: false, pending_link: false, macos_helper_available: true, windows_helper_available: true, models: [] };
            await page.route('**/api/**', async route => {
                const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
                let data = [];
                if (path === '/api/auth/me') data = { authenticated: true, username: 'chatgpt-fixture', email: 'user@example.test', groups: ['studenti'], is_admin: false };
                else if (path === '/api/user/account-preferences') data = { counselor_ready: true, notebook_ready: true, setup_completed: true, counselor_id: 1 };
                else if (path === '/api/orientation/status') data = { required: false, completed: true };
                else if (path.startsWith('/api/user/chatgpt')) {
                    if (method !== 'GET') {
                        writes.push({ path, method, body: request.postData() ? request.postDataJSON() : null });
                        assert.equal(request.headers()['x-requested-with'], 'CounselorBot');
                    }
                    if (path.endsWith('/link')) {
                        status.pending_link = method === 'POST';
                        data = method === 'POST' ? { pairing_code: 'fixture-pairing-code-never-save-in-storage-123', expires_at: new Date(Date.now() + 600000).toISOString() } : { cancelled: true };
                    } else if (path.endsWith('/models')) {
                        if (failModels) return route.fulfill({ status: 429, json: { detail: 'chatgpt.errors.quota' } });
                        status.models = [{ slug: 'fixture-model', display_name: 'Fixture model' }];
                        data = { models: status.models };
                    } else if (path.endsWith('/preference')) {
                        Object.assign(status, request.postDataJSON()); data = status;
                    } else if (method === 'DELETE') {
                        Object.assign(status, { connected: false, use_subscription: false, models: [], pending_link: false });
                        data = { disconnected: true, revocation_confirmed: false };
                    } else data = status;
                }
                return route.fulfill({ json: data });
            });
            const t = key => CHATGPT_DICTS[language]['chatgpt.' + key];
            try {
                await page.goto(origin + '/profilo/chatgpt');
                const panel = page.locator('#chatgpt');
                await panel.getByRole('heading', { name: t('title') }).waitFor();
                await panel.getByText(t('privacy'), { exact: true }).waitFor({ state: 'visible' });
                await panel.getByRole('button', { name: t('connect'), exact: true }).click();
                await panel.getByText(`2. ${t('stepCode')}`, { exact: true }).waitFor();
                assert.equal(await panel.getByTestId('chatgpt-wizard').getAttribute('data-state'), 'waiting');
                assert.match(await panel.getByRole('timer').textContent(), /\d+:\d\d/);
                assert.equal(await panel.getByRole('timer').getAttribute('aria-live'), 'off');
                assert.equal(await panel.getByTestId('chatgpt-pairing-code').textContent(), 'fixture-pairing-code-never-save-in-storage-123');
                assert.equal(await panel.getByRole('link', { name: t('macosDownload'), includeHidden: true }).getAttribute('href'), '/api/chatgpt/helper/macos');
                // #133: the Windows helper, with the SmartScreen steps and this site's address.
                assert.equal(await panel.getByRole('link', { name: t('windowsDownload'), includeHidden: true }).getAttribute('href'), '/api/chatgpt/helper/windows');
                assert.ok((await panel.getByText(t('windowsSecurity').split('{origin}')[0], { exact: false }).textContent()).includes(origin));
                assert.equal(await panel.getByRole('link', { name: t('download') }).isVisible(), false);
                // On a Mac the macOS helper comes first; Windows and Python wait under "other systems".
                assert.equal(await panel.getByRole('link', { name: t('macosDownload') }).isVisible(), true);
                assert.equal(await panel.getByRole('link', { name: t('windowsDownload'), includeHidden: true }).isVisible(), false);
                assert.equal(await panel.getByRole('link', { name: t('pythonHelper'), includeHidden: true }).isVisible(), false);
                if (language === 'it') await panel.getByTestId('chatgpt-link').screenshot({ path: `/tmp/chatgpt-macos-pairing-${width}.png` });
                await panel.locator('summary', { hasText: t('manual') }).click();
                await panel.getByText(t('sshInstructions'), { exact: true }).waitFor({ state: 'visible' });
                assert.equal(await panel.getByTestId('chatgpt-ssh-command').textContent(), `python3 chatgpt-connect.py --server '${origin}' --no-browser --callback-port 1455`);
                if (language === 'it') await panel.getByTestId('chatgpt-link').screenshot({ path: `/tmp/chatgpt-ssh-pairing-${width}.png` });
                assert.equal(await panel.getByRole('link', { name: t('download') }).getAttribute('href'), '/api/chatgpt/helper');
                assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('fixture-pairing')), false);
                assert.equal(writes.some(write => write.path.endsWith('/preference')), false);
                await panel.getByRole('button', { name: t('cancel') }).click();
                await panel.getByTestId('chatgpt-link').waitFor({ state: 'hidden' });
                assert.equal(await panel.getByTestId('chatgpt-link').count(), 0);
                await panel.getByRole('button', { name: t('connect'), exact: true }).click();
                Object.assign(status, { connected: true, pending_link: false, email: 'own-account@example.test' });
                await panel.getByText(t('connected') + ' · own-account@example.test', { exact: true }).waitFor();
                await panel.getByRole('combobox', { name: t('model') }).selectOption('fixture-model');
                assert.equal(status.use_subscription, false);
                await panel.getByRole('button', { name: t('save'), exact: true }).click();
                await panel.getByText(t('active') + ' · fixture-model', { exact: true }).waitFor();
                assert.equal(status.use_subscription, true);
                assert.equal(writes.filter(write => write.path.endsWith('/preference')).length, 1);
                failModels = true;
                await panel.getByRole('button', { name: t('refresh') }).click();
                await panel.getByRole('alert').getByText(t('errors.quota'), { exact: true }).waitFor();
                assert.equal(status.use_subscription, true);
                assert.equal(writes.filter(write => write.path.endsWith('/preference')).length, 1);
                assert.equal(await panel.getByRole('link', { name: t('usage') }).getAttribute('href'), 'https://chatgpt.com/settings/usage');
                failModels = false;
                if (language === 'it') await panel.screenshot({ path: `/tmp/chatgpt-personal-${width}.png` });
                await panel.getByRole('button', { name: t('institution') }).click();
                await panel.getByText(t('inactive'), { exact: true }).waitFor();
                assert.equal(status.use_subscription, false);
                await panel.getByRole('button', { name: t('disconnect'), exact: true }).click();
                await panel.getByText(t('revocation'), { exact: true }).waitFor();
                assert.equal(status.connected, false);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
                status.macos_helper_available = false;
                status.windows_helper_available = false;
                await page.reload();
                await panel.getByRole('button', { name: t('connect'), exact: true }).click();
                await panel.getByTestId('chatgpt-pairing-code').waitFor({ state: 'visible' });
                assert.equal(await panel.getByRole('link', { name: t('macosDownload') }).count(), 0);
                assert.equal(await panel.getByRole('link', { name: t('windowsDownload') }).count(), 0);
                // Without packaged helpers the Python script becomes the first choice.
                assert.equal(await panel.getByRole('link', { name: t('pythonHelper') }).isVisible(), true);
                await panel.getByRole('button', { name: t('cancel') }).click();
                assert.deepEqual(errors, []);
            } finally { await context.close(); }
        });
    }
}

// Minimal fixture for the device and error cases: never connected, both helpers packaged.
async function wizardPage(agent, { expiresIn = 600000 } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, userAgent: AGENTS[agent] });
    await context.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    const page = await context.newPage();
    const errors = [], links = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'chatgpt-fixture', email: 'user@example.test', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') data = { counselor_ready: true, notebook_ready: true, setup_completed: true, counselor_id: 1 };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path.endsWith('/link') && request.method() === 'POST') {
            links.push(path);
            data = { pairing_code: 'fixture-code', expires_at: new Date(Date.now() + expiresIn).toISOString() };
        } else if (path.startsWith('/api/user/chatgpt')) data = { available: true, enabled: true, reason: null, connected: false, email: null,
            use_subscription: false, model: null, needs_reconnect: false, pending_link: links.length > 0, macos_helper_available: true,
            windows_helper_available: true, models: [] };
        return route.fulfill({ json: data });
    });
    await page.goto(origin + '/profilo/chatgpt');
    const panel = page.locator('#chatgpt');
    await panel.getByRole('heading', { name: CHATGPT_DICTS.it['chatgpt.title'] }).waitFor();
    return { context, page, panel, errors, links };
}
const it = key => CHATGPT_DICTS.it['chatgpt.' + key];

for (const [agent, primary, os] of [['windows', 'windowsDownload', 'osWindows'], ['linux', 'pythonHelper', 'osLinux']]) {
    test(`ChatGPT wizard offers the ${agent} helper first`, async () => {
        const { context, panel, errors } = await wizardPage(agent);
        try {
            await panel.getByText(it('detected').replace('{os}', it(os)), { exact: true }).waitFor();
            await panel.getByRole('button', { name: it('connect'), exact: true }).click();
            await panel.getByTestId('chatgpt-pairing-code').waitFor();
            assert.equal(await panel.getByRole('link', { name: it(primary) }).isVisible(), true);
            assert.equal(await panel.getByRole('link', { name: it('macosDownload'), includeHidden: true }).isVisible(), false);
            await panel.locator('summary', { hasText: it('otherSystems') }).click();
            assert.equal(await panel.getByRole('link', { name: it('macosDownload') }).isVisible(), true);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('ChatGPT wizard explains that phones cannot connect', async () => {
    const { context, panel, errors } = await wizardPage('iphone');
    try {
        await panel.getByText(it('unsupported'), { exact: true }).waitFor();
        assert.equal(await panel.getByRole('button', { name: it('connect'), exact: true }).count(), 0);
        assert.equal(await panel.locator('a[href^="/api/chatgpt/helper"]').count(), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('ChatGPT wizard turns an expired code into a retry', async () => {
    const { context, panel, errors, links } = await wizardPage('macos', { expiresIn: 1500 });
    try {
        await panel.getByRole('button', { name: it('connect'), exact: true }).click();
        await panel.getByRole('button', { name: it('retryLink') }).waitFor({ timeout: 10000 });
        assert.equal(await panel.getByTestId('chatgpt-wizard').getAttribute('data-state'), 'error');
        await panel.getByText(it('errors.linkExpired'), { exact: true }).waitFor();
        await panel.locator('summary', { hasText: it('troubleshooting') }).click();
        await panel.getByText(it('troubleshootingBody'), { exact: true }).waitFor();
        await panel.getByRole('button', { name: it('retryLink') }).click();
        await panel.getByTestId('chatgpt-pairing-code').waitFor();
        assert.equal(links.length, 2);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
