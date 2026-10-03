import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.PERSONAL_API_BASE_URL || 'http://127.0.0.1:3135';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true }); });
after(async () => { await browser?.close(); });
async function fixture({ role = 'student', available = true, configured = false, width = 390, locale = 'it', dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1050 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ locale, dark }) => { localStorage.setItem('cb_lang', locale); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { locale, dark });
    const settings = { available, chatgpt_enabled: false, providers: ['openai', 'anthropic', 'gemini', 'openrouter'], configured, provider: 'openai', model: configured ? 'gpt-4o' : '', enabled: configured, active: available && configured };
    const policy = { enabled: available, encryption_ready: true, reason: null, key_source: 'managed' }; let failSave = false;
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname; let data = [], status = 200;
        if (path === '/api/auth/me') data = { authenticated: true, username: 'api-fixture', name: 'Test', is_admin: role === 'admin', groups: role === 'teacher' ? ['docenti'] : ['studenti'] };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/user/chatgpt') data = { enabled: false, available: false, use_subscription: false };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/user/api-settings') {
            if (request.method() !== 'GET') assert.equal(request.headers()['x-requested-with'], 'CounselorBot');
            if (request.method() === 'PUT') { const body = request.postDataJSON(); writes.push({ method: 'PUT', body }); if (failSave) status = 500; else Object.assign(settings, { configured: true, provider: body.provider, model: body.model, enabled: body.enabled, active: settings.available && body.enabled }); }
            else if (request.method() === 'DELETE') { writes.push({ method: 'DELETE' }); Object.assign(settings, { configured: false, provider: 'openai', model: '', enabled: false, active: false }); }
            data = settings;
        } else if (path === '/api/user/api-settings/verify') { writes.push({ method: 'VERIFY' }); data = { working: true }; }
        else if (path === '/api/admin/personal-api-policy') { if (role !== 'admin') status = 403; if (request.method() === 'PUT') { writes.push({ method: 'POLICY', body: request.postDataJSON() }); policy.enabled = request.postDataJSON().enabled; } data = policy; }
        return route.fulfill({ status, json: data });
    });
    return { page, context, settings, errors, writes, fail: () => { failSave = true; } };
}
for (const [role, width] of [['student', 390], ['teacher', 1440]]) {
    test(`${role} opens settings from own area, saves, verifies and deletes at ${width}px`, async () => {
        const f = await fixture({ role, width });
        try {
            await f.page.goto(`${origin}/${role === 'teacher' ? 'docente' : 'profilo'}`);
            await f.page.getByRole('link', { name: /^API personali/ }).click();
            await f.page.getByLabel('Modello', { exact: true }).fill('gpt-4o');
            await f.page.getByLabel('Chiave API', { exact: true }).fill('fake-browser-key');
            await f.page.getByLabel('Usa le mie API personali').check();
            await f.page.getByRole('button', { name: 'Salva configurazione' }).click();
            await f.page.getByText('Configurazione salvata.', { exact: true }).waitFor();
            assert.equal(await f.page.getByLabel('Chiave API', { exact: true }).inputValue(), '');
            assert.equal(f.writes[0].body.api_key, 'fake-browser-key'); assert.equal(f.writes[0].body.enabled, true);
            await f.page.getByRole('button', { name: 'Verifica chiave salvata' }).click();
            await f.page.getByText(/La chiave è valida/).waitFor();
            await f.page.getByRole('button', { name: 'Elimina chiave personale' }).click();
            assert.equal(f.writes.filter(w => w.method === 'DELETE').length, 0);
            await f.page.getByRole('button', { name: 'Elimina chiave personale' }).click();
            await f.page.getByText('API di sistema in uso', { exact: true }).waitFor();
            assert.equal(f.writes.filter(w => w.method === 'DELETE').length, 1);
            assert.deepEqual(f.errors, []); assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        } finally { await f.context.close(); }
    });
}
test('disabled feature hides home entry and redirects a direct settings visit', async () => {
    const f = await fixture({ available: false, configured: true });
    try {
        const loaded = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/user/api-settings');
        await f.page.goto(`${origin}/profilo`); await loaded;
        assert.equal(await f.page.getByRole('link', { name: /^API personali/ }).count(), 0);
        await f.page.goto(`${origin}/profilo/api-personali`);
        await f.page.waitForURL(`${origin}/profilo`);
        assert.equal(await f.page.getByLabel('Chiave API', { exact: true }).count(), 0);
        assert.equal(await f.page.getByRole('heading', { name: 'API personali', exact: true }).count(), 0);
        assert.equal(f.writes.length, 0);
    } finally { await f.context.close(); }
});
test('save failure preserves the unsaved key and edits', async () => {
    const f = await fixture();
    try {
        f.fail(); await f.page.goto(`${origin}/profilo/api-personali`);
        await f.page.getByLabel('Modello', { exact: true }).fill('gpt-4o');
        await f.page.getByLabel('Chiave API', { exact: true }).fill('unsaved-test-key');
        await f.page.getByRole('button', { name: 'Salva configurazione' }).click(); await f.page.getByRole('alert').filter({ hasText: 'Operazione non riuscita.' }).waitFor();
        assert.equal(await f.page.getByLabel('Chiave API', { exact: true }).inputValue(), 'unsaved-test-key');
        assert.equal(await f.page.getByLabel('Modello', { exact: true }).inputValue(), 'gpt-4o');
        assert.ok(await f.page.getByRole('button', { name: 'Verifica chiave salvata' }).isDisabled());
    } finally { await f.context.close(); }
});
test('administrator toggles the feature from API configuration', async () => {
    const f = await fixture({ role: 'admin', width: 1440 });
    try {
        await f.page.goto(`${origin}/admin`); const toggle = f.page.getByLabel('Consenti API personali a studenti e docenti');
        await toggle.uncheck(); await f.page.getByText('Configurazione salvata.', { exact: true }).waitFor();
        assert.deepEqual(f.writes[0], { method: 'POLICY', body: { enabled: false } });
        const saved = f.page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('personal-api-policy')); await toggle.check(); await saved;
        assert.deepEqual(f.writes.at(-1), { method: 'POLICY', body: { enabled: true } }); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
for (const [locale, title] of [['en', 'Personal APIs'], ['es', 'API personales'], ['fr', 'API personnelles'], ['de', 'Eigene APIs'], ['sv', 'Egna API:er']]) {
    test(`settings render in ${locale} with dark theme at 320px`, async () => {
        const f = await fixture({ locale, dark: true, width: 320, configured: true });
        try { await f.page.goto(`${origin}/profilo/api-personali`); await f.page.getByRole('heading', { name: title, exact: true }).waitFor(); await f.page.locator('#personal-model').waitFor(); assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(f.errors, []); }
        finally { await f.context.close(); }
    });
}
test('capture guide screenshot with isolated fake account and no visible key', async () => {
    const f = await fixture({ width: 1440, configured: true });
    try { await f.page.goto(`${origin}/profilo/api-personali`); await f.page.locator('#personal-key').waitFor(); assert.equal(await f.page.locator('#personal-key').inputValue(), ''); if (process.env.PERSONAL_API_CAPTURE_GUIDE === '1') { await f.page.locator('nextjs-portal').evaluateAll(nodes => nodes.forEach(node => { node.style.display = 'none'; })); await f.page.screenshot({ path: 'public/guide/api-personali.png', fullPage: true }); } }
    finally { await f.context.close(); }
});
