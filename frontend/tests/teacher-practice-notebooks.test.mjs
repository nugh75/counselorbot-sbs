// Taccuini studente di prova: pagina /docente/taccuini-prova e scelta «Prova»
// nelle Opzioni della Bussola. Solo fixture anonime intercettate: nessun
// backend, SSO o database. TEACHER_PRACTICE_BASE_URL sceglie il frontend.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.TEACHER_PRACTICE_BASE_URL || 'http://127.0.0.1:3141').origin;
const browser = await chromium.launch({ headless: true });
after(() => browser.close());

async function prepare(page, { lang = 'it', teacher = true, initStorage = {}, compass = false } = {}) {
    page.setDefaultTimeout(20000);
    const errors = [];
    const requests = [];
    const store = { nextId: 2, rows: [{ id: 1, title: 'Giulia, 3ª liceo', data: { main_difficulty: 'Ansia da verifica' }, archived_at: null }] };
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ lang, initStorage }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', 'light');
        for (const [key, value] of Object.entries(initStorage)) localStorage.setItem(key, value);
    }, { lang, initStorage });
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = request.method();
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        requests.push({ method, path: url.pathname, search: url.search, body });
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/auth/me') return json({
            authenticated: true, is_admin: false, is_researcher: false, username: 'teacher.test',
            name: 'Docente di prova', email: 'teacher@example.invalid', groups: teacher ? ['docenti'] : ['studenti'],
        });
        if (url.pathname === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (url.pathname === '/api/admin/groups') return json([
            { id: 31, name: '3B', school: 'Liceo Demo', context_visible_to_students: true, is_active: true },
            { id: 32, name: '4A', school: null, context_visible_to_students: false, is_active: true },
        ]);
        if (url.pathname === '/api/user/account-preferences') return json({ counselor_ready: true, notebook_ready: true, counselor_id: 1 });
        if (url.pathname === '/api/orientation/status') return json(compass
            ? { required: true, completed: false, in_progress_session_id: 'b1', latest_session_id: 'b1' }
            : { required: false, completed: true });
        const session = { session_id: 'b1', language: lang, counselor_id: 1, status: 'in_progress', messages: [{ role: 'assistant', content: 'Benvenuto.' }], recommendations: [], created_at: '2026-10-05T10:00:00Z' };
        if (url.pathname === '/api/orientation/sessions/b1') return json(session);
        if (url.pathname === '/api/orientation/sessions/b1/message') return json({ ...session, messages: [...session.messages, { role: 'user', content: body.message }, { role: 'assistant', content: 'Partiamo.' }] });
        if (url.pathname === '/api/teacher/practice-notebooks') {
            if (!teacher) return json({ detail: 'forbidden' }, 403);
            if (method === 'POST') {
                const row = { id: store.nextId++, title: body.title, data: body.data, group_ids: body.group_ids ?? [], archived_at: null };
                store.rows.unshift(row);
                return json(row, 201);
            }
            const all = url.searchParams.get('include_archived') === 'true';
            return json(store.rows.filter(row => all || !row.archived_at));
        }
        const match = url.pathname.match(/^\/api\/teacher\/practice-notebooks\/(\d+)$/);
        if (match) {
            const row = store.rows.find(item => item.id === Number(match[1]));
            if (!row) return json({ detail: 'not found' }, 404);
            if (method === 'DELETE') {
                store.rows = store.rows.filter(item => item !== row);
                return json({ deleted: row.id });
            }
            if (body.title !== undefined) row.title = body.title;
            if (body.data !== undefined) row.data = body.data;
            if (body.group_ids !== undefined) row.group_ids = body.group_ids;
            if (body.archived !== undefined) row.archived_at = body.archived ? '2026-10-05T10:00:00Z' : null;
            return json(row);
        }
        return json([]);
    });
    return { errors, requests, store };
}

test('il docente crea, modifica, archivia, ripristina ed elimina i taccuini di prova', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors, requests, store } = await prepare(page);
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${origin}/docente/taccuini-prova`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1, name: 'Taccuini di prova' }).waitFor();
    await page.getByRole('heading', { name: 'Giulia, 3ª liceo' }).waitFor();
    assert.ok(await page.getByText('Ansia da verifica').isVisible());

    await page.getByRole('button', { name: 'Nuovo taccuino di prova' }).click();
    await page.getByLabel('Nome dello studente immaginario').fill('  Marco, adulto in formazione ');
    await page.locator('#practice-notebook-strengths').fill('Curioso');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.getByRole('heading', { name: 'Marco, adulto in formazione' }).waitFor();
    const created = requests.find(r => r.method === 'POST');
    assert.deepEqual(created.body, { title: 'Marco, adulto in formazione', data: { strengths: 'Curioso' }, group_ids: [] });

    const marco = page.locator('[data-practice-notebook="2"]');
    await marco.getByRole('button', { name: 'Modifica' }).click();
    await page.getByLabel('Nome dello studente immaginario').fill('Marco B.');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.getByRole('heading', { name: 'Marco B.' }).waitFor();

    await page.locator('[data-practice-notebook="2"]').getByRole('button', { name: 'Archivia' }).click();
    await page.getByText('Archiviati (1)').click();
    await page.locator('[data-practice-notebook-archived="2"]').getByRole('button', { name: 'Ripristina' }).click();
    await page.locator('[data-practice-notebook="2"]').waitFor();
    await page.locator('[data-practice-notebook="2"]').getByRole('button', { name: 'Archivia' }).click();
    await page.getByText('Archiviati (1)').click();
    await page.locator('[data-practice-notebook-archived="2"]').getByRole('button', { name: 'Elimina' }).click();
    await page.locator('[data-practice-notebook-archived="2"]').waitFor({ state: 'detached' });
    assert.deepEqual(store.rows.map(row => row.id), [1]);
    assert.deepEqual(errors, []);
    await page.close();
});

test('la home docente porta alla pagina e la pagina regge 390 px in inglese', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const { errors } = await prepare(page, { lang: 'en' });
    await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('link', { name: /Practice notebooks/ }).getAttribute('href'), '/docente/taccuini-prova');
    await page.goto(`${origin}/docente/taccuini-prova`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1, name: 'Practice notebooks' }).waitFor();
    await page.getByRole('button', { name: 'New practice notebook' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
});

test('uno studente non vede la pagina dei taccuini di prova', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { requests } = await prepare(page, { teacher: false });
    await page.goto(`${origin}/docente/taccuini-prova`, { waitUntil: 'networkidle' });
    await page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
    assert.equal(requests.filter(r => r.path.startsWith('/api/teacher/practice-notebooks')).length, 0);
    await page.close();
});

test('nella Bussola il docente sceglie «Prova» e il turno porta il taccuino scelto', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors, requests } = await prepare(page, { compass: true });
    await page.goto(`${origin}/bussola`, { waitUntil: 'networkidle' });
    await page.locator('#bussola-composer').waitFor();
    await page.getByRole('button', { name: 'Opzioni' }).click();
    const selector = page.getByRole('radiogroup', { name: 'Taccuino nel contesto' });
    assert.deepEqual(await selector.getByRole('radio').allTextContents(), ['Predefinito', 'Prova']);
    await selector.getByRole('radio', { name: /Prova/ }).click();
    const picker = page.locator('[data-practice-notebook-picker]');
    await picker.getByRole('combobox').waitFor();
    assert.equal(await picker.getByRole('combobox').inputValue(), '1');
    assert.ok(await picker.getByText('Simulazione: il modello sa che lo studente è immaginario.').isVisible());
    assert.equal(await picker.getByRole('link', { name: 'Gestisci i taccuini di prova' }).getAttribute('href'), '/docente/taccuini-prova');
    await page.keyboard.press('Escape');
    await page.locator('#bussola-composer').fill('Da dove parto?');
    await page.locator('#bussola-composer').press('Enter');
    await page.getByLabel('Bussola CounselorBot').getByText('Partiamo.').waitFor();
    const sent = requests.find(r => r.path === '/api/orientation/sessions/b1/message');
    assert.equal(sent.body.notebook_context, 'practice');
    assert.equal(sent.body.practice_notebook_id, 1);
    assert.deepEqual(errors, []);
    await page.close();
});

test('nella Bussola uno studente non vede la scelta e non la invia', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { requests } = await prepare(page, {
        teacher: false,
        compass: true,
        initStorage: { 'cb-notebook-context': 'practice', 'cb-practice-notebook-id': '1' },
    });
    await page.goto(`${origin}/bussola`, { waitUntil: 'networkidle' });
    await page.locator('#bussola-composer').waitFor();
    await page.getByRole('button', { name: 'Opzioni' }).click();
    assert.equal(await page.getByRole('radiogroup', { name: 'Taccuino nel contesto' }).count(), 0);
    await page.keyboard.press('Escape');
    await page.locator('#bussola-composer').fill('Da dove parto?');
    await page.locator('#bussola-composer').press('Enter');
    await page.getByLabel('Bussola CounselorBot').getByText('Partiamo.').waitFor();
    const sent = requests.find(r => r.path === '/api/orientation/sessions/b1/message');
    assert.equal(sent.body.notebook_context, undefined);
    assert.equal(sent.body.practice_notebook_id, undefined);
    await page.close();
});

// Chat guidata (percorso docenza ripreso): stessa scelta nel popover Opzioni.
const stream = data => `data: ${JSON.stringify(data)}\n\n`;
async function guidedChat(page) {
    page.setDefaultTimeout(20000);
    const state = { errors: [], writes: [] };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('cb_theme', 'light');
        localStorage.setItem('counselorbot_selected_counselor', '1');
        localStorage.setItem('counselorbot_resume', JSON.stringify({ instrument: 'OBIETTIVO_DOCENZA', experience: 'standard', sessionId: 'practice-chat', counselorId: 1 }));
    });
    await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        const path = url.pathname.slice(4); let data = [];
        if (request.method() !== 'GET') {
            state.writes.push({ path, body: request.postDataJSON() });
            if (path === '/chat/stream') {
                const reply = `Risposta: ${request.postDataJSON().message}`;
                return route.fulfill({ contentType: 'text/event-stream', body: stream({ conversation_id: 'practice-demo' }) + stream({ display: reply }) + stream({ done: true, response: reply, conversation_id: 'practice-demo' }) });
            }
            return route.fulfill({ json: request.postDataJSON() ?? {} });
        }
        if (path === '/auth/me') data = { authenticated: true, username: 'teacher.fixture', name: 'Teacher Demo', is_admin: false, groups: ['docenti'] };
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/counselors') data = [{ id: 1, name: 'Demo', slug: 'fixture', language: ['*'], suitable: true, is_active: true }];
        else if (path === '/user/teacher-notebook') data = null;
        else if (path === '/session/frozen/practice-chat') data = null;
        else if (path === '/teacher/practice-notebooks') data = [{ id: 5, title: 'Sara, prima superiore', data: {}, archived_at: null }, { id: 6, title: 'Luca, adulto', data: {}, archived_at: null }];
        else if (path === '/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 0, system_prompt_mode: 'generic' }] };
        else if (path.startsWith('/memory/') || path === '/telegram/bot-info') data = {};
        else if (path.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        return route.fulfill({ json: data });
    });
    return state;
}

test('nella chat guidata il docente sceglie «Prova» e un taccuino: turno e snapshot lo portano', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const state = await guidedChat(page);
    await page.goto(`${origin}/?resume=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Inizia', exact: true }).click();
    await page.locator('#guided-composer').waitFor();
    await page.getByRole('button', { name: 'Opzioni' }).click();
    const selector = page.getByRole('radiogroup', { name: 'Taccuino nel contesto' });
    assert.deepEqual(await selector.getByRole('radio').allTextContents(), ['Predefinito', 'Studente', 'Docente', 'Prova', 'Nessuno']);
    await selector.getByRole('radio', { name: /Prova/ }).click();
    const picker = page.locator('[data-practice-notebook-picker]').getByRole('combobox');
    await picker.waitFor();
    await picker.selectOption('6');
    assert.equal(await page.evaluate(() => localStorage.getItem('cb-practice-notebook-id')), '6');
    assert.equal(await page.evaluate(() => localStorage.getItem('cb-notebook-context')), 'practice');
    await page.keyboard.press('Escape');
    await page.locator('#guided-composer').fill('Proviamo');
    await page.locator('#guided-composer').press('Enter');
    await page.getByRole('log').getByText('Risposta: Proviamo', { exact: true }).waitFor();
    const turn = state.writes.filter(w => w.path === '/chat/stream').at(-1).body;
    assert.equal(turn.notebook_context, 'practice');
    assert.equal(turn.practice_notebook_id, 6);
    // Autosalvataggio della sessione ~1,5 s dopo il turno.
    await page.waitForTimeout(2500);
    const frozen = state.writes.filter(w => w.path === '/session/freeze').at(-1)?.body;
    assert.equal(frozen?.notebook_context, 'practice');
    assert.equal(frozen?.practice_notebook_id, 6);
    assert.deepEqual(state.errors, []);
    await page.close();
});

test('il docente associa classi a un taccuino di prova e vede quali non sono condivise', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const { errors, requests, store } = await prepare(page);
    await page.goto(`${origin}/docente/taccuini-prova`, { waitUntil: 'networkidle' });
    await page.locator('[data-practice-notebook="1"]').getByRole('button', { name: 'Modifica' }).click();
    const classes = page.getByRole('group', { name: 'Classi dello studente' });
    await classes.getByRole('checkbox', { name: /3B — Liceo Demo/ }).check();
    await classes.getByRole('checkbox', { name: /4A/ }).check();
    assert.ok(await classes.getByText('contesto non condiviso con gli studenti: non entra nella chat').isVisible());
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.locator('[data-practice-notebook="1"]').getByRole('button', { name: 'Modifica' }).waitFor();
    assert.deepEqual(requests.filter(r => r.method === 'PUT').at(-1).body.group_ids, [31, 32]);
    assert.deepEqual(store.rows[0].group_ids, [31, 32]);
    const card = page.locator('[data-practice-notebook="1"]');
    assert.ok(await card.getByText('3B — Liceo Demo').isVisible());
    assert.ok(await card.getByText('contesto non condiviso con gli studenti: non entra nella chat').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
});
