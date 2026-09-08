import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.ACCOUNT_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });
const ready = () => ({ counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true });
async function fixture({ prefs = ready(), width = 1440, required = false, incompatible = false, noHistory = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    const revision = { id: 1, data: { goal: 'Organizzare lo studio' }, created_at: '2026-09-08T10:00:00Z', source: 'intake' };
    const session = { session_id: 'account-fixture', status: 'completed', counselor_id: 2, language: 'it', messages: [{ role: 'assistant', content: 'Possiamo esplorare il QSA.' }], recommendations: [{ id: 'QSA', reason: 'Riflettere sullo studio' }] };
    await page.route('**/api/**', route => {
        const request = route.request(), url = new URL(request.url());
        let data = [];
        if (request.method() !== 'GET') writes.push({ path: url.pathname, body: request.postDataJSON() });
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'account-fixture', name: 'Test', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') {
            if (request.method() === 'PUT') Object.assign(prefs, { counselor_id: request.postDataJSON().counselor_id ?? prefs.counselor_id, counselor_ready: true, setup_completed: prefs.notebook_ready });
            data = prefs;
        } else if (url.pathname === '/api/counselors') data = [1, 2].map(id => ({ id, name: `Counselor ${id}`, slug: `c${id}`, language: ['it'], is_active: true, suitable: !(incompatible && id === 1 && url.searchParams.has('questionnaire_type')), model_origin: 'local' }));
        else if (url.pathname === '/api/user/learner-profile') {
            if (request.method() === 'POST') { prefs.notebook_ready = true; revision.data = request.postDataJSON(); }
            data = prefs.notebook_ready ? revision : null;
        } else if (url.pathname === '/api/orientation/status') data = { required, completed: !required, latest_session_id: required || noHistory ? null : session.session_id };
        else if (url.pathname === '/api/orientation/sessions') data = { ...session, status: 'in_progress', counselor_id: request.postDataJSON().counselor_id };
        else if (url.pathname.startsWith('/api/orientation/sessions/')) data = session;
        else if (url.pathname === '/api/session/frozen/account-fixture') data = { ...session, questionnaire_type: 'QSA', current_phase: 'intro', experience: 'standard', scores: { C1: 7 }, messages: [{ role: 'user', content: 'Vorrei studiare meglio' }] };
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro', suggested_questions: [] }] };
        return route.fulfill({ json: data });
    });
    return { page, context, prefs, writes, errors };
}
for (const width of [390, 1440]) {
    test(`initial setup once and dedicated counselor navigation at ${width}px`, async () => {
        const { page, context, prefs, writes, errors } = await fixture({ width, noHistory: true, prefs: { counselor_id: null, counselor_ready: false, notebook_ready: false, setup_completed: false } });
        try {
            await page.goto(`${origin}/bussola`);
            await page.getByRole('heading', { name: 'Prepara il tuo spazio', exact: true }).waitFor();
            await page.getByRole('button', { name: /Counselor 1/ }).click();
            assert.equal(writes.length, 0, 'selection is a draft until confirmation');
            await page.getByRole('button', { name: 'Continua', exact: true }).click();
            await page.getByLabel('Il tuo obiettivo in questo momento').fill('Organizzare lo studio');
            await page.getByRole('button', { name: 'Salva taccuino', exact: true }).click();
            await page.getByRole('heading', { name: 'Da dove vuoi cominciare?', exact: true }).waitFor();
            assert.deepEqual(prefs, ready());
            await page.getByRole('button', { name: 'Vai direttamente agli strumenti', exact: true }).click();
            await page.getByRole('button', { name: 'Analizza i risultati', exact: true }).first().click();
            await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: 'È ancora così', exact: true }).count(), 0);
            await page.goto(`${origin}/counselor`);
            await page.getByRole('button', { name: /Counselor 2/ }).click();
            assert.equal(prefs.counselor_id, 1);
            await page.getByRole('button', { name: 'Continua', exact: true }).click();
            await page.waitForURL(`${origin}/`);
            assert.equal(prefs.counselor_id, 2);
            await page.evaluate(() => localStorage.removeItem('counselorbot_selected_counselor'));
            await page.reload();
            await page.waitForFunction(() => localStorage.getItem('counselorbot_selected_counselor') === '2');
            if (width < 1280) await page.locator('button[aria-controls="mobile-menu"]').click();
            await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).filter({ visible: true }).click();
            await page.getByRole('heading', { name: 'Scegli il counselor', exact: true }).waitFor();
            assert.equal(await page.locator('main select').count(), 0);
            assert.equal(await page.locator('#mobile-menu').count(), 0);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(errors, []);
            await page.screenshot({ path: `/tmp/account-counselor-${width}.png`, fullPage: true });
        } finally { await context.close(); }
    });
}
test('new Compass and recommended tools reuse defaults without notebook interruptions', async () => {
    const { page, context, writes } = await fixture();
    try {
        await page.goto(`${origin}/bussola`);
        await page.getByRole('button', { name: 'Inizia un nuovo orientamento', exact: true }).click();
        await page.locator('#bussola-composer').waitFor();
        assert.equal(writes.find(w => w.path === '/api/orientation/sessions').body.counselor_id, 1);
        await page.getByRole('button', { name: 'Esplora questo strumento', exact: true }).click();
        await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
        assert.equal(writes.filter(w => w.path === '/api/user/learner-profile').length, 0);
    } finally { await context.close(); }
});
test('incompatible counselor opens the dedicated page and cannot be confirmed', async () => {
    const { page, context, prefs } = await fixture({ incompatible: true });
    try {
        await page.goto(`${origin}/?start=QSA`);
        await page.getByRole('heading', { name: 'Scegli il counselor', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Continua', exact: true }).isDisabled(), true);
        await page.getByRole('button', { name: /Counselor 2/ }).click();
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
        assert.equal(prefs.counselor_id, 2);
    } finally { await context.close(); }
});
test('frozen conversation keeps its own counselor and account defaults stay unchanged', async () => {
    const { page, context, prefs, writes } = await fixture();
    try {
        await page.goto(`${origin}/?frozen=account-fixture`);
        await page.locator('#guided-composer').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('counselorbot_selected_counselor')), '2');
        assert.equal(prefs.counselor_id, 1);
        await page.evaluate(() => {
            localStorage.setItem('counselorbot_selected_counselor', '1');
            window.dispatchEvent(new Event('storage'));
        });
        await page.locator('#guided-composer').fill('Come posso organizzarmi?');
        await page.locator('#guided-composer').press('Enter');
        await page.waitForTimeout(500);
        const turn = writes.find(w => w.body?.message === 'Come posso organizzarmi?');
        assert.equal(turn?.body.counselor_id, 2, 'changing defaults cannot alter the active conversation');
        assert.equal(await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).innerText(), 'Counselor 2');
    } finally { await context.close(); }
});

test('setup load errors offer retry instead of silently opening an instrument', async () => {
    const { page, context } = await fixture();
    try {
        await page.route('**/api/user/account-preferences', route => route.fulfill({ status: 503, json: {} }));
        await page.goto(`${origin}/?start=QSA`);
        await page.getByRole('button', { name: 'Riprova', exact: true }).waitFor();
        assert.equal(await page.getByText('Inserimento Manuale', { exact: true }).count(), 0);
        await page.unroute('**/api/user/account-preferences');
        await page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
    } finally { await context.close(); }
});

test('failed counselor save keeps the previous account preference and can be retried', async () => {
    const { page, context, prefs } = await fixture();
    try {
        await page.goto(`${origin}/counselor`);
        await page.getByRole('button', { name: /Counselor 2/ }).click();
        await page.route('**/api/user/account-preferences', route => route.request().method() === 'PUT'
            ? route.fulfill({ status: 503, json: {} }) : route.fallback());
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        await page.getByRole('button', { name: 'Riprova', exact: true }).waitFor();
        assert.equal(prefs.counselor_id, 1);
        await page.unroute('**/api/user/account-preferences');
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        await page.waitForURL(`${origin}/`);
        assert.equal(prefs.counselor_id, 2);
    } finally { await context.close(); }
});
