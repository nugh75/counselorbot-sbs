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
            await page.getByRole('dialog').getByRole('heading', { name: `Studiare con un piano ${width}`, exact: true }).waitFor();
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
            await page.getByRole('button', { name: `Studiare con un piano ${width}`, exact: true }).click();
            await page.getByRole('dialog').getByRole('heading', { name: `Studiare con un piano ${width}`, exact: true }).waitFor();
            await page.getByLabel('Condividi il riepilogo con i docenti di').selectOption('');
            page.once('dialog', dialog => dialog.accept());
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
for (const [lang, title, choose] of [['en', 'Goals', 'Choose from the catalog'], ['es', 'Objetivos', 'Elegir del catálogo'], ['fr', 'Objectifs', 'Choisir dans le catalogue'], ['de', 'Ziele', 'Aus dem Katalog wählen'], ['sv', 'Mål', 'Välj från katalogen']]) {
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
        await page.keyboard.press('Escape');
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
        await page.getByRole('link', { name: 'Attività', exact: true }).click();
        await page.getByRole('heading', { name: 'Bacheca delle azioni', exact: true, level: 1 }).waitFor();
        await page.locator('input[value="Sessione breve 1440"]').waitFor();
        assert.ok(await page.locator('input').evaluateAll(inputs => inputs.some(input => input.value === 'Sessione breve 1440')));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

// The next four tests (network, F06, tree keyboard, map) all use user `student-network` and
// share its data across the file: each depends on the goals ("Erasmus in Spagna", "Laurea in
// lingue", "Migliorare l'inglese") created by the network test below. They must run in file
// order, against a freshly started fixture server (its rolled-back schema is not reset between
// tests within one run, so state accumulates as later tests expect).
test('goals form a network with sub-goals, extra parents and inherited sharing', async () => {
    const username = 'student-network';
    const { page, context, errors } = await fixture({ username });
    const create = async (title, share) => {
        await page.getByRole('button', { name: 'Scrivi il tuo obiettivo', exact: true }).click();
        await page.getByLabel('Obiettivo', { exact: true }).fill(title);
        if (share) await page.getByLabel('Condividi il riepilogo con i docenti di').selectOption({ label: 'Gruppo di prova' });
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('dialog').getByRole('heading', { name: title, exact: true }).waitFor();
        await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
    };
    try {
        await page.goto(`${origin}/profilo/obiettivi`);
        await page.getByRole('heading', { name: 'Obiettivi', exact: true, level: 1 }).waitFor();
        await create('Erasmus in Spagna', true);
        await create('Laurea in lingue');
        await page.getByRole('button', { name: 'Aggiungi sottobiettivo: Erasmus in Spagna', exact: true }).click();
        await page.getByText('Come ci arrivi? Scrivi un passo più concreto.').waitFor();
        await page.getByText('Visibile ai docenti di Gruppo di prova tramite «Erasmus in Spagna»').waitFor();
        await page.getByLabel('Obiettivo', { exact: true }).fill('Migliorare l’inglese');
        let subgoalMessage = '';
        page.once('dialog', dialog => { subgoalMessage = dialog.message(); void dialog.accept(); });
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('dialog').getByRole('heading', { name: 'Migliorare l’inglese', exact: true }).waitFor();
        assert.match(subgoalMessage, /Ora visibile anche ai docenti di: Gruppo di prova/);
        await page.getByLabel('Aggiungi a un altro obiettivo').selectOption({ label: 'Laurea in lingue' });
        await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Laurea in lingue', exact: true }).waitFor();
        let message = '';
        page.once('dialog', dialog => { message = dialog.message(); void dialog.accept(); });
        await page.getByRole('button', { name: 'Stacca da Erasmus in Spagna', exact: true }).click();
        await page.getByRole('button', { name: 'Stacca da Erasmus in Spagna', exact: true }).waitFor({ state: 'detached' });
        assert.match(message, /Non più visibile ai docenti di: Gruppo di prova/);
        await page.getByLabel('Aggiungi a un altro obiettivo').selectOption({ label: 'Erasmus in Spagna' });
        page.once('dialog', dialog => { message = dialog.message(); void dialog.accept(); });
        await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
        await page.getByRole('button', { name: 'Stacca da Erasmus in Spagna', exact: true }).waitFor();
        assert.match(message, /Ora visibile anche ai docenti di: Gruppo di prova/);
        await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
        await page.getByText(/⧉ anche sotto: /).first().waitFor();
        const branchToggle = page.getByRole('button', { name: /^(Nascondi|Mostra) sottobiettivi di Erasmus in Spagna$/ });
        assert.equal(await branchToggle.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.getByRole('button', { name: 'Migliorare l’inglese', exact: true }).count(), 2);
        await branchToggle.click();
        assert.equal(await branchToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.getByRole('button', { name: 'Migliorare l’inglese', exact: true }).count(), 1);
        await branchToggle.click();
        assert.equal(await branchToggle.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.getByRole('button', { name: 'Migliorare l’inglese', exact: true }).count(), 2);
        const rows = await (await fetch(`${api}/user/goals`, { headers: { 'x-test-user': username } })).json();
        assert.equal(rows.find(r => r.title === 'Migliorare l’inglese').parent_ids.length, 2);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: '/tmp/personal-goals-network.png', fullPage: true });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('F06: text in a new activity is protected on every exit from the dialog', async () => {
    const { page, context, errors } = await fixture({ username: 'student-network' });
    try {
        await page.goto(`${origin}/profilo`);
        await page.getByRole('link', { name: 'Obiettivi', exact: true }).click();
        await page.getByRole('button', { name: 'Laurea in lingue', exact: true }).first().click();
        await page.getByText('Aggiungi un’attività', { exact: true }).first().click();
        await page.getByLabel('Cosa farò').fill('Frase non ancora salvata');
        // page.goBack() would wait for a "load" navigation that never fires: the SPA back-traversal
        // is same-document and gets cancelled by the draft guard, so history.back() is invoked directly.
        for (const exit of [() => page.keyboard.press('Escape'), () => page.getByRole('button', { name: 'Chiudi', exact: true }).click(), () => page.getByRole('button', { name: 'Annulla', exact: true }).click(), () => page.evaluate(() => window.history.back())]) {
            page.once('dialog', dialog => dialog.dismiss());
            await exit();
            await page.getByLabel('Cosa farò').waitFor();
            assert.equal(await page.getByLabel('Cosa farò').inputValue(), 'Frase non ancora salvata');
        }
        assert.equal(await page.getByLabel('Obiettivo', { exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Salva', exact: true }).isDisabled(), true);
        page.once('dialog', dialog => dialog.accept());
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('tree keyboard: Enter opens the goal dialog, Escape returns focus to the row', async () => {
    const { page, context, errors } = await fixture({ username: 'student-network' });
    try {
        await page.goto(`${origin}/profilo/obiettivi`);
        const row = page.getByRole('button', { name: 'Laurea in lingue', exact: true }).first();
        await row.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('dialog').getByRole('heading', { name: 'Laurea in lingue', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Laurea in lingue');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

for (const width of [1280, 390]) {
    test(`map view is desktop-only at ${width}px`, async () => {
        const { page, context, errors } = await fixture({ username: 'student-network', width });
        try {
            await page.goto(`${origin}/profilo/obiettivi`);
            await page.getByRole('button', { name: 'Laurea in lingue', exact: true }).first().waitFor();
            const toggle = page.getByRole('button', { name: 'Mappa', exact: true });
            if (width < 1024) { assert.equal(await toggle.isVisible(), false); return; }
            await toggle.click();
            const map = page.getByRole('region', { name: /Mappa degli obiettivi/ });
            await map.waitFor();
            assert.equal(await map.getByRole('button', { name: /Migliorare l’inglese/ }).count(), 1);
            assert.equal(await map.locator('.react-flow__edge').count(), 2);
            await map.getByRole('button', { name: /Migliorare l’inglese/ }).click();
            await page.getByRole('dialog').getByRole('heading', { name: 'Migliorare l’inglese', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
            await page.getByRole('dialog').waitFor({ state: 'detached' });
            await map.getByRole('button', { name: /Migliorare l’inglese/ }).focus();
            await page.keyboard.press('Enter');
            await page.getByRole('dialog').getByRole('heading', { name: 'Migliorare l’inglese', exact: true }).waitFor();
            await page.screenshot({ path: '/tmp/personal-goals-map.png' });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
