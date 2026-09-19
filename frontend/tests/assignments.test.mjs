import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.ASSIGNMENTS_BASE_URL || 'http://127.0.0.1:3098';
const api = process.env.ASSIGNMENTS_API_URL || 'http://127.0.0.1:18099';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function pageFor(username, width, lang = 'it') {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.addInitScript(({ lang, width }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', width === 390 ? 'dark' : 'light'); }, { lang, width });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const path = url.pathname.slice(4);
        if (/^\/(teacher\/(assignments|assignment-targets|goal-catalog)|user\/assignments|admin\/(certified-strategies|certified-readings|groups)$)/.test(path)) {
            const response = await route.fetch({ url: api + path + url.search, headers: { ...route.request().headers(), 'x-test-user': username } });
            return route.fulfill({ response });
        }
        let data = [];
        if (path === '/auth/me') data = { username, name: username, authenticated: true, is_admin: false, groups: username === 'teacher' ? ['docenti'] : ['studenti'] };
        if (path === '/user/account') data = { setup_complete: true, notebook_completed: true };
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

async function received(username) {
    const response = await fetch(`${api}/user/assignments`, { headers: { 'x-test-user': username } });
    assert.equal(response.status, 200);
    return response.json();
}

for (const width of [1440, 390]) {
    test(`real assignment delivery to person, class and adult group at ${width}px`, async () => {
        const { page, context, errors } = await pageFor('teacher', width);
        const marker = `Indicazione browser ${width} ${Date.now()}`;
        try {
            await page.goto(`${origin}/docente`);
            const catalogs = page.getByRole('region', { name: 'Cataloghi', exact: true });
            await catalogs.getByRole('heading', { name: 'Cataloghi', exact: true }).waitFor();
            assert.deepEqual(await catalogs.locator('summary').allTextContents(), ['Catalogo obiettivi', 'Strategie', 'Libri, film e altri materiali']);
            for (const scenario of [
                { section: 'Catalogo obiettivi', title: 'Pianificare lo studio', group: 'Classe 3B', recipient: 'alice' },
                { section: 'Strategie', title: 'Ripasso distribuito', group: 'Classe 3B', recipient: '' },
                { section: 'Libri, film e altri materiali', title: 'Film per riflettere', group: 'Gruppo adulti', recipient: '' },
            ]) {
                const section = catalogs.locator('details').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${scenario.section}$`) }) });
                await section.locator('summary').click();
                await section.getByRole('button', { name: 'Assegna', exact: true }).click();
                const dialog = page.getByRole('dialog', { name: `Assegna: ${scenario.title}`, exact: true });
                await dialog.getByLabel('Gruppo o classe', { exact: true }).selectOption({ label: scenario.group });
                await dialog.getByLabel('Destinatario', { exact: true }).selectOption(scenario.recipient);
                await dialog.getByLabel('Indicazioni del docente (facoltative)').fill(marker);
                assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'dialog fits the viewport');
                await dialog.getByRole('button', { name: 'Conferma assegnazione' }).click();
                await dialog.waitFor({ state: 'detached' });
                await section.getByRole('status').filter({ hasText: 'Assegnazione inviata.' }).waitFor();
                await section.locator('summary').click();
            }
            const forAlice = (await received('alice')).filter(row => row.instructions === marker);
            const forBob = (await received('bob')).filter(row => row.instructions === marker);
            const forEve = (await received('eve')).filter(row => row.instructions === marker);
            assert.equal(forAlice.length, 3);
            assert.deepEqual(forBob.map(row => row.source_kind), ['strategy']);
            assert.deepEqual(forEve.map(row => row.source_kind), ['reading']);
            const learner = await pageFor('alice', width);
            try {
                await learner.page.goto(`${origin}/profilo`);
                await learner.page.getByRole('link', { name: /Assegnazioni ricevute/ }).click();
                await learner.page.getByRole('heading', { name: 'Assegnazioni ricevute', exact: true }).waitFor();
                await learner.page.getByRole('heading', { name: 'Film per riflettere', exact: true }).first().waitFor();
                assert.ok(await learner.page.getByText('Assegnato da: Docente di prova', { exact: true }).count() >= 3);
                assert.equal(await learner.page.getByRole('button', { name: 'Revoca assegnazione' }).count(), 0);
                assert.ok(await learner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                await learner.page.screenshot({ path: `/tmp/assignments-received-${width}.png`, fullPage: true });
                assert.deepEqual(learner.errors, []);
            } finally { await learner.context.close(); }
            const sent = page.getByRole('region', { name: 'Assegnazioni effettuate', exact: true });
            const film = sent.locator('article').filter({ hasText: marker }).filter({ has: page.getByRole('heading', { name: 'Film per riflettere' }) });
            page.once('dialog', dialog => dialog.accept());
            await film.getByRole('button', { name: 'Revoca assegnazione' }).click();
            await film.getByText('Revocata', { exact: true }).waitFor();
            assert.equal((await received('eve')).filter(row => row.instructions === marker).length, 0);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: `/tmp/assignments-teacher-${width}.png`, fullPage: true });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

for (const [lang, heading] of [['en', 'Received assignments'], ['es', 'Asignaciones recibidas'], ['fr', 'Attributions reçues'], ['de', 'Erhaltene Zuweisungen'], ['sv', 'Mottagna tilldelningar']]) {
    test(`received assignments localized in ${lang}`, async () => {
        const { page, context, errors } = await pageFor('alice', 390, lang);
        try {
            await page.goto(`${origin}/profilo/assegnazioni`);
            await page.getByRole('heading', { name: heading, exact: true }).waitFor();
            await page.getByRole('heading', { name: 'Pianificare lo studio', exact: true }).first().waitFor();
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

for (const width of [1440, 390]) {
    test(`assign strategies and films to an empty class before a student joins at ${width}px`, async () => {
        const { page, context, errors } = await pageFor('teacher', width);
        const marker = `Classe vuota ${width} ${Date.now()}`;
        const username = `late-${width}`;
        try {
            await page.goto(`${origin}/docente`);
            const catalogs = page.getByRole('region', { name: 'Cataloghi', exact: true });
            for (const sectionName of ['Strategie', 'Libri, film e altri materiali']) {
                const section = catalogs.locator('details').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${sectionName}$`) }) });
                await section.locator('summary').click();
                await section.getByRole('button', { name: 'Assegna', exact: true }).click();
                const dialog = page.getByRole('dialog');
                await dialog.getByLabel('Gruppo o classe', { exact: true }).selectOption({ label: `Classe vuota ${width}` });
                const recipient = dialog.getByLabel('Destinatario', { exact: true });
                assert.deepEqual(await recipient.locator('option').allTextContents(), ['Intero gruppo o classe (0)']);
                await dialog.getByText(/anche per chi si iscriverà in seguito/).waitFor();
                await dialog.getByLabel('Indicazioni del docente (facoltative)').fill(marker);
                assert.ok(await dialog.getByRole('button', { name: 'Conferma assegnazione' }).isEnabled());
                assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
                await dialog.getByRole('button', { name: 'Conferma assegnazione' }).click();
                await dialog.waitFor({ state: 'detached' });
                await section.getByRole('status').filter({ hasText: 'Assegnazione inviata.' }).waitFor();
                await section.locator('summary').click();
            }
            const sent = page.getByRole('region', { name: 'Assegnazioni effettuate', exact: true });
            const deliveries = sent.locator('article').filter({ hasText: marker });
            await deliveries.nth(1).waitFor();
            assert.equal(await deliveries.getByText('Destinatari: Intero gruppo o classe (0)', { exact: true }).count(), 2);
            assert.deepEqual(await received(username), []);
            const join = await fetch(`${api}/groups/join`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': username },
                body: JSON.stringify({ code: `GR-EMPTY-${width}` }),
            });
            assert.equal(join.status, 200, await join.text());
            const receivedAfterJoin = await received(username);
            assert.deepEqual(receivedAfterJoin.map(row => row.source_kind).sort(), ['reading', 'strategy']);
            assert.ok(receivedAfterJoin.every(row => row.instructions === marker));
            const learner = await pageFor(username, width);
            try {
                await learner.page.goto(`${origin}/profilo/assegnazioni`);
                await learner.page.getByRole('heading', { name: 'Film per riflettere', exact: true }).waitFor();
                await learner.page.getByRole('heading', { name: 'Ripasso distribuito', exact: true }).waitFor();
                assert.deepEqual(learner.errors, []);
            } finally { await learner.context.close(); }
            await page.reload();
            await deliveries.nth(1).waitFor();
            assert.equal(await deliveries.getByText('Destinatari: Intero gruppo o classe (1)', { exact: true }).count(), 2);
            const film = deliveries.filter({ has: page.getByRole('heading', { name: 'Film per riflettere' }) });
            page.once('dialog', dialog => dialog.accept());
            await film.getByRole('button', { name: 'Revoca assegnazione' }).click();
            await film.getByText('Revocata', { exact: true }).waitFor();
            assert.deepEqual((await received(username)).map(row => row.source_kind), ['strategy']);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
