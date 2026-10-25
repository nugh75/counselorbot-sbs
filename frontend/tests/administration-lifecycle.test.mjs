import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.ADMINISTRATIONS_BASE_URL || 'http://127.0.0.1:3162';
const seed = { id: 12, code: 'AP-SYN012', title: 'Somministrazione sintetica', instrument_code: 'QSA', locale: 'en',
    group_id: null, institution_id: null, institution_link_state: 'unlinked', revision: 1, status: 'active',
    created_at: '2026-10-01T10:00:00Z', researchers: [], responses_count: 1 };

async function setup(page, role = 'teacher') {
    let plans = [{...seed}];
    const writes = [];
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(data)});
        if (url.pathname === '/api/auth/me') return json({authenticated: true, is_admin: role === 'admin', username: 'synthetic-teacher', groups: [role === 'admin' ? 'admins' : 'docenti']});
        if (url.pathname === '/api/user/account-preferences') return json({setup_completed: true, counselor_ready: true, notebook_ready: true});
        if (url.pathname === '/api/user/account') return json({setup_complete: true, notebook_completed: true});
        if (url.pathname === '/api/orientation/status') return json({required: false, completed: true});
        if (url.pathname === '/api/admin/administration-plans' && route.request().method() === 'GET') return json(plans);
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
    const browser = await chromium.launch({headless: true});
    try {
        const page = await browser.newPage();
        const writes = await setup(page, role);
        page.setDefaultTimeout(60000);
        await page.goto(`${origin}/docente/somministrazioni#plan-12`, {waitUntil: 'domcontentloaded', timeout: 120000});
        const card = page.locator('#plan-12');
        await card.getByRole('button', {name: 'Archivia', exact: true}).waitFor();
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
    } finally { await browser.close(); }
});
