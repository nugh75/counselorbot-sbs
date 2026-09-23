import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.GOALS_BASE_URL || 'http://127.0.0.1:3107';
const api = process.env.GOALS_API_URL || 'http://127.0.0.1:18096';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });
async function fixture({ username = 'student-browser', width = 1440, lang = 'it', dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1050 } });
    await context.addInitScript(({ lang, dark }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { lang, dark });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname.slice(4);
        if (/^\/(user\/goal|teacher\/|user\/timeline)/.test(path)) {
            const response = await fetch(`${api}${path}${url.search}`, { method: request.method(), headers: { 'Content-Type': 'application/json', 'x-test-user': username }, body: request.postData() || undefined });
            return route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' });
        }
        let data = [];
        if (path === '/auth/me') data = { authenticated: true, username, name: username, is_admin: username === 'admin-browser', groups: username === 'teacher-browser' ? ['docenti'] : ['studenti'] };
        else if (path === '/admin/groups') data = await (await fetch(`${api}/fixture/groups`)).json();
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        else if (path === '/counselors') data = [{ id: 1, name: 'Counselor', language: ['*'], is_active: true }];
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}
for (const width of [1440, 390]) {
    test(`student goal, linked portfolio and real calendar at ${width}px`, async () => {
        const username = width === 390 ? 'student-mobile' : 'student-browser';
        const { page, context, errors } = await fixture({ width, username, dark: width === 390 });
        try {
            await page.goto(`${origin}/profilo`);
            await page.getByRole('heading', { name: 'Il mio percorso', exact: true }).waitFor();
            await page.getByRole('link', { name: 'Obiettivi', exact: true }).click();
            await page.getByRole('button', { name: 'Scegli dal catalogo', exact: true }).click();
            await page.getByLabel('Cerca nel catalogo').fill('Organizzare meglio');
            await page.getByRole('button', { name: 'Personalizza e scegli', exact: true }).click();
            await page.getByLabel('Obiettivo', { exact: true }).fill(`Studiare con un piano ${width}`);
            await page.getByLabel('Perché conta per me').fill('Voglio distribuire il lavoro.');
            await page.getByLabel('Condividi il riepilogo con i docenti di').selectOption({ label: 'Gruppo di prova' });
            await page.getByRole('button', { name: 'Salva', exact: true }).click();
            await page.getByRole('heading', { name: `Studiare con un piano ${width}`, exact: true }).waitFor();
            await page.getByText('Aggiungi un’attività', { exact: true }).first().click();
            await page.getByLabel('Cosa farò').fill(`Sessione breve ${width}`);
            await page.getByLabel('Data facoltativa').fill('2026-10-04');
            await page.getByRole('button', { name: 'Aggiungi un’attività', exact: true }).click();
            await page.getByRole('link', { name: `Sessione breve ${width}`, exact: true }).first().waitFor();
            await page.getByLabel('Scegli un contenuto esistente').selectOption({ label: 'Portfolio · Il mio elaborato' });
            await page.getByRole('button', { name: 'Collega', exact: true }).click();
            await page.getByRole('link', { name: 'Il mio elaborato', exact: true }).waitFor();
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: `/tmp/personal-goals-${width}.png`, fullPage: true });
            const state = await (await fetch(`${api}/user/timeline`, { headers: { 'x-test-user': username } })).json();
            assert.equal(state.workspace.actions.length, 1);
            assert.equal(state.workspace.timeline.events[0].start_date, '2026-10-04');
            await page.reload();
            await page.getByRole('heading', { name: `Studiare con un piano ${width}`, exact: true }).waitFor();
            await page.getByLabel('Condividi il riepilogo con i docenti di').selectOption('');
            await page.getByRole('button', { name: 'Salva', exact: true }).click();
            await page.getByRole('status').filter({ hasText: 'Salvato.' }).waitFor();
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
test('teacher publishes group content and submits common proposals for review', async () => {
    const { page, context, errors } = await fixture({ username: 'teacher-browser' });
    try {
        await page.goto(`${origin}/docente`);
        await page.locator('summary').filter({ hasText: /^Catalogo obiettivi$/ }).click();
        await page.screenshot({ path: '/tmp/personal-goals-teacher-loading.png', fullPage: true });
        await page.getByRole('button', { name: 'Nuova proposta', exact: true }).click();
        await page.getByLabel('Obiettivo', { exact: true }).fill('Preparare una presentazione insieme');
        await page.getByLabel('Ambito', { exact: true }).fill('Comunicazione');
        await page.getByLabel('Destinazione', { exact: true }).selectOption({ label: 'Gruppo di prova' });
        await page.getByLabel('Stato', { exact: true }).selectOption('published');
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('heading', { name: 'Preparare una presentazione insieme' }).waitFor();
        await page.getByRole('button', { name: 'Duplica', exact: true }).first().click();
        await page.getByLabel('Destinazione', { exact: true }).selectOption('');
        assert.equal(await page.getByLabel('Stato', { exact: true }).locator('option[value="published"]').count(), 0);
        await page.getByLabel('Stato', { exact: true }).selectOption('pending');
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByText(/In revisione · Catalogo comune/).waitFor();
        const entries = await (await fetch(`${api}/user/goal-catalog`, { headers: { 'x-test-user': 'student-browser' } })).json();
        assert.equal(entries.filter(e => e.data.title === 'Preparare una presentazione insieme').length, 1);
        await page.getByLabel('Scegli un gruppo', { exact: true }).selectOption({ label: 'Gruppo di prova' });
        await page.getByText('Nessun riepilogo condiviso con questo gruppo.', { exact: true }).waitFor();
        await page.screenshot({ path: '/tmp/personal-goals-teacher.png', fullPage: true });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
for (const [lang, title, choose] of [['en', 'My goals', 'Choose from the catalog'], ['es', 'Mis objetivos', 'Elegir del catálogo'], ['fr', 'Mes objectifs', 'Choisir dans le catalogue'], ['de', 'Meine Ziele', 'Aus dem Katalog wählen'], ['sv', 'Mina mål', 'Välj från katalogen']]) {
    test(`goals render in ${lang} without overflow`, async () => {
        const { page, context, errors } = await fixture({ lang, username: `student-${lang}`, width: 390 });
        try {
            await page.goto(`${origin}/profilo/obiettivi`);
            await page.getByRole('heading', { name: title, exact: true }).waitFor();
            await page.getByRole('button', { name: choose, exact: true }).click();
            await page.getByRole('heading', { name: 'Organizzare meglio lo studio', exact: true }).waitFor();
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('stale edits preserve the draft and navigation requires an explicit choice', async () => {
    const username = 'student-en';
    const { page, context, errors } = await fixture({ username });
    try {
        await page.goto(`${origin}/profilo/obiettivi`);
        await page.getByRole('button', { name: 'Scrivi il tuo obiettivo', exact: true }).click();
        await page.getByLabel('Obiettivo', { exact: true }).fill('Obiettivo da rivedere');
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('heading', { name: 'Obiettivo da rivedere', exact: true }).waitFor();
        await page.getByLabel('Perché conta per me', { exact: true }).fill('Questa modifica deve restare.');
        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: 'Scegli dal catalogo', exact: true }).click();
        assert.equal(await page.getByLabel('Perché conta per me', { exact: true }).inputValue(), 'Questa modifica deve restare.');
        const headers = { 'Content-Type': 'application/json', 'x-test-user': username };
        const [row] = await (await fetch(`${api}/user/goals`, { headers })).json();
        const body = Object.fromEntries(['title', 'motivation', 'criteria', 'reflection', 'status', 'priority', 'review_date', 'shared_group_id', 'revision'].map(key => [key, row[key]]));
        const updated = await fetch(`${api}/user/goals/${row.id}`, { method: 'PUT', headers, body: JSON.stringify({ ...body, title: 'Modificato in un’altra scheda' }) });
        assert.equal(updated.status, 200);
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Questo contenuto è cambiato altrove.' }).waitFor();
        assert.equal(await page.getByLabel('Perché conta per me', { exact: true }).inputValue(), 'Questa modifica deve restare.');
        await page.getByRole('button', { name: 'Ricarica', exact: true }).click();
        await page.getByRole('heading', { name: 'Modificato in un’altra scheda', exact: true }).waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('administrator can publish a common proposal from the review queue', async () => {
    const { page, context, errors } = await fixture({ username: 'admin-browser' });
    try {
        await page.goto(`${origin}/docente`);
        await page.locator('summary').filter({ hasText: /^Catalogo obiettivi$/ }).click();
        const pending = page.getByRole('article').filter({ hasText: 'In revisione · Catalogo comune' });
        await pending.getByRole('button', { name: 'Modifica', exact: true }).click();
        await page.getByLabel('Obiettivo', { exact: true }).fill('Proposta comune approvata');
        await page.getByLabel('Stato', { exact: true }).selectOption('published');
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('heading', { name: 'Proposta comune approvata', exact: true }).waitFor();
        const entries = await (await fetch(`${api}/user/goal-catalog`, { headers: { 'x-test-user': 'outside-group' } })).json();
        assert.ok(entries.some(entry => entry.data.title === 'Proposta comune approvata'));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});


test('personal tool shortcuts open the selected workspace', async () => {
    const { page, context, errors } = await fixture();
    try {
        await page.goto(`${origin}/profilo`);
        await page.getByRole('link', { name: /Bacheca delle azioni/ }).click();
        await page.getByRole('heading', { name: 'Bacheca delle azioni', exact: true, level: 1 }).waitFor();
        await page.locator('input[value="Sessione breve 1440"]').waitFor();
        assert.ok(await page.locator('input').evaluateAll(inputs => inputs.some(input => input.value === 'Sessione breve 1440')));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
