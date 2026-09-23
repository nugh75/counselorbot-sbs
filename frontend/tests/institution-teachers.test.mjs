import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { institutionTeacherText } from '../src/lib/i18n-institution-teachers.ts';

const origin = process.env.INSTITUTION_TEACHERS_BASE_URL || 'http://127.0.0.1:3108';
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const tabs = ['Referenti ed eventi', 'Referrals and events', 'Referentes y eventos', 'Référents et événements', 'Ansprechpersonen und Veranstaltungen', 'Kontaktpersoner och evenemang'];
const institutions = ['Istituti', 'Institutions', 'Instituciones', 'Établissements', 'Einrichtungen', 'Institutioner'];
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function fixture(lang, admin = true) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const page = await context.newPage();
    let members = []; let failLoad = false; let failSave = false;
    const errors = []; const calls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const path = new URL(request.url()).pathname;
        calls.push([request.method(), path]);
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'admin-fixture', is_admin: admin, is_researcher: !admin, groups: [admin ? 'admins' : 'researchers'] };
        else if (path === '/api/admin/institutions') data = [{ id: 1, name: 'Istituto dimostrativo', slug: 'demo', kind: 'school', is_active: true }];
        else if (path.startsWith('/api/admin/institutions/1/teachers')) {
            if (request.method() === 'GET') {
                if (failLoad) return route.fulfill({ status: 503, json: {} });
                data = members;
            } else if (failSave) return route.fulfill({ status: 503, json: {} });
            else if (request.method() === 'POST') {
                const username = request.postDataJSON().username;
                assert.equal(username, username.trim());
                data = { id: 1, institution_id: 1, username, is_active: true };
                members = [data];
            } else if (request.method() === 'DELETE') {
                assert.equal(path, '/api/admin/institutions/1/teachers/1');
                members = []; data = { status: 'revoked', id: 1 };
            }
        } else assert.equal(request.method(), 'GET', 'only membership actions may write');
        return route.fulfill({ json: data });
    });
    const index = languages.indexOf(lang);
    await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
    if (await page.locator('#admin-section').isVisible()) await page.locator('#admin-section').selectOption('orientationReferrals');
    else await page.getByRole('button', { name: tabs[index], exact: true }).click();
    await page.getByRole('button', { name: institutions[index], exact: true }).click();
    return { page, context, errors, calls, loadError: value => { failLoad = value; }, saveError: value => { failSave = value; } };
}

for (const lang of languages) test(`administrator associates and revokes a teacher (${lang})`, async () => {
    const f = await fixture(lang); const l = key => institutionTeacherText(lang, key);
    try {
        const summary = f.page.locator('summary').filter({ hasText: l('title') });
        await summary.click();
        const panel = summary.locator('..');
        await panel.getByText(l('empty'), { exact: true }).waitFor();
        await panel.getByLabel(l('account'), { exact: true }).fill(' docente.prova@example.test ');
        await panel.getByRole('button', { name: l('associate'), exact: true }).click();
        await panel.getByText('docente.prova@example.test', { exact: true }).waitFor();
        assert.equal(await panel.getByLabel(l('account'), { exact: true }).inputValue(), '');
        for (const width of [320, 390, 1440]) {
            await f.page.setViewportSize({ width, height: 900 });
            const box = await panel.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= width, 'membership panel fits viewport');
            if (lang === 'it') await panel.screenshot({ path: `/tmp/institution-teachers-${width}.png` });
        }
        if (lang === 'it') {
            f.saveError(true);
            await panel.getByRole('button', { name: `${l('revoke')}: docente.prova@example.test`, exact: true }).click();
            await panel.getByRole('alert').waitFor();
            assert.equal(await panel.getByText('docente.prova@example.test', { exact: true }).count(), 1);
            f.saveError(false);
            await panel.getByRole('button', { name: l('retry'), exact: true }).click();
            await panel.getByRole('alert').waitFor({ state: 'detached' });
        }
        await panel.getByRole('button', { name: `${l('revoke')}: docente.prova@example.test`, exact: true }).click();
        await panel.getByText(l('empty'), { exact: true }).waitFor();
        if (lang === 'it') {
            await summary.click(); f.loadError(true); await summary.click();
            await panel.getByRole('alert').waitFor();
            assert.ok(await panel.getByLabel(l('account'), { exact: true }).isDisabled());
            f.loadError(false); await panel.getByRole('button', { name: l('retry'), exact: true }).click();
            await panel.getByRole('alert').waitFor({ state: 'detached' });
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('researcher cannot see or load administrator-only memberships', async () => {
    const f = await fixture('it', false);
    try {
        await f.page.locator('p').filter({ hasText: /^Istituto dimostrativo$/ }).waitFor();
        assert.equal(await f.page.locator('summary').filter({ hasText: 'Docenti dell’istituto' }).count(), 0);
        assert.equal(f.calls.filter(([, path]) => path.endsWith('/teachers')).length, 0);
    } finally { await f.context.close(); }
});
