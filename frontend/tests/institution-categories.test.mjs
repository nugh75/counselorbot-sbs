import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { categoryText } from '../src/lib/i18n-institution-categories.ts';

const origin = process.env.CATEGORIES_BASE_URL || 'http://127.0.0.1:3108';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function fixture(lang = 'it', options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ lang, noNavigation }) => {
        localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light');
        if (noNavigation) Object.defineProperty(window, 'navigation', { value: undefined });
    }, { lang, noNavigation: options.noNavigation });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = []; const writes = [];
    const row = (id, name) => ({ id, name, description: 'Descrizione scelta dai docenti', position: Number(id), is_active: true, updated_by: 'docente.demo', updated_at: '2026-09-23T10:00:00Z' });
    const stores = { 1: { revision: 1, categories: options.empty ? [] : [row('1', 'Risorse'), row('2', 'Esperienze')] }, 2: { revision: 0, categories: [] } };
    let fail = false; let denied = false; let failRead = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'docente.demo', name: 'Docente Demo', is_admin: false, groups: ['docenti'] };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/tavolo/enabled') data = { enabled: false };
        else if (path === '/api/teacher/institutions') data = options.unassigned ? [] : [1, ...(options.multiple ? [2] : [])].map(id => ({ id, name: `Istituto ${id}`, slug: `demo-${id}`, kind: 'school' }));
        const match = path.match(/^\/api\/teacher\/institutions\/(\d+)\/orientation-categories$/);
        if (match) {
            if (denied) return route.fulfill({ status: 403, json: {} });
            const store = stores[match[1]];
            if (request.method() === 'POST') {
                const body = request.postDataJSON(); writes.push(body);
                if (fail) return route.fulfill({ status: 503, json: {} });
                if (body.revision !== store.revision) return route.fulfill({ status: 409, json: { detail: { code: 'conflict' } } });
                let target = store.categories.find(item => item.id === body.category_id);
                if (body.action === 'create' || body.action === 'edit') {
                    if (store.categories.some(item => item.id !== target?.id && item.name.toLowerCase() === body.name.toLowerCase())) return route.fulfill({ status: 409, json: { detail: { code: 'duplicate' } } });
                    if (!target) { target = row(String(Date.now()), body.name); store.categories.push(target); }
                    target.name = body.name; target.description = body.description;
                } else if (body.action === 'archive') target.is_active = false;
                else if (body.action === 'restore') { target.is_active = true; store.categories = [...store.categories.filter(item => item !== target), target]; }
                else {
                    const index = store.categories.indexOf(target); const to = index + (body.action === 'move_up' ? -1 : 1);
                    [store.categories[index], store.categories[to]] = [store.categories[to], store.categories[index]];
                }
                store.revision++;
            } else if (failRead) return route.fulfill({ status: 503, json: {} });
            data = store;
        } else assert.equal(request.method(), 'GET', 'no unrelated writes');
        return route.fulfill({ json: data });
    });
    const l = key => categoryText(lang, key);
    const open = async () => { await page.goto(`${origin}/docente/orientamento`, { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: l('title'), exact: true }).waitFor(); };
    const actions = async name => { await page.getByRole('button', { name: `${l('actions')}: ${name}`, exact: true }).click(); };
    return { page, context, errors, writes, stores, l, open, actions, fail: value => { fail = value; }, deny: value => { denied = value; }, failRead: value => { failRead = value; } };
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) test(`shared category editor lifecycle and layout (${lang})`, async () => {
    const f = await fixture(lang); const { page, l } = f;
    try {
        await f.open();
        assert.equal(await page.getByRole('combobox').count(), 0, 'one institution needs no selector');
        await page.getByRole('button', { name: l('new'), exact: true }).click();
        const name = page.getByLabel(`${l('name')} *`, { exact: true });
        await name.fill('Prossimi passi');
        await page.getByLabel(l('description'), { exact: true }).fill('Una descrizione condivisa');
        await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByRole('heading', { name: 'Prossimi passi', exact: true }).waitFor();
        await f.actions('Prossimi passi');
        await page.getByRole('button', { name: l('edit'), exact: true }).click();
        await name.fill('Nuovi passi');
        await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByRole('heading', { name: 'Nuovi passi', exact: true }).waitFor();
        await f.actions('Nuovi passi'); await page.getByRole('button', { name: l('up'), exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('[data-category-id] h3')[1]?.textContent === 'Nuovi passi');
        await f.actions('Risorse');
        assert.ok(await page.getByRole('button', { name: l('up'), exact: true }).isDisabled());
        await page.keyboard.press('Escape');
        assert.ok(await page.getByRole('button', { name: `${l('actions')}: Risorse`, exact: true }).evaluate(el => el === document.activeElement));
        await f.actions('Nuovi passi'); await page.getByRole('button', { name: l('archive'), exact: true }).click();
        const archived = page.locator('summary').filter({ hasText: l('archived') }); await archived.click();
        await page.getByRole('button', { name: l('restore'), exact: true }).click();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-category-id] h3')].at(-1)?.textContent === 'Nuovi passi');
        for (const width of [320, 390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.locator('[data-institution-categories] img').evaluate(el => el.decode());
            if (lang === 'it') await page.screenshot({ path: `/tmp/institution-categories-${width}.png`, fullPage: true });
        }
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.setViewportSize({ width: 390, height: 844 });
        if (lang === 'it') await page.screenshot({ path: '/tmp/institution-categories-dark.png', fullPage: true });
        assert.deepEqual(f.errors, []);
        assert.equal(f.writes.length, 5);
    } finally { await f.context.close(); }
});

test('conflicts, duplicate names, network failures and revocation preserve the form', async () => {
    const f = await fixture(); const { page, l } = f;
    try {
        await f.open(); await f.actions('Risorse'); await page.getByRole('button', { name: l('edit'), exact: true }).click();
        const name = page.getByLabel(`${l('name')} *`, { exact: true }); await name.fill('Testo da conservare');
        f.stores[1].revision++; f.stores[1].categories[0].name = 'Modifica del collega';
        await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByText(l('conflict'), { exact: true }).waitFor();
        assert.equal(await name.inputValue(), 'Testo da conservare');
        assert.ok(await page.getByRole('button', { name: l('save'), exact: true }).isDisabled());
        await page.getByRole('button', { name: l('retry'), exact: true }).click();
        await page.getByRole('heading', { name: 'Modifica del collega', exact: true }).waitFor();
        assert.equal(await name.inputValue(), 'Testo da conservare');
        await name.fill('Esperienze'); await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByText(l('duplicate'), { exact: true }).waitFor();
        await name.fill('Il mio testo'); f.fail(true);
        await page.getByRole('button', { name: l('save'), exact: true }).click(); await page.getByText(l('saveError'), { exact: true }).waitFor();
        assert.equal(await name.inputValue(), 'Il mio testo');
        f.fail(false); f.deny(true);
        await page.getByRole('button', { name: l('save'), exact: true }).click(); await page.getByText(l('denied'), { exact: true }).waitFor();
        assert.equal(await name.inputValue(), 'Il mio testo');
        assert.ok(await page.getByRole('button', { name: l('save'), exact: true }).isDisabled());
    } finally { await f.context.close(); }
});

for (const noNavigation of [false, true]) test(`unsaved form guards links, institute changes and browser back (fallback=${noNavigation})`, async () => {
    const f = await fixture('it', { multiple: true, noNavigation }); const { page, l } = f;
    let accept = false; const dialogs = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
    try {
        await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
        await page.getByRole('link', { name: l('title'), exact: true }).click();
        await page.getByRole('button', { name: l('new'), exact: true }).click();
        const name = page.getByLabel(`${l('name')} *`, { exact: true }); await name.fill('Bozza importante');
        await page.getByRole('combobox', { name: l('institution'), exact: true }).selectOption('2');
        assert.equal(await page.getByRole('combobox').inputValue(), '1');
        await page.getByRole('link', { name: l('back'), exact: true }).click();
        await page.waitForTimeout(300);
        assert.ok(page.url().endsWith('/docente/orientamento'));
        await page.evaluate(() => history.back());
        await page.waitForTimeout(300);
        assert.ok(page.url().endsWith('/docente/orientamento'));
        assert.equal(await name.inputValue(), 'Bozza importante');
        assert.ok(dialogs.length >= 3);
        assert.equal(f.writes.length, 0);
        accept = true;
        await page.getByRole('combobox').selectOption('2');
        await page.getByText(l('empty'), { exact: true }).waitFor();
        assert.equal(await page.locator('form').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('unassigned teacher sees an explanation without editing controls', async () => {
    const f = await fixture('it', { unassigned: true });
    try { await f.open(); await f.page.getByText(f.l('noInstitutions'), { exact: true }).waitFor(); assert.equal(await f.page.locator('form').count(), 0); }
    finally { await f.context.close(); }
});

test('initial read failure can be retried', async () => {
    const f = await fixture();
    try { f.failRead(true); await f.open(); await f.page.getByText(f.l('loadError'), { exact: true }).waitFor(); f.failRead(false); await f.page.getByRole('button', { name: f.l('retry'), exact: true }).click(); await f.page.getByRole('heading', { name: 'Risorse', exact: true }).waitFor(); }
    finally { await f.context.close(); }
});


for (const noNavigation of [false, true]) test(`confirmed back exits and cancelling restores normal history (fallback=${noNavigation})`, async () => {
    const f = await fixture('it', { noNavigation }); const { page, l } = f;
    page.on('dialog', dialog => dialog.accept());
    try {
        await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
        await page.getByRole('link', { name: l('title'), exact: true }).click();
        await page.getByRole('button', { name: l('new'), exact: true }).click();
        await page.getByLabel(`${l('name')} *`, { exact: true }).fill('Bozza');
        await page.evaluate(() => history.back());
        await page.waitForURL(`${origin}/docente`);
        await page.getByRole('link', { name: l('title'), exact: true }).click();
        await page.getByRole('button', { name: l('new'), exact: true }).click();
        await page.getByLabel(`${l('name')} *`, { exact: true }).fill('Altra bozza');
        await page.getByRole('button', { name: l('cancel'), exact: true }).click();
        await page.waitForTimeout(300);
        await page.evaluate(() => history.back());
        await page.waitForURL(`${origin}/docente`);
        assert.equal(f.writes.length, 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
