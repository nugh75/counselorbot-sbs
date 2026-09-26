import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.GOALS_BASE_URL || 'http://127.0.0.1:3107';
const api = process.env.GOALS_API_URL || 'http://127.0.0.1:18096';
const username = 'student-timeline';
// Base36 run id (like personal-goals.test.mjs): a numeric timestamp would read as a
// 10-digit run across the width suffix and the PII redaction would mask it as a phone.
const stamp = Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 4);
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });
async function fixture({ width = 1440, lang = 'it' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1050 } });
    await context.addInitScript(({ lang }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, { lang });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname.slice(4);
        if (/^\/(user\/goal|teacher\/|user\/timeline|user\/portfolio)/.test(path)) {
            const response = await fetch(`${api}${path}${url.search}`, { method: request.method(), headers: { 'Content-Type': 'application/json', 'x-test-user': username }, body: request.postData() || undefined });
            return route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' });
        }
        let data = [];
        if (path === '/auth/me') data = { authenticated: true, username, name: username, is_admin: false, groups: ['studenti'] };
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        else if (path === '/counselors') data = [{ id: 1, name: 'Counselor', language: ['*'], is_active: true }];
        else if (path === '/orientation-directory') data = { institution: null, events: [] };
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

for (const width of [1440, 390]) {
    test(`dated activity appears on the timeline and links back to the board at ${width}px`, async () => {
        const { page, context, errors } = await fixture({ width });
        try {
            await page.goto(`${origin}/profilo/azioni`);
            // Lotto 2: l'h1 è il nome breve approvato (0.1); «Bacheca delle azioni» resta nel workspace.
            await page.getByRole('heading', { name: 'Azioni', exact: true, level: 1 }).waitFor();
            await page.getByRole('heading', { name: 'Bacheca delle azioni', exact: true, level: 2 }).waitFor();
            const titleInput = page.locator('input[id$="-new-action-title"]');
            const addSummary = page.locator('summary').filter({ hasText: 'Aggiungi azione' });
            await titleInput.or(addSummary).first().waitFor();
            if (!(await titleInput.isVisible())) await addSummary.click();
            await titleInput.fill(`Sessione di studio ${stamp} ${width}`);
            await page.getByRole('button', { name: 'Aggiungi azione', exact: true }).click();
            // F21: la card nasce in lettura; la modifica è esplicita.
            const cardByTitle = page.locator('article').filter({ hasText: `Sessione di studio ${stamp} ${width}` }).first();
            await cardByTitle.getByRole('button', { name: `Modifica: Sessione di studio ${stamp} ${width}` }).click();
            // In modifica il titolo è il valore dell'input: la card si ancora a quello.
            const card = page.locator('article').filter({ has: page.locator(`input[value="Sessione di studio ${stamp} ${width}"]`) }).first();
            await card.waitFor();
            await card.getByLabel('Quando', { exact: true }).selectOption('point');
            await card.getByLabel('Evento in un giorno').fill('2026-09-20');
            await page.getByRole('button', { name: 'Salva nell’Area personale' }).click();
            await page.getByRole('status').filter({ hasText: 'Salvato nell’Area personale' }).waitFor();
            await card.getByRole('link', { name: 'Vedi sulla linea del tempo' }).waitFor();
            await card.getByRole('link', { name: 'Vedi sulla linea del tempo' }).click();
            await page.getByRole('heading', { name: 'Linea del tempo', exact: true, level: 1 }).waitFor();
            const item = page.locator('a', { hasText: `Sessione di studio ${stamp} ${width}` }).first();
            await item.waitFor();
            await page.screenshot({ path: `/tmp/activities-timeline-${width}.png`, fullPage: true });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await item.click();
            await page.waitForURL(/#action-/);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('active goal review date appears on the timeline and opens the dialog', async () => {
    const { page, context, errors } = await fixture();
    try {
        await page.goto(`${origin}/profilo/obiettivi?new=1`);
        await page.getByRole('dialog').getByRole('heading', { name: 'Scrivi il tuo obiettivo', exact: true }).waitFor();
        await page.getByLabel('Obiettivo', { exact: true }).fill('Obiettivo con revisione');
        await page.getByLabel('Perché conta per me').fill('Voglio controllare i progressi.');
        await page.getByLabel('Quando rivederlo').fill('2026-11-15');
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('dialog').getByRole('heading', { name: 'Obiettivo con revisione', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.goto(`${origin}/profilo/timeline`);
        await page.getByRole('heading', { name: 'Linea del tempo', exact: true, level: 1 }).waitFor();
        const item = page.locator('a', { hasText: 'Obiettivo con revisione' }).first();
        await item.waitFor();
        await item.click();
        await page.getByRole('dialog').getByRole('heading', { name: 'Obiettivo con revisione', exact: true }).waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('adding a past milestone offers no past/future choice', async () => {
    const { page, context, errors } = await fixture();
    try {
        await page.goto(`${origin}/profilo/timeline`);
        await page.getByRole('button', { name: 'Aggiungi tappa' }).first().click();
        await page.getByLabel('Titolo della tappa').first().fill(`Esame di matematica ${stamp}`);
        await page.getByLabel('Quando', { exact: true }).first().selectOption('point');
        await page.getByLabel('Evento in un giorno').first().fill('2026-02-10');
        assert.equal(await page.getByLabel('Collocazione').count(), 0);
        await page.getByRole('button', { name: 'Aggiungi tappa' }).last().click();
        await page.locator('input[value="Esame di matematica ' + stamp + '"]').first().waitFor();
        const state = await (await fetch(`${api}/user/timeline`, { headers: { 'Content-Type': 'application/json', 'x-test-user': username } })).json();
        const events = state.workspace.timeline.events;
        const created = events.find(event => event.title === `Esame di matematica ${stamp}`);
        assert.ok(created);
        assert.equal(created.tense, 'past');
        assert.equal(created.start_date, '2026-02-10');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('filters hide and show the entries by type, and the choice survives a reload', async () => {
    const { page, context, errors } = await fixture();
    try {
        await page.goto(`${origin}/profilo/timeline`);
        await page.getByRole('heading', { name: 'Linea del tempo', exact: true, level: 1 }).waitFor();
        const goalItem = page.locator('a', { hasText: 'Obiettivo con revisione' }).first();
        const activityItem = page.locator('a', { hasText: `Sessione di studio ${stamp} 1440` }).first();
        await goalItem.waitFor();
        await page.getByText('Filtri', { exact: true }).click();
        await page.getByRole('checkbox', { name: 'Obiettivo', exact: true }).uncheck();
        await page.getByRole('checkbox', { name: 'Appuntamento', exact: true }).uncheck();
        await goalItem.waitFor({ state: 'detached' });
        await activityItem.waitFor();
        await page.reload();
        await page.getByRole('heading', { name: 'Linea del tempo', exact: true, level: 1 }).waitFor();
        await page.getByText('Filtri', { exact: true }).click();
        await page.locator('a', { hasText: 'Obiettivo con revisione' }).first().waitFor({ state: 'detached' });
        await page.getByRole('checkbox', { name: 'Obiettivo', exact: true }).check();
        await page.locator('a', { hasText: 'Obiettivo con revisione' }).first().waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
