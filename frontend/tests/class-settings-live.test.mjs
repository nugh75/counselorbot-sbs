// Explicit opt-in: actual dev APIs on the worktree's synthetic test database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('live teacher can open a class, save tools and read back after reload', async () => {
    assert.equal(process.env.CLASS_SETTINGS_LIVE, '1', 'Run only with the documented synthetic database and dev runners');
    const origin = 'http://127.0.0.1:3107';
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    let groupId;
    try {
        // The current fresh-DB bootstrap seeds assessment metadata only. Add
        // representative guided registry rows to this owned synthetic database.
        const adminHeaders = { 'Remote-User': 'c1.synthetic.admin', 'Remote-Groups': 'admins',
            'X-Forwarded-Auth-Secret': 'dev-local-only' };
        const catalog = await (await context.request.get('http://127.0.0.1:8002/admin/instruments', { headers: adminHeaders })).json();
        const existing = new Set(catalog.map(row => row.code));
        for (const code of ['SAVICKAS', 'IDEA', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA', 'C1_DYNAMIC', 'C1_OFF']) {
            if (existing.has(code)) continue;
            const registered = await context.request.post('http://127.0.0.1:8002/admin/instruments', {
                headers: adminHeaders, data: { code, name_en: code, tool_category: 'guided',
                    is_active: code !== 'C1_OFF', target_audience: code === 'OBIETTIVO_DOCENZA' ? 'teacher' : 'student' },
            });
            assert.equal(registered.status(), 200);
        }
        await context.addInitScript(() => { localStorage.setItem('cb_lang', 'en'); });
        const created = await context.request.post(`${origin}/api/admin/groups`, {
            data: { name: 'C1 live verification', code: `GR-LIVE${Date.now()}`, school: 'Synthetic school' },
        });
        assert.equal(created.status(), 200);
        groupId = (await created.json()).id;
        const path = `${origin}/api/teacher/groups/${groupId}/settings`;
        const initial = await (await context.request.get(path)).json();
        assert.equal(initial.revision, 1);
        const toolKeys = new Set(initial.tools.map(row => row.key));
        for (const code of ['SAVICKAS', 'IDEA', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'C1_DYNAMIC']) assert.ok(toolKeys.has(code));
        assert.equal(toolKeys.has('OBIETTIVO_DOCENZA'), false);
        const qsa = initial.tools.find(row => row.key === 'QSA');
        assert.ok(qsa?.admin_enabled);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
        const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'C1 live verification', exact: true }) }).last();
        await card.getByRole('link', { name: 'Open class', exact: true }).click();
        await page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const checkbox = page.getByRole('checkbox', { name: qsa.label_i18n.en || qsa.label_i18n.it || qsa.key, exact: true });
        const dynamic = page.getByRole('checkbox', { name: 'C1_DYNAMIC', exact: true });
        assert.equal(await page.getByRole('checkbox', { name: 'C1_OFF', exact: true }).isDisabled(), true);
        await checkbox.uncheck();
        await dynamic.uncheck();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByText('Settings saved', { exact: true }).waitFor();
        const saved = await (await context.request.get(path)).json();
        assert.equal(saved.revision, 2);
        assert.deepEqual(saved.disabled_tool_keys, ['C1_DYNAMIC', 'QSA']);
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        assert.equal(await checkbox.isChecked(), false);
        assert.equal(await dynamic.isChecked(), false);
        assert.equal((await context.request.put(path, { data: { revision: 1, disabled_tool_keys: [] } })).status(), 409);
        const latest = await (await context.request.get(path)).json();
        assert.deepEqual(latest.disabled_tool_keys, ['C1_DYNAMIC', 'QSA']);
        assert.equal(latest.revision, 2);
        await checkbox.check();
        await dynamic.check();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByText('Settings saved', { exact: true }).waitFor();
        assert.deepEqual((await (await context.request.get(path)).json()).disabled_tool_keys, []);
        assert.deepEqual(errors, []);
    } finally {
        try {
            if (groupId) assert.equal((await context.request.delete(`${origin}/api/admin/groups/${groupId}`)).status(), 200);
        } finally { await context.close(); await browser.close(); }
    }
});
