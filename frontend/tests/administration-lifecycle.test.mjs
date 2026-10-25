import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless: true});
const context = await browser.newContext();
after(async () => {await context.close(); await browser.close();});

const origin = process.env.ADMINISTRATIONS_BASE_URL || 'http://127.0.0.1:3162';
const seed = { id: 12, code: 'AP-SYN012', title: 'Somministrazione sintetica', instrument_code: 'QSA', locale: 'en',
    group_id: null, institution_id: null, institution_link_state: 'unlinked', revision: 1, status: 'active',
    created_at: '2026-10-01T10:00:00Z', researchers: [], responses_count: 1 };

async function setup(page, role = 'teacher', failures = 0) {
    page.on('pageerror', error => console.error('Browser error:', error.message));
    let plans = [{...seed}];
    const writes = [];
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/runtime-config.js') return route.fulfill({status: 200, contentType: 'text/javascript', body: `window.__COUNSELORBOT_CONFIG__=${JSON.stringify({appUrl: origin, authBase: origin, portalUrl: origin, managerUrl: origin})};`});
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(data)});
        if (url.pathname === '/api/auth/me') return json({authenticated: true, is_admin: role === 'admin', username: 'synthetic-teacher', name: 'Synthetic teacher', email: 'teacher@example.invalid', is_researcher: false, groups: [role === 'admin' ? 'admins' : 'docenti']});
        if (url.pathname === '/api/user/account-preferences') return json({setup_completed: true, counselor_ready: true, notebook_ready: true});
        if (url.pathname === '/api/user/account') return json({setup_complete: true, notebook_completed: true});
        if (url.pathname === '/api/orientation/status') return json({required: false, completed: true});
        if (url.pathname === '/api/admin/administration-plans' && route.request().method() === 'GET') return json(plans);
        if (url.pathname === '/api/admin/administration-plans/12/replace') {
            const body = route.request().postDataJSON();
            writes.push(body);
            if (failures-- > 0) {
                plans = [{...plans[0], revision: plans[0].revision + 1}];
                return json({detail: 'administration_revision_conflict'}, 409);
            }
            const created = {...seed, ...body.replacement, id: 13, code: 'AP-SYN013', revision: 1, responses_count: 0};
            plans = [{...plans[0], status: 'archived', revision: body.revision + 1}, created];
            return json(created);
        }
        if (url.pathname === '/api/admin/administration-plans/12' && route.request().method() === 'PUT') {
            const body = route.request().postDataJSON();
            writes.push(body);
            plans = [{...plans[0], ...body, revision: body.revision + 1}];
            return json(plans[0]);
        }
        return json([]);
    });
    return writes;
}

for (const role of ['teacher', 'admin']) test(`archive and restore from shared ${role} panel`, async () => {
    const page = await context.newPage();
    try {
        const writes = await setup(page, role);
        page.setDefaultTimeout(Number(process.env.UI_TEST_TIMEOUT || 60000));
        await page.goto(`${origin}/docente/somministrazioni#plan-12`, {waitUntil: 'domcontentloaded', timeout: 120000});
        const card = page.locator('#plan-12');
        await card.getByRole('button', {name: 'Archivia', exact: true}).waitFor().catch(async error => {
            throw new Error(`${error.message}\nPage: ${await page.locator('body').innerText()}`);
        });
        page.once('dialog', async dialog => { assert.match(dialog.message(), /dati raccolti resteranno consultabili/); await dialog.dismiss(); });
        await card.getByRole('button', {name: 'Archivia', exact: true}).click();
        assert.equal(writes.length, 0);
        page.once('dialog', dialog => dialog.accept());
        await card.getByRole('button', {name: 'Archivia', exact: true}).click();
        await card.getByText('Archiviato', {exact: true}).waitFor();
        assert.deepEqual(writes[0], {revision: 1, status: 'archived'});
        page.once('dialog', dialog => dialog.accept());
        await card.getByRole('button', {name: 'Ripristina', exact: true}).click();
        await card.getByText('Pianificato', {exact: true}).waitFor();
        assert.deepEqual(writes[1], {revision: 2, status: 'planned'});
    } finally { await page.close(); }
});


test('choose replacement, cancel, recover from conflict, then archive old and start clean', async () => {
    const page = await context.newPage();
    try {
        page.setDefaultTimeout(Number(process.env.UI_TEST_TIMEOUT || 60000));
        const writes = await setup(page, 'teacher', 1);
        await page.goto(`${origin}/docente/somministrazioni`, {waitUntil: 'domcontentloaded', timeout: 120000});
        await page.locator('#plan-12').getByRole('button', {name: 'Sostituisci', exact: true}).click();
        await page.getByRole('status').getByText(/Scegli il nuovo piano/).waitFor();
        await page.getByRole('textbox', {name: /Titolo/}).fill('Nuovo piano sintetico');
        await page.getByRole('combobox').first().selectOption('ZTPI');
        const save = page.getByRole('button', {name: 'Archivia e avvia la nuova', exact: true});
        page.once('dialog', dialog => dialog.dismiss());
        await save.click();
        assert.equal(writes.length, 0);
        page.once('dialog', dialog => dialog.accept());
        await save.click();
        await page.getByText(/modificato altrove/i).waitFor();
        assert.equal(await page.getByRole('textbox', {name: /Titolo/}).inputValue(), 'Nuovo piano sintetico');
        await page.getByRole('button', {name: 'Aggiorna', exact: true}).click();
        await page.getByRole('button', {name: 'Aggiorna', exact: true}).locator('.animate-spin').waitFor({state: 'detached'});
        await page.getByRole('textbox', {name: /Titolo/}).waitFor();
        page.once('dialog', dialog => dialog.accept());
        await save.click();
        await page.locator('#plan-12').getByText('Archiviato', {exact: true}).waitFor();
        await page.locator('#plan-13').getByText('AP-SYN013', {exact: true}).waitFor();
        assert.equal(writes.length, 2);
        assert.equal(writes[1].revision, 2);
        assert.equal(writes[1].replacement.instrument_code, 'ZTPI');
        assert.equal(writes[1].replacement.status, 'active');
        await page.getByText(/Nuova somministrazione creata: AP-SYN013, senza risposte/).waitFor();
    } finally { await page.close(); }
});
