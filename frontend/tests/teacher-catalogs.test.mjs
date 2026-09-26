import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.TEACHER_CATALOGS_BASE_URL || 'http://127.0.0.1:3097').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function prepare(page, { teacher = true, lang = 'it', dark = false, path = '/docente' } = {}) {
    page.setDefaultTimeout(10000);
    const writes = [];
    const errors = [];
    const rows = { strategies: [], readings: [] };
    let memberships = [{ membership_id: 71, group_id: 91, code: 'GR-ADULTI', name: 'Formazione adulti', joined_via: 'web', joined_at: null }];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ lang, dark }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
    }, { lang, dark });
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') data = {
            authenticated: true, is_admin: false, is_researcher: false, username: 'teacher.test',
            name: 'Docente di prova', email: 'teacher@example.invalid', groups: teacher ? ['docenti'] : ['studenti'],
        };
        else if (url.pathname === '/api/admin/instruments') data = [{ code: 'QSA', name_it: 'QSA' }];
        else if (url.pathname === '/api/admin/instruments/QSA/factors') data = [{ id: 1, code: 'C1', instrument_code: 'QSA', label_it: 'Elaborazione' }];
        else if (url.pathname === '/api/admin/reading-themes') data = [{ code: 'metodo-di-studio', label: 'Metodo di studio', factors: ['C1'] }];
        else if (url.pathname === '/api/admin/content-versions/ladders') data = { certified_strategy: ['draft', 'translated', 'certified'], certified_reading: ['draft', 'translated', 'certified'] };
        else if (url.pathname === '/api/user/account') data = { setup_complete: true, notebook_completed: true };
        else if (url.pathname === '/api/user/teacher-notebook') data = { data: {} };
        const match = url.pathname.match(/^\/api\/admin\/certified-(strategies|readings)$/);
        if (match) {
            const kind = match[1];
            if (request.method() === 'POST') {
                const body = request.postDataJSON();
                writes.push({ kind, body });
                data = { ...body, id: rows[kind].length + 1 };
                rows[kind].push(data);
            } else data = rows[kind];
        } else if (url.pathname === '/api/user/groups' && request.method() === 'GET') {
            data = memberships;
        } else if (url.pathname === '/api/groups/join' && request.method() === 'POST') {
            const body = request.postDataJSON();
            writes.push({ kind: 'membership-join', body });
            const member = { membership_id: 72, group_id: 92, code: body.code, name: 'Laboratorio universitario', joined_via: 'web', joined_at: null };
            memberships.push(member);
            data = member;
        } else if (url.pathname === '/api/user/groups/71' && request.method() === 'DELETE') {
            writes.push({ kind: 'membership-leave', membership_id: 71 });
            memberships = memberships.filter(member => member.membership_id !== 71);
            data = { ok: true };
        } else if (request.method() !== 'GET') {
            throw new Error(`Unexpected write: ${request.method()} ${url.pathname}`);
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    return { writes, errors };
}

for (const scenario of [{ width: 1440, teacher: true }, { width: 390, teacher: true }, { width: 390, teacher: false }]) {
    test(`personal membership remains distinct from management: ${scenario.width}px, teacher=${scenario.teacher}`, async () => {
        const page = await browser.newPage({ viewport: { width: scenario.width, height: 950 } });
        try {
            const { writes, errors } = await prepare(page, { ...scenario, path: '/profilo/classi', dark: scenario.width === 390 });
            const membership = page.getByRole('region', { name: 'Gruppi e classi a cui partecipo', exact: true });
            await membership.waitFor();
            await page.getByText(/Gestisci le iscrizioni e leggi i messaggi dei docenti/).waitFor();
            await membership.getByText('Formazione adulti', { exact: true }).waitFor();
            const management = membership.getByRole('link', { name: /vai all’Area docenti/ });
            assert.equal(await management.count(), scenario.teacher ? 1 : 0);
            await membership.getByRole('textbox', { name: /Codice di invito/ }).fill('GR-UNIVERSITA');
            await membership.getByRole('button', { name: 'Entra', exact: true }).click();
            await membership.getByText('Laboratorio universitario', { exact: true }).waitFor();
            await membership.getByRole('listitem').filter({ hasText: 'Formazione adulti' }).getByRole('button', { name: 'Lascia il gruppo: Formazione adulti', exact: true }).click();
            await membership.getByRole('button', { name: 'Sì', exact: true }).click();
            await membership.getByText('Formazione adulti', { exact: true }).waitFor({ state: 'detached' });
            assert.deepEqual(writes, [{ kind: 'membership-join', body: { code: 'GR-UNIVERSITA' } }, { kind: 'membership-leave', membership_id: 71 }]);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            if (scenario.teacher) {
                await management.click();
                await page.waitForURL(`${origin}/docente/classi`);
                await page.getByRole('heading', { name: 'Gruppi e classi che gestisco', exact: true }).waitFor();
                await page.getByRole('button', { name: 'Nuovo gruppo o classe', exact: true }).click();
                await page.getByPlaceholder('Nome (es. 3B, universitari, formazione adulti)').waitFor();
                assert.equal(await page.locator('option').filter({ hasText: /^Adulti$/ }).count(), 1);
                assert.equal(await page.locator('option').filter({ hasText: /^Università$/ }).count(), 1);
                assert.equal(await page.locator('a[href="/admin"]').count(), 0);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            }
            assert.deepEqual(errors, []);
        } finally { await page.close(); }
    });
}

for (const scenario of [{ width: 1440, height: 1000, dark: false }, { width: 390, height: 844, dark: true }]) {
    test(`teacher creates published strategies and films at ${scenario.width}px`, async () => {
        const context = await browser.newContext({ viewport: scenario });
        try {
            const page = await context.newPage();
            const { writes, errors } = await prepare(page, scenario);
            await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
            await page.getByRole('heading', { name: 'Area docenti', exact: true }).waitFor();
            assert.equal(await page.locator('a[href="/admin"]').count(), 0, 'catalog access does not show the admin console');
            await page.goto(`${origin}/docente/strategie`, { waitUntil: 'networkidle' });
            const strategies = page;
            await strategies.getByRole('button', { name: 'Nuova strategia', exact: true }).click();
            await strategies.getByLabel('Slug', { exact: true }).fill('ripasso-docente');
            await strategies.getByLabel('Nome', { exact: true }).fill('Ripasso distribuito');
            await strategies.getByLabel('La strategia (come applicarla)', { exact: true }).fill('Distribuisci il ripasso su più giornate.');
            await strategies.getByLabel('Quando è raccomandata', { exact: true }).fill('Per preparare una verifica.');
            await strategies.getByRole('button', { name: 'C1', exact: true }).click();
            await strategies.getByRole('combobox', { name: /^Stato/ }).selectOption('certified');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'strategy editor fits the viewport');
            await strategies.getByRole('button', { name: 'Salva', exact: true }).click();
            await strategies.getByText('Pubblicata', { exact: true }).waitFor();
            assert.equal(writes[0].body.status, 'certified');
            assert.deepEqual(writes[0].body.factor_codes, ['C1']);

            await page.goto(`${origin}/docente/materiali`, { waitUntil: 'networkidle' });
            const readings = page;
            await readings.getByRole('button', { name: 'Nuova voce', exact: true }).click();
            await readings.getByLabel('Slug', { exact: true }).fill('film-docente');
            await readings.getByRole('combobox', { name: /^Tipo/ }).selectOption('film');
            await readings.getByLabel('Titolo', { exact: true }).fill('Film per riflettere');
            await readings.getByRole('button', { name: 'Metodo di studio', exact: true }).click();
            await readings.getByLabel(/Perche e pertinente/).fill('Per confrontarsi sul proprio modo di imparare.');
            await readings.getByRole('combobox', { name: /^Stato/ }).selectOption('certified');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'reading editor fits the viewport');
            await readings.getByRole('button', { name: 'Salva', exact: true }).click();
            await readings.getByText('Film per riflettere', { exact: true }).waitFor();
            assert.equal(writes[1].body.status, 'certified');
            assert.equal(writes[1].body.kind, 'film');
            assert.equal(writes.length, 2, 'publication requires no approval request');
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('student cannot open the teacher catalogs', async () => {
    const page = await browser.newPage();
    try {
        const { writes } = await prepare(page, { teacher: false });
        await page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
        assert.equal(await page.locator('#teacher-catalogs-title').count(), 0);
        assert.deepEqual(writes, []);
    } finally { await page.close(); }
});

test('catalog entry is localized and keyboard accessible', async () => {
    const page = await browser.newPage();
    try {
        await prepare(page, { lang: 'en' });
        await page.goto(`${origin}/docente/materiali`, { waitUntil: 'networkidle' });
        const button = page.getByRole('button', { name: 'New entry', exact: true });
        await button.focus();
        await page.keyboard.press('Enter');
        await button.waitFor();
    } finally { await page.close(); }
});
