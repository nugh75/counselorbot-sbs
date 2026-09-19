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
                await learner.page.getByRole('link', { name: /Assegnazioni ricevute/ }).first().click();
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
        const marker = `Classe vuota ${width} ${Date.now().toString(36)}`;
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
            await teacher.page.goto(`${origin}/docente`);
            const catalogs = teacher.page.getByRole('region', { name: 'Cataloghi', exact: true });
            const strategies = catalogs.locator('details').filter({ has: teacher.page.locator('summary').filter({ hasText: /^Strategie$/ }) });
            await strategies.locator('summary').click();
            await strategies.getByRole('button', { name: 'Assegna', exact: true }).click();
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
            const teacherCard = teacher.page.locator(`#assignment-${assignment.id}`);
            await teacherCard.getByRole('button', { name: 'Restituzioni condivise', exact: true }).click();
            await teacherCard.getByText('Nessuna restituzione condivisa. Il lavoro personale non è visibile qui.').waitFor();
            await learner.page.goto(`${origin}/profilo/assegnazioni#assignment-${assignment.id}`);
            const studentCard = learner.page.locator(`#assignment-${assignment.id}`);
            await studentCard.getByText('Racconta come hai provato la strategia', { exact: false }).waitFor();
            await studentCard.getByLabel('Quando provarla (facoltativo)').fill('2026-10-12');
            await studentCard.getByRole('button', { name: 'Pianifica nel mio percorso', exact: true }).click();
            await studentCard.getByRole('link', { name: 'Apri la tappa nella Linea del tempo' }).waitFor();
            await studentCard.getByLabel('Collega a un mio obiettivo (facoltativo)').selectOption(String(goal.id));
            await studentCard.getByRole('button', { name: 'Collega obiettivo', exact: true }).click();
            await studentCard.getByRole('status').filter({ hasText: 'Salvato.' }).waitFor();
            const linked = (await call('/user/goals', 'alice')).find(row => row.id === goal.id);
            assert.deepEqual(linked.links.map(link => link.kind).sort(), ['action', 'event']);
            await studentCard.getByRole('link', { name: goal.title, exact: true }).waitFor();
            await studentCard.getByLabel('Come è andata? Riflessione personale').fill(`Privata ${marker}`);
            if (width === 1440) {
                const state = await call('/user/timeline', 'alice');
                state.workspace.timeline.events.find(event => event.id === `assignment-${assignment.id}-event`).reflection = 'Modifica da un’altra scheda';
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
            const activity = learner.page.locator('article').filter({ has: learner.page.locator(`[id$="-action-assignment-${assignment.id}"]`) });
            await activity.locator('summary').click();
            assert.equal(await activity.getByLabel('Riflessione', { exact: true }).count(), 0, 'the activity reuses the diary reflection');
            await activity.locator(`a[href="/profilo/timeline?event=assignment-${assignment.id}-event"]`).click();
            await learner.page.waitForURL(`**/profilo/timeline?event=assignment-${assignment.id}-event`);
            await learner.page.locator(`#timeline-assignment-${assignment.id}-event a[href="/profilo/assegnazioni#assignment-${assignment.id}"]`).click();
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
            await learner.page.goto(`${origin}/profilo`);
            const journey = learner.page.getByRole('region', { name: 'Assegnazioni nel mio percorso' });
            await journey.locator(`a[href="/profilo/assegnazioni#assignment-${assignment.id}"]`).waitFor();
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
