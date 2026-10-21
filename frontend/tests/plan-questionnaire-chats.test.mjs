// #249: synthetic browser journeys; all APIs intercepted, no external traffic.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {chromium} from 'playwright';
const origin = process.env.PLAN_QUESTIONNAIRE_BASE_URL || 'http://127.0.0.1:3159';
let browser;
before(async () => {browser = await chromium.launch({headless: true});});
after(async () => {await browser?.close();});
const codes = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
const group = {id: 11, name: 'Classe sintetica', code: 'GR-SYN', owner_username: 'teacher', is_active: true, institution_id: 5};
const administration = {id: 5, code: 'AP-SYN', title: 'Questionario iniziale', instrument_code: 'QSA', locale: 'it', institution_name: 'Istituto sintetico'};
const result = id => ({id, session_id: `result-${id}`, questionnaire_type: 'QSA', scores: {C1: 5, C2: 7}, locale: 'it'});
const bound = id => ({path_id: 301, step_id: 20, results_step_id: null, session_id: 'bound-249', started_at: '2026-10-21T12:00:00Z', result: result(id)});
async function fixture({width = 1440, teacher = true, pending = false, options = null} = {}) {
    const context = await browser.newContext({viewport: {width, height: 1000}, reducedMotion: 'reduce'});
    const page = await context.newPage(); page.setDefaultTimeout(25000);
    const state = {requests: [], errors: [], options, snapshot: null, templates: [], path: {
        id: 301, group_id: 11, title: 'Analisi questionari', status: 'draft', mode: 'recommended', revision: 1,
        steps: pending ? [{id: 10, position: 1, step_type: 'pending', tool_key: null,
            pending_config: {kind: 'questionnaire_administration', instrument_code: 'QSA', plan_title: 'Avvio', locale: 'it'}}] : []}};
    page.on('pageerror', error => state.errors.push(error.message));
    await page.addInitScript(() => {localStorage.setItem('cb_lang', 'it');localStorage.setItem('cb_theme', 'light');localStorage.setItem('counselorbot_selected_counselor', '1');});
    await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const p = url.pathname, method = req.method(), body = req.postData() ? req.postDataJSON() : null;
        state.requests.push({p, method, body});
        const json = (data, status = 200) => route.fulfill({status, json: data});
        if (p === '/api/auth/me') return json({authenticated: true, is_admin: false, username: teacher ? 'teacher' : 'student', name: 'Prova', groups: teacher ? ['docenti'] : ['studenti']});
        if (p === '/api/user/account' || p === '/api/user/account-preferences') return json({setup_complete: true, notebook_completed: true, setup_completed: true, counselor_id: 1, counselor_ready: true, notebook_ready: true});
        if (p === '/api/orientation/status') return json({required: false, completed: true});
        if (p === '/api/admin/groups') return json([group]);
        if (p === '/api/teacher/groups/11/settings') return json({group_id: 11, revision: 1, disabled_tool_keys: [], tools: [...codes.map(key => ({key, enabled: true, admin_enabled: true, kind: 'instrument', category: 'assessment', label_i18n: {}, always_on: false})), {key: 'tavolo', enabled: true, admin_enabled: true, kind: 'personal', category: 'personal', label_i18n: {}, always_on: false}]});
        if (p === '/api/teacher/groups/11/paths') return json([state.path]);
        if (p === '/api/teacher/groups/11/administrations') return json([administration]);
        if (p === '/api/instruments') return json(codes.map(code => ({code, name_en: code, available_locales: ['it'], is_active: true})));
        if (p === '/api/teacher/paths/301' && method === 'PUT') {
            const steps = body.steps.map((step, index) => ({...step, id: step.id ?? index + 10, position: index + 1, tool_key: step.tool_key ?? null, auto_detect: true,
                pending_config: step.step_type === 'pending' ? state.path.steps.find(row => row.id === step.id)?.pending_config : null,
                target_summary: step.step_type === 'questionnaire_administration' ? administration : null}));
            for (const step of steps) if (step.results_from !== undefined) {step.results_step_id = steps[step.results_from].id;delete step.results_from;}
            state.path = {...state.path, ...body, revision: body.revision + 1, steps};return json(state.path);
        }
        if (p === '/api/teacher/path-templates' && method === 'GET') return json({mine: state.templates, shared: []});
        if (p === '/api/teacher/path-templates' && method === 'POST') {
            const tpl = {...body, id: 70, is_owner: true, owner_username: 'teacher', owner_name: 'Prova', revision: 1,
                steps: body.steps.map((step, index) => ({...step, id: 900 + index, position: index + 1}))};
            state.templates.push(tpl);return json(tpl, 201);
        }
        if (p.endsWith('/deep-dive')) {
            if (method === 'GET') return json(state.options);
            const session = bound(body.result_id);state.options.session = session;return json(session);
        }
        if (p === '/api/session/frozen/bound-249') return state.snapshot ? json(state.snapshot) : json({}, 404);
        if (p === '/api/session/freeze') {state.snapshot = body;return json(body);}
        if (p === '/api/qsa/guided-ui-texts') return json({guided_steps: [
            {id: 'intro', label: 'Presentazione', sort_order: 0, system_prompt_mode: 'generic'},
            {id: 'qsa-focus', label: 'Il mio metodo', sort_order: 1, system_prompt_mode: 'generic'}]});
        if (p === '/api/memory/user/bound-249') return json({});
        if (p === '/api/counselors') return json([{id: 1, name: 'Counselor sintetico', suitable: true, is_active: true, language: ['it']}]);
        if (p.endsWith('/recommendations')) return json({reading: [], strategy: []});
        if (p === '/api/chat/stream') return route.fulfill({contentType: 'text/event-stream', body: `data: ${JSON.stringify({display: 'Risposta sintetica'})}\n\ndata: ${JSON.stringify({done: true, response: 'Risposta sintetica'})}\n\n`});
        return json([]);
    });
    return {context, page, state};
}
async function editor(page) {
    await page.goto(`${origin}/docente/piani-operativi`, {waitUntil: 'domcontentloaded'});
    await page.getByRole('button', {name: 'Apri', exact: true}).click();
    await page.locator('[data-testid="add-step"]').waitFor();
}
async function addKind(page, name) {
    const add = page.locator('[data-testid="add-step"]');
    await add.getByRole('button', {name: '+ Aggiungi passo', exact: true}).click();
    await add.getByRole('radio', {name, exact: true}).check();return add;
}
for (const width of [390, 1440]) test(`questionnaire and analysis save together at ${width}px`, async () => {
    const {context, page, state} = await fixture({width});
    try {
        await editor(page);
        let add = await addKind(page, 'Compila un questionario');
        await add.getByRole('combobox', {name: 'Somministrazione della classe'}).selectOption('5');
        await add.getByRole('button', {name: 'Aggiungi passo', exact: true}).click();
        add = await addKind(page, 'Fa una chat guidata');
        const source = add.getByRole('combobox', {name: 'Risultati del passo'});
        const values = await source.locator('option').evaluateAll(rows => rows.slice(1).map(row => row.value));
        assert.equal(values.length, 1);assert.ok(!values[0].startsWith('id:'));
        await source.selectOption(values[0]);
        await page.screenshot({path: new URL(`../../output/playwright/questionnaire-plan-${width}.png`, import.meta.url).pathname, fullPage: true});
        await add.getByRole('button', {name: 'Aggiungi passo', exact: true}).click();
        assert.equal(state.requests.filter(row => row.method === 'PUT').length, 0);
        await page.getByRole('button', {name: 'Salva bozza', exact: true}).click();
        await page.getByText('Bozza salvata', {exact: true}).waitFor();
        const save = state.requests.find(row => row.method === 'PUT');
        assert.equal(save.body.steps[1].results_from, 0);
        assert.equal(state.path.steps[1].results_step_id, state.path.steps[0].id);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});
test('pending questionnaires are selectable and personal analysis offers six instruments', async () => {
    const {context, page, state} = await fixture({pending: true});
    try {
        await editor(page);let add = await addKind(page, 'Fa una chat guidata');
        await add.getByRole('combobox', {name: 'Risultati del passo'}).selectOption('id:10');
        await add.getByRole('button', {name: 'Aggiungi passo', exact: true}).click();
        add = await addKind(page, 'Fa una chat guidata');
        const analysis = add.getByRole('combobox', {name: 'Analizza un questionario'});
        assert.deepEqual(await analysis.locator('option').evaluateAll(rows => rows.slice(1).map(row => row.value)), codes);
        await analysis.selectOption('QSA');await add.getByRole('button', {name: 'Aggiungi passo', exact: true}).click();
        await page.getByRole('button', {name: 'Salva bozza', exact: true}).click();
        await page.getByText('Bozza salvata', {exact: true}).waitFor();
        const save = state.requests.find(row => row.method === 'PUT');
        assert.equal(save.body.steps[1].results_step_id, 10);assert.equal(save.body.steps[2].tool_key, 'QSA');
        assert.equal(save.body.steps[2].results_step_id, undefined);assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});
test('a template proposes personal analysis without a questionnaire step', async () => {
    const {context, page, state} = await fixture();
    try {
        await page.goto(`${origin}/docente/piani-operativi`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Nuovo modello', exact: true}).click();
        await page.getByRole('textbox', {name: 'Titolo', exact: true}).fill('Analisi personale QSA');
        await page.getByRole('button', {name: '+ Aggiungi passo', exact: true}).click();
        await page.getByRole('radio', {name: 'Fa una chat guidata', exact: true}).check();
        await page.getByRole('button', {name: 'Analizza un questionario', exact: true}).click();
        await page.getByRole('combobox', {name: 'Origine dei risultati'}).selectOption('personal');
        await page.getByRole('combobox', {name: 'Analizza un questionario'}).selectOption('QSA');
        await page.getByRole('button', {name: 'Salva modello', exact: true}).click();
        await page.getByText('Analisi personale QSA', {exact: true}).waitFor();
        const request = state.requests.find(row => row.p === '/api/teacher/path-templates' && row.method === 'POST');
        assert.equal(request.body.steps[0].tool_key, 'QSA');assert.equal(request.body.steps[0].results_position, undefined);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});
for (const personal of [false, true]) test(`missing ${personal ? 'personal' : 'plan'} result exposes the next action`, async () => {
    const source_href = personal ? '/?start=QSA' : '/profilo/piani-operativi/301/10';
    const {context, page, state} = await fixture({teacher: false, width: 390, options: {personal, ready: false, source_href, results: [], session: null}});
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        const link = page.getByRole('link', {name: personal ? 'Aggiungi una compilazione' : 'Apri il passo questionario'});
        await link.waitFor();assert.equal(await link.getAttribute('href'), source_href);
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 0);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});
test('explicit result choice reopens the same frozen session', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: true, ready: true, source_href: '/?start=QSA',
        results: [{id: 7, submitted_at: '2026-09-10T12:00:00Z', locale: 'it'}, {id: 8, submitted_at: '2026-09-20T12:00:00Z', locale: 'en'}], session: null}});
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        const start = page.getByRole('button', {name: 'Avvia o riprendi l’approfondimento', exact: true});
        await start.waitFor();assert.equal(await start.isDisabled(), true);
        await page.getByRole('combobox', {name: 'Scegli la compilazione'}).selectOption('8');await start.click();
        await page.getByRole('button', {name: 'Inizia', exact: true}).waitFor();
        assert.deepEqual(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').map(row => row.body), [{result_id: 8}]);
        state.snapshot = {session_id: 'bound-249', questionnaire_type: 'QSA', current_phase: 'qsa-focus', scores: result(8).scores,
            counselor_id: 1, locale: 'it', guided_path: 'complete', messages: [{role: 'assistant', content: 'Riflessione conservata sul risultato otto'}]};
        await page.reload({waitUntil: 'domcontentloaded'});await page.getByText('Riflessione conservata sul risultato otto', {exact: true}).waitFor();
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 1);
        assert.equal(await page.getByRole('combobox', {name: 'Scegli la compilazione'}).count(), 0);assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});


test('personal analysis after an unsaved personal-tool step keeps its own source', async () => {
    const {context, page, state} = await fixture();
    try {
        await editor(page);
        let add = await addKind(page, 'Usa uno strumento');
        await add.getByRole('combobox', {name: 'Scegli uno strumento abilitato…'}).selectOption('tavolo');
        await add.getByRole('button', {name: 'Aggiungi passo', exact: true}).click();
        add = await addKind(page, 'Fa una chat guidata');
        await add.getByRole('combobox', {name: 'Analizza un questionario'}).selectOption('QSA');
        await add.getByRole('button', {name: 'Aggiungi passo', exact: true}).click();
        await page.getByRole('button', {name: 'Salva bozza', exact: true}).click();
        await page.getByText('Bozza salvata', {exact: true}).waitFor();
        const steps = state.requests.find(row => row.method === 'PUT').body.steps;
        assert.equal(steps[1].tool_key, 'QSA');assert.equal(steps[1].results_from, undefined);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});
