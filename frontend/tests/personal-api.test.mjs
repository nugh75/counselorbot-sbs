import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { personalAPIText } from '../src/lib/i18n-personal-api.ts';
const origin = process.env.PERSONAL_API_BASE_URL || 'http://127.0.0.1:3135';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true }); });
after(async () => { await browser?.close(); });
async function fixture({ role = 'student', width = 390, locale = 'it', configured = true, dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1050 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(25000);
    const errors = [], writes = [], own = []; let counter = 1, failSave = false, modelError = null;
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ locale, dark }) => { localStorage.setItem('cb_lang', locale); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { locale, dark });
    const settings = { available: true, api_enabled: true, chatgpt_enabled: false, chatgpt_models: [], default_chatgpt_model: null, default_reasoning: null, providers: ['openai','openrouter','anthropic','gemini'], enabled: configured, default_connection_id: configured ? 'a'.repeat(32) : null, connections: configured ? [{ id: 'a'.repeat(32), name: 'OpenRouter personale', provider: 'openrouter', model: 'qwen/qwen3.8-27b:free' }] : [], bindings: [], counselors: [{ id: 1, name: 'First counselor', is_personal: false }, { id: 2, name: 'Second counselor', is_personal: false }] };
    await page.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname, method = req.method(); let data = [], status = 200;
        if (path === '/api/auth/me') data = { authenticated: true, username: 'api-fixture', name: 'Test', groups: role === 'teacher' ? ['docenti'] : ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/user/chatgpt') data = { enabled: settings.chatgpt_enabled, available: settings.chatgpt_enabled, use_subscription: false };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/counselors') data = settings.counselors.map(c => ({ ...c, slug: 'test-'+c.id, language: ['*'], questionnaire_types: ['*'], is_active: true, model: 'test-model' }));
        else if (path === '/api/user/api-settings') data = { available: settings.available, configured: !!settings.connections.length, enabled: settings.enabled, active: settings.available && settings.enabled };
        else if (path.startsWith('/api/user/api-connections')) {
            if (method !== 'GET') { assert.equal(req.headers()['x-requested-with'], 'CounselorBot'); writes.push({ method, path, body: req.postData() ? req.postDataJSON() : undefined }); }
            if (path.endsWith('/test')) data = { working: !modelError, ...(modelError ? { error_code: modelError } : {}) };
            else {
                const id = path.split('/')[4];
                if (method === 'POST' || method === 'PUT') {
                    if (failSave) status = 500;
                    else { const b = req.postDataJSON(), row = { id: id || String(counter++).padStart(32,'0'), name: b.name, provider: b.provider, model: b.model }; if (method === 'POST') { settings.connections.push(row); settings.default_connection_id ||= row.id; } else settings.connections = settings.connections.map(c => c.id === id ? row : c); }
                } else if (method === 'DELETE') { settings.connections = settings.connections.filter(c => c.id !== id); settings.bindings = settings.bindings.filter(b => b.connection_id !== id); if (settings.default_connection_id === id) settings.default_connection_id = null; if (!settings.connections.length) settings.enabled = false; }
                data = settings;
            }
        } else if (path === '/api/user/api-routing') { assert.equal(req.headers()['x-requested-with'], 'CounselorBot'); const body = req.postDataJSON(); writes.push({ method, path, body }); Object.assign(settings, body); data = settings; }
        else if (path.startsWith('/api/user/counselors')) {
            if (method !== 'GET') { assert.equal(req.headers()['x-requested-with'], 'CounselorBot'); writes.push({ method, path, body: req.postData() ? req.postDataJSON() : undefined }); }
            const id = Number(path.split('/')[4]);
            if (method === 'POST') { const row = { id: 100+counter++, ...req.postDataJSON() }; own.push(row); settings.counselors.push({ id: row.id, name: row.name, is_personal: true }); data = row; }
            else if (method === 'PUT') { const row = own.find(c => c.id === id); Object.assign(row, req.postDataJSON()); settings.counselors.find(c => c.id === id).name = row.name; data = row; }
            else if (method === 'DELETE') { own.splice(own.findIndex(c => c.id === id),1); settings.counselors = settings.counselors.filter(c => c.id !== id); settings.bindings = settings.bindings.filter(b => b.counselor_id !== id); data = { deleted: true }; }
            else data = own;
        }
        return route.fulfill({ status, json: data });
    });
    return { page, context, settings, own, errors, writes, fail: () => { failSave = true; }, modelFail: code => { modelError = code; } };
}
async function fillConnection(page, name, model = 'qwen/qwen3.8-27b:free') {
    await page.getByRole('button', { name: 'Aggiungi connessione', exact: true }).click();
    await page.getByLabel('Nome della connessione', { exact: true }).fill(name);
    await page.getByLabel('Provider', { exact: true }).selectOption('openrouter');
    await page.getByLabel('Modello', { exact: true }).fill(model);
    await page.getByLabel('Chiave API', { exact: true }).fill('fake-browser-key');
}
for (const [role, width] of [['student',390],['teacher',1440]]) test(`${role}: multiple accounts and one model associated with two counselors at ${width}px`, async () => {
    const f = await fixture({ role, width, configured: false });
    try {
        await f.page.goto(`${origin}/${role === 'teacher' ? 'docente' : 'profilo'}`); await f.page.getByRole('link', { name: /^API e ChatGPT/ }).click();
        for (const name of ['OpenRouter personale','OpenRouter università']) { await fillConnection(f.page,name); await f.page.getByRole('button', { name: 'Salva connessione', exact: true }).click(); await f.page.getByRole('heading', { name, exact: true }).waitFor(); }
        assert.equal(f.settings.connections.length,2); assert.equal(await f.page.getByLabel('Chiave API', { exact: true }).count(),0);
        await f.page.getByLabel('Usa le mie API o il mio ChatGPT').check(); const id = f.settings.connections[1].id;
        await f.page.locator('#personal-counselor-1').selectOption(`api:${id}`); await f.page.locator('#personal-counselor-2').selectOption(`api:${id}`);
        await f.page.getByRole('button', { name: 'Salva associazioni e utilizzo', exact: true }).click(); await f.page.getByText('Le tue scelte personali sono in uso', { exact: true }).waitFor();
        const saved = f.writes.find(w => w.path === '/api/user/api-routing'); assert.equal(saved.body.bindings.length,2); assert.ok(saved.body.bindings.every(b => b.connection_id === id && b.chatgpt_model === null)); assert.equal('api_key' in saved.body,false);
        await f.page.getByRole('button', { name: 'Prova connessione e modello', exact: true }).first().click(); await f.page.getByText('Il modello ha risposto al messaggio di test.', { exact: true }).waitFor();
        assert.deepEqual(f.errors,[]); assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await f.context.close(); }
});
test('creates a private counselor with Italian instructions, associates a key, and edits instructions in Swedish', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/profilo/api-personali`); await f.page.getByRole('button', { name: 'Crea un counselor', exact: true }).click();
        await f.page.getByLabel('Nome del counselor', { exact: true }).fill('La mia guida'); await f.page.getByLabel('Descrizione', { exact: true }).fill('Mi aiuta nello studio'); await f.page.getByLabel('Istruzioni del counselor', { exact: true }).fill('Aiutami in italiano, una domanda alla volta.');
        await f.page.getByRole('button', { name: 'Salva counselor', exact: true }).click(); await f.page.getByRole('heading', { name: 'La mia guida', exact: true }).waitFor(); assert.equal(f.own[0].persona,'Aiutami in italiano, una domanda alla volta.');
        await f.page.locator(`#personal-counselor-${f.own[0].id}`).selectOption('api:' + 'a'.repeat(32)); await f.page.getByRole('button', { name: 'Salva associazioni e utilizzo', exact: true }).click();
        await f.page.getByRole('heading', { name: 'La mia guida', exact: true }).locator('..').getByRole('button', { name: 'Modifica', exact: true }).click(); await f.page.getByLabel('Istruzioni del counselor', { exact: true }).fill('Hjälp mig på svenska.'); await f.page.getByRole('button', { name: 'Salva counselor', exact: true }).click(); await f.page.getByText(/Counselor salvato/).waitFor(); assert.equal(f.own[0].persona,'Hjälp mig på svenska.'); assert.deepEqual(f.errors,[]);
    } finally { await f.context.close(); }
});
test('saved key remains hidden, empty edit preserves it and deletion needs confirmation', async () => {
    const f = await fixture();
    try { await f.page.goto(`${origin}/profilo/api-personali`); const card = f.page.getByRole('heading', { name: 'OpenRouter personale', exact: true }).locator('..'); await card.getByRole('button', { name: 'Modifica', exact: true }).click(); assert.equal(await f.page.getByLabel('Chiave API', { exact: true }).inputValue(),''); await f.page.getByLabel('Modello', { exact: true }).fill('other/model:free'); await f.page.getByRole('button', { name: 'Salva connessione', exact: true }).click(); await card.getByText(/other\/model:free/).waitFor(); assert.equal('api_key' in f.writes[0].body,false); await card.getByRole('button', { name: 'Elimina connessione', exact: true }).click(); assert.equal(f.writes.filter(w => w.method === 'DELETE').length,0); await card.getByRole('button', { name: 'Elimina connessione', exact: true }).last().click(); await f.page.getByText('Aggiungi una connessione per configurare le tue chiavi e i tuoi modelli.', { exact: true }).waitFor(); }
    finally { await f.context.close(); }
});
test('save failure preserves the draft key and model', async () => {
    const f = await fixture({ configured: false });
    try { await f.page.goto(`${origin}/profilo/api-personali`); await fillConnection(f.page,'Failed save'); f.fail(); await f.page.getByRole('button', { name: 'Salva connessione', exact: true }).click(); await f.page.getByRole('alert').filter({ hasText: 'Operazione non riuscita.' }).waitFor(); assert.equal(await f.page.getByLabel('Chiave API', { exact: true }).inputValue(),'fake-browser-key'); assert.equal(await f.page.getByLabel('Modello', { exact: true }).inputValue(),'qwen/qwen3.8-27b:free'); }
    finally { await f.context.close(); }
});
for (const [code,text] of [['quota','quota esaurita'],['modelUnavailable','modello scelto non è disponibile'],['privacy','servizio locale di protezione dei dati'],['rateLimit','limita temporaneamente']]) test(`real model test reports useful ${code} category`, async () => {
    const f = await fixture(); f.modelFail('personalAPI.errors.'+code);
    try { await f.page.goto(`${origin}/profilo/api-personali`); await f.page.getByRole('button', { name: 'Prova connessione e modello' }).click(); await f.page.getByRole('alert').filter({ hasText:text }).waitFor(); assert.deepEqual(f.errors,[]); } finally { await f.context.close(); }
});
test('admin disable hides settings and clears a dirty key on focus', async () => {
    const f = await fixture();
    try { await f.page.goto(`${origin}/profilo/api-personali`); await f.page.getByRole('button', { name: 'Modifica', exact: true }).click(); await f.page.getByLabel('Chiave API', { exact: true }).fill('draft-test-key'); f.settings.available=false; await f.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await f.page.waitForURL(`${origin}/profilo`); assert.equal(await f.page.getByLabel('Chiave API', { exact: true }).count(),0); assert.deepEqual(f.errors,[]); } finally { await f.context.close(); }
});
for (const [locale,title] of ['it','en','es','fr','de','sv'].map(l => [l, personalAPIText(l, 'sectionTitle')])) for (const width of [320,1440]) test(`connections and associations in ${locale} at ${width}px, dark theme`, async () => {
    const f=await fixture({ locale,width,dark:true });
    try { await f.page.goto(`${origin}/profilo/api-personali`); await f.page.getByRole('heading', { name:title,exact:true }).waitFor(); await f.page.locator('#personal-counselor-1').waitFor(); assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(f.errors,[]); } finally { await f.context.close(); }
});
test('updated guide screenshot has fake names and no key', async () => {
    const f=await fixture({ width:1440 });
    try { await f.page.goto(`${origin}/profilo/api-personali`); await f.page.locator('#personal-counselor-1').waitFor(); assert.equal(await f.page.locator('#personal-key').count(),0); if(process.env.PERSONAL_API_CAPTURE_GUIDE==='1') { await f.page.locator('nextjs-portal').evaluateAll(nodes => nodes.forEach(n => { n.style.display='none'; })); await f.page.screenshot({ path:'public/guide/api-personali.png',fullPage:true }); } } finally { await f.context.close(); }
});

for (const role of ['student', 'teacher']) for (const locale of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`${role}: API and ChatGPT have a named section at the bottom in ${locale}`, async () => {
        const f = await fixture({ role, locale });
        const area = role === 'teacher' ? 'docente' : 'profilo';
        f.settings.chatgpt_enabled = true;
        try {
            await f.page.goto(`${origin}/${area}`);
            const home = f.page.locator(role === 'teacher' ? '[data-teacher-area-home]' : '[data-personal-area-home]');
            const section = home.getByRole('region', { name: personalAPIText(locale, 'sectionTitle'), exact: true });
            await section.getByRole('heading', { level: 2 }).waitFor();
            assert.equal(await section.getByRole('navigation', { name: personalAPIText(locale, 'sectionTitle'), exact: true }).count(), 1);
            // #200: one entry for APIs and ChatGPT.
            assert.deepEqual(await section.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))), [`/${area}/api-personali`]);
            assert.equal(await section.evaluate(el => el === el.parentElement.lastElementChild), true);
            for (const width of [320, 1440]) {
                await f.page.setViewportSize({ width, height: 1050 });
                await section.scrollIntoViewIfNeeded();
                assert.equal(await section.evaluate(el => el.getBoundingClientRect().top >= el.previousElementSibling.getBoundingClientRect().bottom), true);
                assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                if (locale === 'it') await section.screenshot({ path: `/tmp/${area}-ai-section-${width}.png` });
            }
            await f.page.evaluate(() => document.documentElement.classList.add('dark'));
            await f.page.setViewportSize({ width: 320, height: 1050 });
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            f.settings.available = false;
            await f.page.evaluate(() => window.dispatchEvent(new Event('focus')));
            // ChatGPT alone still opens the same page.
            await f.page.evaluate(() => window.dispatchEvent(new Event('focus')));
            assert.equal(await section.locator(`a[href="/${area}/api-personali"]`).count(), 1);
            f.settings.chatgpt_enabled = false;
            await f.page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await section.waitFor({ state: 'detached' });
            assert.deepEqual(f.writes, []);
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

test('#200: each counselor can use an API connection or a ChatGPT model on one page', async () => {
    const f = await fixture({ width: 390 });
    Object.assign(f.settings, { chatgpt_enabled: true, chatgpt_models: [{ slug: 'fixture-model', display_name: 'Fixture model', reasoning_levels: [] }] });
    try {
        await f.page.goto(`${origin}/profilo/api-personali`);
        await f.page.locator('#chatgpt').waitFor();
        await f.page.locator('#personal-counselor-2').selectOption('chatgpt:fixture-model');
        await f.page.getByRole('button', { name: 'Salva associazioni e utilizzo', exact: true }).click();
        await f.page.getByRole('status').filter({ hasText: personalAPIText('it', 'saved') }).waitFor();
        const saved = f.writes.find(w => w.path === '/api/user/api-routing').body;
        assert.deepEqual(saved.bindings, [{ counselor_id: 2, connection_id: null, chatgpt_model: 'fixture-model', reasoning: null }]);
        assert.equal(saved.default_connection_id, 'a'.repeat(32));
        assert.equal(saved.default_chatgpt_model, null);
        assert.equal(await f.page.locator('#personal-default-connection').inputValue(), 'api:' + 'a'.repeat(32));
        // Without personal APIs the page keeps ChatGPT and the counselor choices only.
        Object.assign(f.settings, { api_enabled: false, default_connection_id: null, default_chatgpt_model: 'fixture-model' });
        await f.page.reload();
        await f.page.locator('#personal-counselor-1').waitFor();
        assert.equal(await f.page.locator('#personal-default-connection').inputValue(), 'chatgpt:fixture-model');
        assert.equal(await f.page.getByRole('button', { name: 'Aggiungi connessione', exact: true }).count(), 0);
        assert.equal(await f.page.getByRole('button', { name: 'Crea un counselor', exact: true }).count(), 0);
        assert.equal(await f.page.locator('#personal-default-connection optgroup').count(), 1);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('#200: the old ChatGPT address opens the ChatGPT section of the unified page', async () => {
    const f = await fixture();
    f.settings.chatgpt_enabled = true;
    try {
        await f.page.goto(`${origin}/profilo/chatgpt`);
        await f.page.waitForURL(`${origin}/profilo/api-personali#chatgpt`);
        await f.page.locator('#chatgpt').waitFor();
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('#202: a reasoning level per source, limited to what the ChatGPT model offers', async () => {
    const f = await fixture({ width: 390 });
    Object.assign(f.settings, { chatgpt_enabled: true, chatgpt_models: [{ slug: 'fixture-model', display_name: 'Fixture model', reasoning_levels: ['low', 'high'] }] });
    const l = key => personalAPIText('it', key);
    try {
        await f.page.goto(`${origin}/profilo/api-personali`);
        await f.page.locator('#personal-counselor-2').waitFor();
        // No level while a counselor follows the default.
        assert.equal(await f.page.locator('#personal-reasoning-2').count(), 0);
        await f.page.locator('#personal-counselor-2').selectOption('chatgpt:fixture-model');
        const chatgptLevels = await f.page.locator('#personal-reasoning-2 option').allTextContents();
        assert.deepEqual(chatgptLevels, [l('reasoningDefault'), l('reasoning_low'), l('reasoning_high')]);
        await f.page.getByLabel(l('reasoning'), { exact: true }).last().selectOption('high');
        assert.deepEqual(await f.page.locator('#personal-default-reasoning option').evaluateAll(o => o.map(x => x.value)), ['', 'none', 'low', 'medium', 'high']);
        await f.page.locator('#personal-default-reasoning').selectOption('none');
        await f.page.getByRole('button', { name: 'Salva associazioni e utilizzo', exact: true }).click();
        await f.page.getByRole('status').filter({ hasText: l('saved') }).waitFor();
        const saved = f.writes.find(w => w.path === '/api/user/api-routing').body;
        assert.equal(saved.default_reasoning, 'none');
        assert.deepEqual(saved.bindings, [{ counselor_id: 2, connection_id: null, chatgpt_model: 'fixture-model', reasoning: 'high' }]);
        // A level both sources offer survives switching from ChatGPT to the API.
        await f.page.locator('#personal-counselor-2').selectOption('api:' + 'a'.repeat(32));
        assert.equal(await f.page.locator('#personal-reasoning-2').inputValue(), 'high');
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('#217: a class that forbids own sources explains it instead of redirecting', async () => {
    const f = await fixture();
    Object.assign(f.settings, { available: false, class_blocked: true });
    try {
        await f.page.goto(`${origin}/profilo/api-personali`);
        await f.page.getByText(personalAPIText('it', 'classBlocked'), { exact: true }).waitFor();
        assert.equal(f.page.url(), `${origin}/profilo/api-personali`);
        assert.equal(await f.page.locator('#personal-default-connection').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
