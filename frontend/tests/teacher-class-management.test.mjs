import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.TEACHER_CLASSES_BASE_URL || 'http://127.0.0.1:3133').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const demo = { id: 91, name: 'Classe Demo', code: 'GR-DEMO91', school: 'Ente Demo', school_level: null, institution_id: null, description: 'Contesto salvato', methodologies: 'Laboratorio', context_visible_to_students: false, owner_username: 'teacher.fixture', is_active: true, members_count: 0 };
async function fixture({ lang = 'it', width = 390, scale = 1, role = 'docenti', admin = false, readFailure = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: scale });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const state = { rows: [structuredClone(demo), { ...demo, id: 92, name: 'Gruppo Demo', code: 'GR-DEMO92' }], writes: [], reads: [], errors: [], failure: false, readFailure, holdWrite: null, holdRead: null };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        if (request.method() !== 'GET') {
            const body = request.postDataJSON(); state.writes.push({ path: url.pathname, method: request.method(), body });
            assert.match(url.pathname, /^\/api\/admin\/groups(?:\/\d+)?$/);
            const failure = state.failure;
            if (state.holdWrite) { const pending = state.holdWrite; state.holdWrite = null; await pending; }
            if (failure) return route.fulfill({ status: failure, json: { detail: 'PRIVATE DETAIL' } });
            const id = Number(url.pathname.split('/').at(-1));
            if (request.method() === 'PUT') state.rows = state.rows.map(row => row.id === id ? { ...row, ...body } : row);
            if (request.method() === 'POST') state.rows.push({ ...demo, ...body, id: 93, name: body.name });
            return route.fulfill({ json: state.rows.find(row => row.id === id) || {} });
        }
        state.reads.push(url.pathname);
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'teacher.fixture', name: 'Teacher Demo', groups: [role], is_admin: admin };
        else if (url.pathname === '/api/admin/groups') {
            const snapshot = structuredClone(state.rows); const failure = state.readFailure;
            if (state.holdRead) await state.holdRead;
            if (failure) return route.fulfill({ status: failure, json: {} });
            data = snapshot;
        }
        else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/telegram/bot-info') data = { enabled: true, bot_username: 'fixture_bot' };
        else if (url.pathname === '/api/admin/groups/91/students') data = { students: [{ username: 'participant.fixture', telegram_linked: false, learner_profile: null, results: [] }] };
        else if (url.pathname.includes('institutions')) data = [{ id: 5, name: 'Istituto Demo', kind: 'school', slug: 'demo' }];
        return route.fulfill({ json: data });
    });
    await page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Classe Demo', exact: true }) }).last();
    const description = card.getByLabel(lang === 'it' ? 'Descrizione della classe' : lang === 'de' ? 'Beschreibung der Klasse' : 'Class description', { exact: true });
    const toggle = card.locator('button[aria-expanded]');
    const hold = kind => { let release; state[kind] = new Promise(resolve => { release = resolve; }); return () => { state[kind] = null; release(); }; };
    return { context, page, state, card, description, toggle, hold };
}

test('all classes start open; keyboard collapse preserves text, focus and emits no requests', async () => {
    const f = await fixture();
    try {
        await f.description.fill('Bozza non salvata');
        const toggles = f.page.locator('section button[aria-expanded]');
        assert.deepEqual(await toggles.evaluateAll(rows => rows.map(row => row.getAttribute('aria-expanded'))), ['true', 'true']);
        const reads = f.state.reads.length;
        await f.toggle.focus(); await f.page.keyboard.press('Enter');
        assert.equal(await f.toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await f.description.isVisible(), false);
        assert.equal(await f.description.count(), 1, 'editor remains mounted');
        assert.equal(await f.toggle.evaluate(e => e === document.activeElement), true);
        assert.equal(await f.card.getByText('Modifiche non salvate', { exact: true }).isVisible(), true);
        await f.page.keyboard.press('Space');
        assert.equal(await f.description.inputValue(), 'Bozza non salvata');
        assert.equal(await f.description.isVisible(), true);
        assert.equal(f.state.reads.length, reads);
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('collapse from an editor restores toggle focus and retains the text selection', async () => {
    const f = await fixture();
    try {
        await f.description.fill('Una bozza conservata'); await f.description.focus();
        await f.description.evaluate(e => e.setSelectionRange(2, 8));
        await f.toggle.evaluate(e => e.click());
        assert.equal(await f.toggle.evaluate(e => e === document.activeElement), true);
        await f.page.keyboard.press('Enter');
        assert.deepEqual(await f.description.evaluate(e => [e.value, e.selectionStart, e.selectionEnd]), ['Una bozza conservata', 2, 8]);
        assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

test('outer collapse also preserves already-open participant note and message drafts', async () => {
    const f = await fixture();
    try {
        await f.card.getByRole('button', { name: 'Partecipanti', exact: true }).click();
        await f.card.getByRole('button', { name: 'participant.fixture', exact: false }).click();
        const note = f.card.getByPlaceholder('Nuova nota sul partecipante...');
        const message = f.card.getByPlaceholder('Scrivi un messaggio:', { exact: false });
        await note.fill('Nota demo in bozza'); await message.fill('Messaggio demo in bozza');
        const reads = f.state.reads.length;
        await f.toggle.click(); await f.toggle.click();
        assert.equal(await note.inputValue(), 'Nota demo in bozza');
        assert.equal(await message.inputValue(), 'Messaggio demo in bozza');
        assert.equal(f.state.reads.length, reads); assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

test('existing creation stays before the list and uses exactly the existing four-field payload', async () => {
    const f = await fixture();
    try {
        await f.description.fill('Contesto esistente in bozza');
        await f.page.getByRole('button', { name: 'Nuovo gruppo o classe', exact: true }).click();
        const name = f.page.getByRole('textbox', { name: 'Nome', exact: true });
        const form = name.locator('xpath=ancestor::div[1]');
        assert.equal(await name.evaluate((e, other) => !!(e.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await f.description.elementHandle()), true);
        await name.fill('Nuovo gruppo demo');
        await form.getByRole('textbox', { name: 'Scuola, università o ente', exact: true }).fill('Ente Demo');
        await form.getByRole('combobox', { name: 'Fascia', exact: true }).selectOption('universita');
        await form.getByRole('combobox', { name: 'Istituto', exact: true }).selectOption('5');
        await form.getByRole('button', { name: 'Crea', exact: true }).click();
        await f.page.getByRole('heading', { name: 'Nuovo gruppo demo', exact: true }).waitFor();
        assert.equal(await f.page.locator('button[aria-controls="class-body-93"]').getAttribute('aria-expanded'), 'true');
        assert.equal(await f.description.inputValue(), 'Contesto esistente in bozza');
        assert.deepEqual(f.state.writes, [{ path: '/api/admin/groups', method: 'POST', body: { name: 'Nuovo gruppo demo', school: 'Ente Demo', school_level: 'universita', institution_id: 5 } }]);
    } finally { await f.context.close(); }
});

test('editing precedes invitations and management; reverting the context clears dirty state', async () => {
    const f = await fixture();
    try {
        assert.equal(await f.description.inputValue(), 'Contesto salvato');
        const invite = f.card.locator('input[readonly]').first();
        assert.equal(await f.description.evaluate((e, other) => !!(e.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await invite.elementHandle()), true);
        await f.description.fill('Bozza');
        await f.card.getByText('Modifiche non salvate', { exact: true }).waitFor();
        await f.description.fill('Contesto salvato');
        assert.equal(await f.card.getByText('Modifiche non salvate', { exact: true }).count(), 0);
        assert.equal(await f.card.getByRole('textbox', { name: 'Nome', exact: true }).count(), 0);
        assert.equal(await f.card.getByRole('textbox', { name: 'Scuola, università o ente', exact: true }).count(), 0);
        assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

test('failed context save stays visible while collapsed; retry sends the existing payload and clears dirty', async () => {
    const f = await fixture();
    try {
        await f.description.fill('  Nuovo contesto  ');
        await f.card.getByLabel('Metodologie con questa classe', { exact: true }).fill('  ');
        await f.card.getByLabel('Condividi il contesto con gli studenti iscritti').check();
        f.state.failure = 503;
        await f.card.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.card.getByRole('alert').waitFor();
        await f.toggle.click();
        assert.equal(await f.card.getByRole('alert').isVisible(), true);
        assert.equal(await f.description.inputValue(), '  Nuovo contesto  ');
        assert.equal(await f.card.getByRole('button', { name: 'Riprova salvataggio' }).isEnabled(), true);
        f.state.failure = false;
        await f.card.getByRole('button', { name: 'Riprova salvataggio' }).click();
        await f.card.getByRole('alert').waitFor({ state: 'hidden' });
        await f.card.getByText('Modifiche non salvate', { exact: true }).waitFor({ state: 'hidden' });
        await f.page.waitForFunction(() => document.activeElement?.id === 'class-toggle-91');
        await f.toggle.click();
        assert.equal(await f.description.inputValue(), 'Nuovo contesto');
        assert.equal(await f.card.getByLabel('Metodologie con questa classe', { exact: true }).inputValue(), '');
        assert.deepEqual(f.state.writes, [1, 2].map(() => ({ path: '/api/admin/groups/91', method: 'PUT', body: { description: 'Nuovo contesto', methodologies: null, context_visible_to_students: true } })));
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('a late read started before a context save cannot restore old saved values', async () => {
    const f = await fixture(); let release;
    try {
        release = f.hold('holdRead');
        await f.card.getByRole('combobox', { name: 'Fascia', exact: true }).selectOption('adulti');
        await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor();
        await f.description.fill('Salvato dopo l’inizio della lettura');
        await f.card.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.card.getByRole('status').filter({ hasText: 'Salvato' }).waitFor();
        release();
        await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor({ state: 'hidden' });
        await f.page.waitForFunction(() => document.querySelector('#class-body-91 select')?.value === 'adulti');
        assert.equal(await f.description.inputValue(), 'Salvato dopo l’inizio della lettura');
        assert.equal(await f.card.getByText('Modifiche non salvate', { exact: true }).count(), 0);
        assert.deepEqual(f.state.writes.map(write => write.body), [{ school_level: 'adulti' }, { description: 'Salvato dopo l’inizio della lettura', methodologies: 'Laboratorio', context_visible_to_students: false }]);
        assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('in-flight save blocks double submit, allows newer text, and never updates another group', async () => {
    const f = await fixture(); let release;
    try {
        await f.description.fill('Prima bozza');
        release = f.hold('holdWrite');
        const save = f.card.getByRole('button', { name: 'Salva', exact: true });
        await save.click();
        await f.card.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor();
        await save.evaluate(e => e.click());
        assert.equal(f.state.writes.length, 1);
        await f.description.fill('Scritta durante il salvataggio');
        await f.toggle.click();
        assert.equal(await f.card.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).isVisible(), true);
        release();
        await f.card.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor({ state: 'hidden' });
        await f.toggle.click();
        assert.equal(await f.description.inputValue(), 'Scritta durante il salvataggio');
        assert.equal(await f.card.getByText('Modifiche non salvate', { exact: true }).isVisible(), true);
        assert.equal(await f.page.locator('#group-desc-92').inputValue(), 'Contesto salvato');
        await f.description.fill('Prima bozza');
        assert.equal(await f.card.getByText('Modifiche non salvate', { exact: true }).count(), 0);
        assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('level/institution retain immediate partial PUTs and context draft; failed selection retries even collapsed', async () => {
    const f = await fixture();
    try {
        await f.description.fill('Bozza contesto');
        const level = f.card.getByRole('combobox', { name: 'Fascia', exact: true });
        f.state.failure = 503;
        await level.selectOption('adulti');
        await f.card.getByRole('alert').waitFor(); await f.toggle.click();
        f.state.failure = false;
        await f.card.getByRole('button', { name: 'Riprova salvataggio' }).click();
        await f.card.getByRole('alert').waitFor({ state: 'hidden' }); await f.toggle.click();
        await f.page.waitForFunction(() => document.querySelector('#class-body-91 select')?.value === 'adulti');
        await f.card.getByRole('combobox', { name: 'Istituto', exact: true }).selectOption('5');
        await f.page.waitForFunction(() => document.querySelectorAll('#class-body-91 select')[1]?.value === '5');
        assert.equal(await f.description.inputValue(), 'Bozza contesto');
        assert.deepEqual(f.state.writes.map(write => write.body), [{ school_level: 'adulti' }, { school_level: 'adulti' }, { institution_id: 5 }]);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('late success after account preview changes hides class data and never publishes the stale draft', async () => {
    const f = await fixture(); let release;
    try {
        await f.description.fill('Bozza vecchia identità');
        release = f.hold('holdWrite');
        await f.card.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.card.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor();
        await f.page.evaluate(() => sessionStorage.setItem('cb_view_as_user', 'docente.demo'));
        release();
        await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
        assert.equal(await f.page.getByLabel('Descrizione della classe', { exact: true }).count(), 0);
        assert.equal(f.state.writes.length, 1);
        assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

for (const failure of [401, 403]) test(`write ${failure} revokes editing instead of exposing a retryable private class`, async () => {
    const f = await fixture();
    try {
        f.state.failure = failure;
        await f.card.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
        assert.equal(await f.page.getByLabel('Descrizione della classe', { exact: true }).count(), 0);
        assert.equal(await f.page.getByText('PRIVATE DETAIL', { exact: false }).count(), 0);
    } finally { await f.context.close(); }
});

for (const [role, admin] of [['docenti', false], ['ricercatori', false], ['studenti', true], ['studenti', false]]) test(`access ${role}, admin=${admin} keeps existing permissions`, async () => {
    const f = await fixture({ role, admin });
    try {
        if (role === 'studenti' && !admin) {
            await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
            assert.equal(f.state.reads.includes('/api/admin/groups'), false);
        } else assert.equal(await f.description.isEnabled(), true);
        assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    for (const scale of [1, 2, 4]) test(`${lang}: 320px / ${scale * 100}% equivalent, creation and keyboard layout fit`, async () => {
        const f = await fixture({ lang, width: scale === 2 ? 640 : 320, scale });
        try {
            const toggle = f.page.locator('button[aria-controls="class-body-91"]');
            await toggle.focus(); await f.page.keyboard.press('Enter');
            assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
            await f.page.keyboard.press('Space');
            assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
            assert.equal(await f.page.locator('#group-desc-91').isVisible(), true);
            // The first primary page action is the existing creation command.
            await f.page.locator('button').filter({ has: f.page.locator('svg.lucide-plus') }).click();
            await f.page.locator('input').filter({ visible: true }).first().waitFor();
            assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}
