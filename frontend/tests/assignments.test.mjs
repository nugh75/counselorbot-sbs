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
        if (/^\/(teacher\/(assignments|assignment-targets|goal-catalog)|user\/(assignments|goals|goal-resources|goal-groups|portfolio|timeline)|admin\/(certified-strategies|certified-readings|groups)$)/.test(path)) {
            const response = await route.fetch({ url: api + path + url.search, headers: { ...route.request().headers(), 'x-test-user': username } });
            return route.fulfill({ response });
        }
        let data = [];
        if (path === '/auth/me') data = { username, name: username, authenticated: true, is_admin: false, groups: username === 'teacher' ? ['docenti'] : ['studenti'] };
        if (path === '/user/account') data = { setup_complete: true, notebook_completed: true };
        if (path === '/orientation-directory') data = { institution: null, events: [], referrals: [] };
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
        const marker = `Indicazione browser ${width} ${Date.now().toString(36)}`;
        try {
            for (const scenario of [
                { path: '/docente/catalogo-obiettivi', title: 'Pianificare lo studio', group: 'Classe 3B', recipient: 'alice' },
                { path: '/docente/strategie', title: 'Ripasso distribuito', group: 'Classe 3B', recipient: '' },
                { path: '/docente/materiali', title: 'Film per riflettere', group: 'Gruppo adulti', recipient: '' },
            ]) {
                await page.goto(`${origin}${scenario.path}`);
                await page.getByRole('button', { name: 'Assegna', exact: true }).first().click();
                const dialog = page.getByRole('dialog', { name: `Assegna: ${scenario.title}`, exact: true });
                await dialog.getByLabel('Gruppo o classe', { exact: true }).selectOption({ label: scenario.group });
                await dialog.getByLabel('Destinatario', { exact: true }).selectOption(scenario.recipient);
                await dialog.getByLabel('Indicazioni del docente (facoltative)').fill(marker);
                assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'dialog fits the viewport');
                await dialog.getByRole('button', { name: 'Conferma assegnazione' }).click();
                await dialog.waitFor({ state: 'detached' });
                await page.getByRole('status').filter({ hasText: 'Assegnazione inviata.' }).waitFor();
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
                await learner.page.getByRole('link', { name: /Assegnazioni/ }).first().click();
                await learner.page.getByRole('heading', { name: 'Assegnazioni', exact: true }).first().waitFor();
                await learner.page.getByRole('heading', { name: 'Film per riflettere', exact: true }).first().waitFor();
                // Lista breve (F27): il mittente compare aprendo il dettaglio.
                assert.ok(await learner.page.getByRole('button', { name: 'Dettagli', exact: true }).count() >= 3);
                await learner.page.getByRole('button', { name: 'Dettagli', exact: true }).first().click();
                await learner.page.getByText('Assegnato da: Docente di prova', { exact: true }).waitFor();
                assert.equal(await learner.page.getByRole('button', { name: 'Revoca assegnazione' }).count(), 0);
                assert.ok(await learner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                await learner.page.screenshot({ path: `/tmp/assignments-received-${width}.png`, fullPage: true });
                assert.deepEqual(learner.errors, []);
            } finally { await learner.context.close(); }
            await page.goto(`${origin}/docente/assegnazioni`);
            const sent = page.getByRole('region', { name: 'Assegnazioni effettuate', exact: true });
            await sent.locator('article').filter({ hasText: marker }).first().waitFor();
            const film = sent.locator('article').filter({ hasText: marker }).filter({ has: page.getByRole('heading', { name: 'Film per riflettere' }) });
            // Lotto 5B: la conferma di revoca è in linea (ConfirmInline), non più window.confirm.
            await film.getByRole('button', { name: 'Revoca assegnazione' }).click();
            await film.getByRole('button', { name: 'Sì', exact: true }).click();
            await film.getByText('Revocata', { exact: true }).waitFor();
            assert.equal((await received('eve')).filter(row => row.instructions === marker).length, 0);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: `/tmp/assignments-teacher-${width}.png`, fullPage: true });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

for (const [lang, heading] of [['en', 'Assignments'], ['es', 'Actividades asignadas'], ['fr', 'Activités proposées'], ['de', 'Aufgaben'], ['sv', 'Tilldelade uppgifter']]) {
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
        const marker = `Classe vuota ${width} ${Date.now().toString(36)}`;
        const username = `late-${width}`;
        try {
            for (const catalogPath of ['/docente/strategie', '/docente/materiali']) {
                await page.goto(`${origin}${catalogPath}`);
                await page.getByRole('button', { name: 'Assegna', exact: true }).first().click();
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
                await page.getByRole('status').filter({ hasText: 'Assegnazione inviata.' }).waitFor();
            }
            await page.goto(`${origin}/docente/assegnazioni`);
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
            // Lotto 5B: la conferma di revoca è in linea (ConfirmInline), non più window.confirm.
            await film.getByRole('button', { name: 'Revoca assegnazione' }).click();
            await film.getByRole('button', { name: 'Sì', exact: true }).click();
            await film.getByText('Revocata', { exact: true }).waitFor();
            assert.deepEqual((await received(username)).map(row => row.source_kind), ['strategy']);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

for (const width of [1440, 390]) {
    test(`learning workflow keeps drafts private and shares a response with teacher feedback at ${width}px`, async () => {
        const teacher = await pageFor('teacher', width);
        const learner = await pageFor('alice', width);
        const marker = `Percorso ${width} ${Date.now().toString(36)}`;
        const call = async (path, username, body) => {
            const response = await fetch(api + path, { method: body ? 'POST' : 'GET',
                headers: { 'Content-Type': 'application/json', 'x-test-user': username }, body: body ? JSON.stringify(body) : undefined });
            assert.ok(response.ok, await response.clone().text()); return response.json();
        };
        try {
            const goal = await call('/user/goals', 'alice', { title: `Obiettivo ${marker}`, motivation: 'Scelta personale' });
            const portfolio = await call('/user/portfolio', 'alice', { title: `Lavoro ${marker}`, description: 'Solo il testo scelto per la restituzione' });
            await teacher.page.goto(`${origin}/docente/strategie`);
            await teacher.page.getByRole('button', { name: 'Assegna', exact: true }).first().click();
            const dialog = teacher.page.getByRole('dialog');
            await dialog.getByLabel('Gruppo o classe', { exact: true }).selectOption({ label: 'Classe 3B' });
            await dialog.getByLabel('Tipo di assegnazione').selectOption('requested');
            await dialog.getByLabel('Scadenza (facoltativa)').fill('2026-10-15');
            await dialog.getByLabel('Che cosa restituire').fill('Racconta come hai provato la strategia');
            await dialog.getByLabel('Indicazioni del docente (facoltative)').fill(marker);
            await dialog.getByRole('button', { name: 'Conferma assegnazione' }).click();
            await dialog.waitFor({ state: 'detached' });
            const assignment = (await call('/teacher/assignments', 'teacher')).find(row => row.instructions === marker);
            assert.equal(assignment.intent, 'requested');
            await teacher.page.goto(`${origin}/docente/assegnazioni`);
            const teacherCard = teacher.page.locator(`#assignment-${assignment.id}`);
            await teacherCard.getByRole('button', { name: 'Restituzioni condivise', exact: true }).click();
            await teacherCard.getByText('Nessuna restituzione condivisa. Il lavoro personale non è visibile qui.').waitFor();
            await learner.page.goto(`${origin}/profilo/assegnazioni#assignment-${assignment.id}`);
            const studentCard = learner.page.locator(`#assignment-${assignment.id}`);
            await studentCard.getByText('Racconta come hai provato la strategia', { exact: false }).waitFor();
            await studentCard.getByLabel('Quando provarla (facoltativo)').fill('2026-10-12');
            await studentCard.getByRole('button', { name: 'Pianifica nel mio percorso', exact: true }).click();
            // Dall'attività datata in poi (40c044c): il piano crea l'attività, non un evento duplicato.
            await studentCard.getByRole('link', { name: 'Apri le mie attività' }).waitFor();
            await studentCard.getByLabel('Collega a un mio obiettivo (facoltativo)').selectOption(String(goal.id));
            await studentCard.getByRole('button', { name: 'Collega obiettivo', exact: true }).click();
            await studentCard.getByRole('status').filter({ hasText: 'Salvato.' }).waitFor();
            const linked = (await call('/user/goals', 'alice')).find(row => row.id === goal.id);
            assert.deepEqual(linked.links.map(link => link.kind).sort(), ['action']);
            await studentCard.getByRole('link', { name: goal.title, exact: true }).waitFor();
            await studentCard.getByLabel('Come è andata? Riflessione personale').fill(`Privata ${marker}`);
            if (width === 1440) {
                const state = await call('/user/timeline', 'alice');
                state.workspace.actions.find(action => action.id === `assignment-${assignment.id}`).reflection = 'Modifica da un’altra scheda';
                const update = await fetch(`${api}/user/timeline`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-user': 'alice' },
                    body: JSON.stringify({ revision: state.revision, workspace: state.workspace }) });
                assert.equal(update.status, 200, await update.text());
                // Linking a goal must not silently accept a newer base for the unsaved reflection.
                await studentCard.getByLabel('Collega a un mio obiettivo (facoltativo)').selectOption(String(goal.id));
                await studentCard.getByRole('button', { name: 'Collega obiettivo', exact: true }).click();
                await studentCard.getByRole('status').filter({ hasText: 'Salvato.' }).waitFor();
                assert.equal(await studentCard.getByLabel('Come è andata? Riflessione personale').inputValue(), `Privata ${marker}`);
                await studentCard.getByRole('button', { name: 'Salva nella Linea del tempo' }).click();
                await studentCard.getByRole('alert').filter({ hasText: 'I dati sono cambiati altrove.' }).waitFor();
                assert.equal(await studentCard.getByLabel('Come è andata? Riflessione personale').inputValue(), `Privata ${marker}`);
                await studentCard.getByRole('button', { name: 'Ricarica e sostituisci la bozza' }).click();
                await studentCard.getByLabel('Come è andata? Riflessione personale').filter({ visible: true }).waitFor();
                await learner.page.waitForFunction(id => document.querySelector(`#assignment-${id} textarea`)?.value === 'Modifica da un’altra scheda', assignment.id);
                await studentCard.getByLabel('Come è andata? Riflessione personale').fill(`Privata ${marker}`);
            }
            await studentCard.getByRole('button', { name: 'Salva nella Linea del tempo' }).click();
            await studentCard.getByRole('status').filter({ hasText: 'Salvato.' }).waitFor();
            assert.deepEqual(await call(`/teacher/assignments/${assignment.id}/submissions`, 'teacher'), []);
            await studentCard.getByRole('link', { name: 'Apri le mie attività' }).click();
            const activity = learner.page.locator(`#action-assignment-${assignment.id}`);
            await activity.waitFor();
            assert.equal(await activity.getByLabel('Riflessione', { exact: true }).count(), 0, 'the activity reuses the diary reflection');
            await learner.page.goto(`${origin}/profilo/assegnazioni#assignment-${assignment.id}`);
            await studentCard.getByRole('button', { name: 'Lavora su questa assegnazione', exact: true }).click();
            await studentCard.getByLabel('Come è andata? Riflessione personale').waitFor();
            assert.equal(await studentCard.getByLabel('Come è andata? Riflessione personale').inputValue(), `Privata ${marker}`);
            await studentCard.locator('summary').filter({ hasText: /^Restituzione al docente$/ }).click();
            await studentCard.getByLabel('Testo da condividere', { exact: true }).fill(`Scelgo di condividere ${marker}`);
            await studentCard.getByLabel('Aggiungi il testo di un lavoro del Portfolio').selectOption(String(portfolio.id));
            const preview = studentCard.getByRole('region', { name: 'Anteprima: questo sarà visibile al docente' });
            await preview.getByText('Solo il testo scelto per la restituzione').waitFor();
            assert.ok(!(await preview.textContent()).includes(`Privata ${marker}`));
            await studentCard.getByRole('button', { name: 'Condividi questa restituzione', exact: true }).click();
            await studentCard.getByRole('heading', { name: 'Restituzione condivisa con il docente' }).waitFor();
            await teacherCard.getByRole('button', { name: 'Ricarica e sostituisci la bozza' }).click();
            await teacherCard.getByText(`Scelgo di condividere ${marker}`, { exact: true }).waitFor();
            assert.ok(!(await teacherCard.textContent()).includes(`Privata ${marker}`));
            await teacherCard.getByLabel('Riscontro del docente').fill(`Prossimo passo ${marker}`);
            await teacherCard.getByRole('button', { name: 'Salva riscontro' }).click();
            await teacherCard.getByRole('status').filter({ hasText: 'Salvato.' }).waitFor();
            await learner.page.reload();
            await studentCard.getByText(`Prossimo passo ${marker}`, { exact: true }).waitFor();
            assert.equal(await studentCard.getByLabel('Come è andata? Riflessione personale').inputValue(), `Privata ${marker}`);
            assert.ok(await learner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await studentCard.screenshot({ path: `/tmp/assignment-learning-${width}.png` });
            await learner.page.goto(`${origin}/profilo/assegnazioni#assignment-${assignment.id}`);
            await studentCard.getByRole('button', { name: 'Ritira la restituzione' }).waitFor();
            learner.page.once('dialog', dialog => dialog.accept());
            await studentCard.getByRole('button', { name: 'Ritira la restituzione' }).click();
            await studentCard.getByRole('heading', { name: 'Restituzione condivisa con il docente' }).waitFor({ state: 'detached' });
            await teacherCard.getByRole('button', { name: 'Ricarica e sostituisci la bozza' }).click();
            await teacherCard.getByText('Nessuna restituzione condivisa. Il lavoro personale non è visibile qui.').waitFor();
            assert.deepEqual(teacher.errors, []); assert.deepEqual(learner.errors, []);
        } finally { await teacher.context.close(); await learner.context.close(); }
    });
}

// F31: la scheda gruppo/classe di /docente/classi elenca in linea le
// assegnazioni di quel gruppo e apre /docente/assegnazioni?group= filtrata.
test('group card lists its assignments inline in /docente/classi', async () => {
    const { page, context, errors } = await pageFor('teacher', 1440);
    const marker = `Inline ${Date.now().toString(36)}`;
    const requestId = `inline-${Date.now().toString(36)}`;
    const call = async (path, body) => {
        const response = await fetch(api + path, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', 'x-test-user': 'teacher' }, body: body ? JSON.stringify(body) : undefined });
        assert.ok(response.ok, await response.clone().text()); return response.json();
    };
    try {
        const targets = await call('/teacher/assignment-targets');
        const group = targets.find(row => row.name === 'Classe 3B');
        assert.ok(group, 'Class 3B is an assignment target');
        const entry = (await call('/teacher/goal-catalog')).find(row => row.status === 'published' && row.data?.title === 'Pianificare lo studio');
        assert.ok(entry, 'published goal entry is available');
        await call('/teacher/assignments', { group_id: group.id, source_kind: 'goal', source_id: entry.id, instructions: marker, request_id: requestId, due_date: '2026-10-12' });

        await page.goto(`${origin}/docente/classi`);
        const blockFor = name => page.locator('details').filter({ hasText: 'Assegnazioni della classe' })
            .filter({ has: page.locator(`a[href="/docente/assegnazioni?group=${encodeURIComponent(name)}"]`) });
        const block = blockFor('Classe 3B');
        await block.locator('summary').click();
        const item = block.locator('a[href*="#assignment-"]').first();
        await item.waitFor();
        // Le assegnazioni degli altri gruppi restano fuori dal blocco della classe.
        assert.equal(await block.getByText('Film per riflettere').count(), 0);
        const href = await item.getAttribute('href');
        assert.match(href, /^\/docente\/assegnazioni\?group=Classe%203B#assignment-\d+$/);
        assert.equal(await block.getByRole('link', { name: 'Gestisci o assegna' }).getAttribute('href'), '/docente/assegnazioni?group=Classe%203B');

        // Un gruppo senza assegnazioni mostra lo stato vuoto.
        const emptyName = `Classe vuota ${Date.now().toString(36)}`;
        await call('/admin/groups', { name: emptyName, school: null, school_level: null, institution_id: null });
        await page.reload();
        const emptyBlock = blockFor(emptyName);
        await emptyBlock.locator('summary').click();
        await emptyBlock.getByText('Nessuna assegnazione per questa classe o gruppo.', { exact: true }).waitFor();

        // Il reload ha riavuto i <details>: si riapre il blocco della classe
        // (il fetch riparte allo stato fresco del componente).
        await block.locator('summary').click();
        // Il link porta alla pagina assegnazioni già filtrata per il gruppo,
        // con il dettaglio dell'assegnazione (e le sue indicazioni) a vista.
        await item.click();
        await page.waitForURL(/docente\/assegnazioni\?group=Classe/);
        await page.getByText(marker, { exact: false }).waitFor();
        assert.equal(await page.getByText('Film per riflettere').count(), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
