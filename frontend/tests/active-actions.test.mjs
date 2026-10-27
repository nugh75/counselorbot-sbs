import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.ACTIVE_ACTIONS_BASE_URL || 'http://127.0.0.1:3171';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const action = (id, stage = 'doing', dates = {}) => ({ id, title: `Attività ${id}`, stage, detail: '', reflection: '', source: '', ...dates });
const question = 'Sei sicuro di voler eliminare questa attività?';

async function fixture({ width = 1280, lang = 'it', actions = [action('uno'), action('due')], restricted = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    const state = { reads: 0, writes: [], failRead: false, failSave: false, errors: [], revision: 1,
        workspace: { actions, cards: [], comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' }, timeline: { title: '', events: [] } } };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'actions-test', name: 'Studente', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/user/access') data = { restricted, tool_keys: [] };
        else if (path === '/api/user/questionnaire-results') data = [{ id: 1, session_id: 'existing', questionnaire_type: 'QSA', scores: { C1: 5 }, submitted_at: '2026-10-26T12:00:00Z' }];
        else if (path.endsWith('/existing/conversation')) data = [{ role: 'assistant', text: 'Dialogo già presente.' }];
        else if (path === '/api/user/readings') data = null;
        else if (path === '/api/orientation-directory') data = { institution: null, events: [], referrals: [] };
        else if (path === '/api/tavolo/enabled') data = { enabled: false };
        else if (path === '/api/user/timeline') {
            if (request.method() === 'PUT') {
                const body = request.postDataJSON(); state.writes.push(body);
                if (state.failSave) return route.fulfill({ status: 503, json: {} });
                state.workspace = body.workspace; state.revision++;
            } else {
                state.reads++;
                if (state.failRead) return route.fulfill({ status: 503, json: {} });
            }
            data = { revision: state.revision, workspace: state.workspace };
        }
        return route.fulfill({ json: data });
    });
    return { page, context, state };
}

for (const width of [390, 1280]) {
    test(`in-progress list preserves results and resumes the correct card at ${width}px`, async () => {
        const f = await fixture({ width, actions: [action('done', 'done'), action('todo', 'todo'),
            ...['a', 'b', 'c', 'd', 'e', 'f'].map(id => action(id, 'doing', { start_date: '2026-10-27', date_mode: 'point' }))] });
        try {
            await f.page.goto(`${origin}/profilo/compilazioni`, { waitUntil: 'domcontentloaded' });
            const list = f.page.getByRole('region', { name: 'Attività in corso', exact: true });
            await list.waitFor();
            assert.equal(await list.getByRole('listitem').count(), 5);
            assert.match(await list.textContent(), /In corso/);
            await f.page.getByText('Ritrova i risultati dei questionari e i dialoghi collegati.', { exact: true }).waitFor();
            await f.page.getByRole('heading', { name: 'Risultato della compilazione', exact: true }).waitFor();
            await f.page.getByText('Dialogo già presente.', { exact: true }).waitFor();
            assert.equal(await list.getByRole('link', { name: 'Vedi tutte le attività' }).getAttribute('href'), '/profilo/azioni');
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await f.page.screenshot({ path: `../output/playwright/active-actions-${width}.png`, fullPage: true });
            await list.getByRole('link', { name: 'Apri l’attività: Attività c', exact: true }).click();
            await f.page.waitForURL('**/profilo/azioni#action-c');
            await f.page.waitForFunction(() => document.activeElement?.id === 'action-c');
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });

    test(`delete is keyboard accessible, cancellable, selective and retryable at ${width}px`, async () => {
        const f = await fixture({ width });
        try {
            await f.page.goto(`${origin}/profilo/azioni`, { waitUntil: 'domcontentloaded' });
            const trash = f.page.getByRole('button', { name: 'Rimuovi: Attività uno', exact: true });
            await trash.focus(); await f.page.keyboard.press('Enter');
            const modal = f.page.getByRole('dialog', { name: question, exact: true });
            await modal.waitFor();
            await f.page.screenshot({ path: `../output/playwright/confirm-delete-action-${width}.png` });
            assert.equal(await f.page.evaluate(() => document.activeElement?.textContent), 'Annulla');
            await f.page.keyboard.press('Shift+Tab');
            assert.equal(await f.page.evaluate(() => document.activeElement?.textContent), 'Rimuovi');
            await f.page.keyboard.press('Tab');
            assert.equal(await f.page.evaluate(() => document.activeElement?.textContent), 'Annulla');
            assert.deepEqual(f.state.writes, []);
            await f.page.keyboard.press('Escape');
            await modal.waitFor({ state: 'detached' });
            assert.equal(await trash.evaluate(element => element === document.activeElement), true);
            assert.equal(await f.page.locator('#action-uno').count(), 1);
            await trash.click(); await modal.getByRole('button', { name: 'Annulla', exact: true }).click();
            assert.equal(await f.page.locator('#action-uno').count(), 1);
            await trash.click(); await modal.getByRole('button', { name: 'Rimuovi', exact: true }).click();
            assert.equal(await f.page.locator('#action-uno').count(), 0);
            assert.equal(await f.page.locator('#action-due').count(), 1);
            assert.deepEqual(f.state.writes, []);
            f.state.failSave = true;
            await f.page.getByRole('button', { name: 'Salva nell’Area studente', exact: true }).click();
            const alert = f.page.getByRole('region', { name: 'Bacheca delle azioni', exact: true }).getByRole('alert'); await alert.waitFor();
            assert.equal(f.state.workspace.actions.length, 2, 'failed save preserves persisted work');
            assert.deepEqual(f.state.writes[0].workspace.actions.map(row => row.id), ['due']);
            f.state.failSave = false;
            await alert.getByRole('button', { name: 'Riprova', exact: true }).click();
            await alert.waitFor({ state: 'detached' });
            assert.deepEqual(f.state.workspace.actions.map(row => row.id), ['due']);
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}

test('failed activity load leaves results available and supports retry', async () => {
    const f = await fixture(); f.state.failRead = true;
    try {
        await f.page.goto(`${origin}/profilo/compilazioni`, { waitUntil: 'domcontentloaded' });
        const alert = f.page.getByRole('alert').filter({ hasText: 'Non riesco a caricare le attività in corso.' });
        await alert.waitFor();
        await f.page.getByRole('heading', { name: 'Risultato della compilazione', exact: true }).waitFor();
        f.state.failRead = false;
        await alert.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.page.getByRole('link', { name: 'Apri l’attività: Attività uno', exact: true }).waitFor();
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const options of [{ actions: [] }, { restricted: true }]) {
    test(`no activity shortcut for ${options.restricted ? 'disabled tool' : 'empty work'}`, async () => {
        const f = await fixture(options);
        try {
            await f.page.goto(`${origin}/profilo/compilazioni`, { waitUntil: 'networkidle' });
            assert.equal(await f.page.getByRole('region', { name: 'Attività in corso', exact: true }).count(), 0);
            await f.page.getByRole('heading', { name: 'Risultato della compilazione', exact: true }).waitFor();
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}
