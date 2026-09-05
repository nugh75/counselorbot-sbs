import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.LOG_VIEWER_BASE_URL || 'http://127.0.0.1:3000').origin;
let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const logs = Array.from({ length: 50 }, (_, index) => ({
    id: index + 1,
    session_id: `audit-session-${index}`,
    conversation_id: `audit-conversation-${index}-${'long-identifier-'.repeat(5)}`,
    action: 'chat_message',
    timestamp: '2026-09-05T08:00:00Z',
    username: 'utente.fittizio',
    anonymous_research_code: 'TEST-0001',
    provider: 'openai',
    model_name: 'audit-model',
    questionnaire_type: 'QSA',
    phase: 'analysis',
    cost_usd: 0.001,
    helpful: true,
    details: {
        user_input: 'Vorrei capire meglio le mie strategie di studio. Questo messaggio fittizio verifica che una frase lunga possa occupare più righe.',
        bot_response: '## Osservazione\n\nIl tuo **metodo di studio**:\n\n- Rileggi il materiale.\n- Individui i concetti principali.\n\n| Aspetto | Nota |\n| --- | --- |\n| Organizzazione | Da esplorare |\n\n[Approfondimento](https://example.invalid/reading)',
        effective_user_input: 'CONTEXT_FIXTURE',
        system_prompt: 'SYSTEM_PROMPT_FIXTURE '.repeat(200),
        extra: { nested: ['TECHNICAL_FIXTURE'] },
    },
}));

const labels = {
    it: { tab: 'Log Conversazioni', open: 'Apri conversazione', details: 'Dettagli', technical: 'Dettagli tecnici', close: 'Chiudi', session: 'Apri sessione', delete: 'Elimina sessione' },
    en: { tab: 'Conversation Logs', open: 'Open conversation', details: 'Details', technical: 'Technical details', close: 'Close', session: 'Open session', delete: 'Delete session' },
    de: { tab: 'Gesprächsprotokolle', open: 'Gespräch öffnen', details: 'Details', technical: 'Technische Details', close: 'Schließen', session: 'Sitzung öffnen', delete: 'Sitzung löschen' },
};

for (const scenario of [
    { width: 1440, height: 900, lang: 'it', dark: false },
    { width: 390, height: 844, lang: 'it', dark: true },
    { width: 320, height: 740, lang: 'de', dark: false },
    { width: 768, height: 1024, lang: 'en', dark: false },
]) {
    test(`conversation logs: ${scenario.width}px, ${scenario.lang}, ${scenario.dark ? 'dark' : 'light'}`, async () => {
        const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, reducedMotion: 'no-preference' });
        try {
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            const copy = labels[scenario.lang];
            const errors = [];
            const writes = [];
            const requests = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.addInitScript(({ lang, dark }) => {
                localStorage.setItem('cb_lang', lang);
                localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
            }, scenario);
            // No credentials or production data: every API response is a fixture.
            await page.route('**/*', (route) => {
                const request = route.request();
                const url = new URL(request.url());
                if (request.method() !== 'GET') {
                    writes.push(`${request.method()} ${url.pathname}`);
                    return route.abort();
                }
                if (url.origin !== origin) return route.abort();
                if (!url.pathname.startsWith('/api/')) return route.continue();
                requests.push(url.pathname);
                let data = [];
                if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: true, is_researcher: true, username: 'audit', name: 'Audit', email: 'audit@example.invalid', groups: ['admins'] };
                else if (url.pathname === '/api/admin/logs') data = logs;
                else if (url.pathname === '/api/admin/logs/count') data = { count: logs.length };
                else if (url.pathname === '/api/admin/logs/options') data = {};
                else if (/\/api\/admin\/logs\/(conversation|session)\//.test(url.pathname)) data = logs.slice(0, 3);
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
            });

            await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
            if (await page.locator('#admin-section').isVisible()) await page.locator('#admin-section').selectOption('logs');
            else await page.getByRole('button', { name: copy.tab, exact: true }).click();
            const openButtons = page.getByRole('button', { name: copy.open, exact: true });
            await openButtons.first().waitFor();
            assert.equal(await openButtons.count(), 50);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits the viewport');
            const preview = page.locator('article').first().locator('p.line-clamp-3');
            assert.ok(await preview.evaluate((element) => element.clientHeight > parseFloat(getComputedStyle(element).lineHeight)), 'preview spans multiple lines');

            await page.getByRole('button', { name: copy.details, exact: true }).first().click();
            const detail = page.locator('#log-detail-1');
            assert.equal(await detail.locator('details[open]').count(), 0);
            assert.equal(await detail.getByText('SYSTEM_PROMPT_FIXTURE', { exact: false }).first().isVisible(), false);
            assert.equal(await detail.getByRole('heading', { name: 'Osservazione' }).isVisible(), true);
            await detail.locator('summary').filter({ hasText: copy.technical }).click();
            assert.equal(await detail.getByText('SYSTEM_PROMPT_FIXTURE', { exact: false }).first().isVisible(), true);
            assert.equal(await detail.getByText('TECHNICAL_FIXTURE', { exact: true }).isVisible(), true);

            // Keep the existing session entry and its delete action reachable.
            await detail.getByRole('button', { name: copy.session, exact: true }).click();
            let dialog = page.getByRole('dialog');
            await dialog.waitFor();
            assert.equal(await dialog.getByRole('button', { name: copy.delete, exact: true }).isVisible(), true);
            await page.keyboard.press('Escape');
            await dialog.waitFor({ state: 'detached' });
            await page.getByRole('button', { name: copy.details, exact: true }).first().click();

            for (const trigger of [openButtons.first(), openButtons.last()]) {
                await trigger.scrollIntoViewIfNeeded();
                const scrollBefore = await page.evaluate(() => scrollY);
                await trigger.click();
                dialog = page.getByRole('dialog');
                await dialog.getByRole('heading', { name: 'Osservazione' }).first().waitFor();
                const box = await dialog.boundingBox();
                assert.ok(box.y >= 0 && box.y + box.height <= scenario.height + 1, 'dialog stays inside the viewport');
                assert.ok(box.x >= 0 && box.x + box.width <= scenario.width + 1, 'dialog fits horizontally');
                assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'opening preserves page scroll');
                assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
                assert.equal(await page.locator('main').evaluate((element) => element.inert), true);
                assert.equal(await dialog.getAttribute('aria-modal'), 'true');
                assert.equal(await dialog.locator('strong').first().textContent(), 'metodo di studio');
                assert.equal(await dialog.getByRole('table').count(), 3);
                assert.equal(await dialog.locator('details[open]').count(), 0);
                assert.equal(await dialog.getByRole('button', { name: copy.delete, exact: true }).count(), 0);

                const close = dialog.getByRole('button', { name: copy.close, exact: true });
                assert.equal(await close.evaluate((element) => element === document.activeElement), true);
                await page.keyboard.press('Shift+Tab');
                assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
                await page.keyboard.press('Tab');
                assert.equal(await close.evaluate((element) => element === document.activeElement), true);
                await page.mouse.move(scenario.width - 2, 3);
                await page.mouse.wheel(0, 500);
                await page.waitForTimeout(100);
                assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'background does not scroll');
                await dialog.locator('[aria-busy]').evaluate((element) => { element.scrollTop = element.scrollHeight; });
                assert.equal(await close.isVisible(), true, 'close remains reachable while reading');
                await page.keyboard.press('Escape');
                await dialog.waitFor({ state: 'detached' });
                assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
                assert.equal(await page.locator('main').evaluate((element) => element.inert), false);
                assert.equal(await page.evaluate(() => document.body.style.overflow), '');
            }
            await openButtons.last().click();
            await page.getByRole('dialog').waitFor();
            await page.mouse.click(scenario.width - 2, 3);
            await page.getByRole('dialog').waitFor({ state: 'detached' });
            assert.ok(requests.some((path) => path.endsWith(encodeURIComponent(logs[49].conversation_id))), 'last row opens its own conversation');
            assert.deepEqual(errors, []);
            assert.deepEqual(writes, []);
        } finally {
            await context.close();
        }
    });
}
