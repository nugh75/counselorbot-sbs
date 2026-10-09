// Opt-in only: secret-free dev runners and the synthetic C20 PostgreSQL DB.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('live admin directory, settings, locks, teacher rejection, unlock and audit', async () => {
    assert.equal(process.env.CLASS_ADMIN_LIVE, '1', 'Requires synthetic test DB and documented dev runners');
    const origin = 'http://127.0.0.1:3177';
    const backend = 'http://127.0.0.1:8072';
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.addInitScript(() => { localStorage.setItem('cb_lang', 'en'); });
    const adminHeaders = { 'Remote-User': 'c20.synthetic.admin', 'Remote-Groups': 'admins', 'X-Forwarded-Auth-Secret': 'dev-local-only' };
    const teacherHeaders = { ...adminHeaders, 'Remote-User': 'c20.synthetic.teacher', 'Remote-Groups': 'docenti' };
    let groupId;
    try {
        const created = await context.request.post(`${backend}/admin/groups`, { headers: teacherHeaders,
            data: { name: 'C20 admin settings verification', code: `GR-C20${Date.now()}`, school: 'Synthetic school' } });
        assert.equal(created.status(), 200);
        groupId = (await created.json()).id;
        const path = `${backend}/teacher/groups/${groupId}/settings`;
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await page.goto(`${origin}/admin/classi`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'All classes', exact: true }).waitFor();
        await page.getByLabel('Search class, code, school', { exact: true }).fill('C20 admin settings verification');
        await page.getByRole('combobox', { name: 'Owner teacher', exact: true }).selectOption('c20.synthetic.teacher');
        await page.getByRole('button', { name: 'Filter', exact: true }).click();
        const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'C20 admin settings verification', exact: true }) });
        await card.getByRole('link', { name: 'Settings & locks · Change history', exact: true }).click();
        await page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const initial = await (await context.request.get(path, { headers: adminHeaders })).json();
        const qsa = initial.tools.find(row => row.key === 'QSA');
        assert.ok(qsa?.admin_enabled);
        const label = qsa.label_i18n.en || qsa.label_i18n.it || qsa.key;
        const checkbox = page.getByRole('checkbox', { name: label, exact: true });
        await checkbox.uncheck();
        await page.getByLabel('Reason (optional)', { exact: true }).fill('Synthetic admin change');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByText('Settings saved', { exact: true }).waitFor();
        const controls = page.getByRole('group', { name: `Settings & locks: ${label}`, exact: true });
        await page.getByLabel('Reason (optional)', { exact: true }).fill('Synthetic policy');
        await controls.getByRole('button', { name: 'Lock ON', exact: true }).click();
        await page.getByText('Locked by administrator · Enabled', { exact: true }).waitFor();
        assert.equal(await checkbox.isChecked(), true);
        assert.equal(await checkbox.isDisabled(), true);
        const locked = await (await context.request.get(path, { headers: teacherHeaders })).json();
        const denied = await context.request.put(path, { headers: teacherHeaders,
            data: { revision: locked.revision, disabled_tool_keys: ['QSA'] } });
        assert.equal(denied.status(), 422);
        assert.deepEqual(await denied.json(), { detail: 'item_locked_by_admin', item_kind: 'tool', item_id: 'QSA' });
        assert.equal((await context.request.get(`${backend}/admin/classes`, { headers: teacherHeaders })).status(), 403);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: '../backend/.venv/c20-admin-settings-live.png', fullPage: true });
        await controls.getByRole('button', { name: 'Unlock', exact: true }).click();
        await page.getByText('Changed by administrator', { exact: true }).waitFor();
        assert.equal(await checkbox.isDisabled(), false);
        await page.getByRole('tab', { name: 'Change history', exact: true }).click();
        await page.getByText('Synthetic policy', { exact: true }).waitFor();
        const audit = await (await context.request.get(`${path}/audit-log`, { headers: teacherHeaders })).json();
        assert.deepEqual(audit.map(row => row.action), ['unlock', 'lock', 'setting_change']);
        assert.equal(audit[1].reason, 'Synthetic policy');
        assert.equal(audit[2].reason, 'Synthetic admin change');
        assert.ok(audit.every(row => row.actor_username === 'c20.synthetic.admin'));
        const unlocked = await (await context.request.get(path, { headers: teacherHeaders })).json();
        assert.equal((await context.request.put(path, { headers: teacherHeaders,
            data: { revision: unlocked.revision, disabled_tool_keys: ['QSA'] } })).status(), 200);
        assert.deepEqual(errors, []);
    } finally {
        try {
            if (groupId) assert.equal((await context.request.delete(`${backend}/admin/groups/${groupId}`, { headers: adminHeaders })).status(), 200);
        } finally { await context.close(); await browser.close(); }
    }
});
