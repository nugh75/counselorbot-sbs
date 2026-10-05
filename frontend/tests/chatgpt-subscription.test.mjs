import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium } from 'playwright';
import { CHATGPT_DICTS } from '../src/lib/i18n-chatgpt.ts';

const origin = process.env.CHATGPT_TEST_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true }); });
after(async () => { await browser.close(); });

for (const language of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    for (const width of [390, 1440]) {
        test(`personal ChatGPT: explicit selection, cancellation and quota in ${language} at ${width}px`, async () => {
            const context = await browser.newContext({ viewport: { width, height: 1000 } });
            await context.addInitScript(lang => localStorage.setItem('cb_lang', lang), language);
            const page = await context.newPage();
            const writes = [], errors = [];
            page.on('pageerror', error => errors.push(error.message));
            let failModels = false;
            const status = { available: true, enabled: true, reason: null, connected: false, email: null, use_subscription: false,
                model: null, needs_reconnect: false, pending_link: false, macos_helper_available: true, models: [] };
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
                await panel.getByText(t('code'), { exact: true }).waitFor();
                assert.equal(await panel.getByTestId('chatgpt-pairing-code').textContent(), 'fixture-pairing-code-never-save-in-storage-123');
                assert.equal(await panel.getByRole('link', { name: t('macosDownload') }).getAttribute('href'), '/api/chatgpt/helper/macos');
                assert.equal(await panel.getByRole('link', { name: t('download') }).isVisible(), false);
                assert.equal(await panel.getByText(t('macosInstructions'), { exact: true }).isVisible(), true);
                if (language === 'it') await panel.getByTestId('chatgpt-link').screenshot({ path: `/tmp/chatgpt-macos-pairing-${width}.png` });
                await panel.locator('summary').click();
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
                await page.reload();
                await panel.getByRole('button', { name: t('connect'), exact: true }).click();
                await panel.getByTestId('chatgpt-pairing-code').waitFor({ state: 'visible' });
                assert.equal(await panel.getByRole('link', { name: t('macosDownload') }).count(), 0);
                assert.equal(await panel.getByRole('link', { name: t('download') }).isVisible(), true);
                await panel.getByRole('button', { name: t('cancel') }).click();
                assert.deepEqual(errors, []);
            } finally { await context.close(); }
        });
    }
}
