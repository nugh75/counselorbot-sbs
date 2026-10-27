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
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(180000);
    const state = {requests: [], errors: [], options, snapshot: null, snapshotStatus: 200, studentPaths: [], launch: null, templates: [], path: {
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
        if (p === '/api/user/access') return json({restricted: false, tool_keys: codes, counselor_ids: null, class_ids: [11]});
        if (p === '/api/student/class-chat-settings') return json({allow_student_response_format:true, allow_student_response_length:true, allow_student_response_reasoning:true});
        if (p === '/api/user/paths') return json(state.studentPaths);
        if (p.endsWith('/launch')) return json(state.launch);
        if (p === '/api/session/frozen') return json(state.snapshot ? [state.snapshot] : []);
        if (p === '/api/admin/groups') return json([group]);
        if (p === '/api/teacher/groups/11/settings') return json({group_id: 11, revision: 1, disabled_tool_keys: [], tools: [...codes.map(key => ({key, enabled: true, admin_enabled: true, kind: 'instrument', category: 'assessment', label_i18n: {}, always_on: false})), {key: 'tavolo', enabled: true, admin_enabled: true, kind: 'personal', category: 'personal', label_i18n: {}, always_on: false}]});
        if (p === '/api/teacher/groups/11/paths') return json([state.path]);
        if (p === '/api/teacher/groups/11/administrations') return json([administration]);
        if (p === '/api/instruments') return json(codes.map(code => ({code, name_en: code, name_i18n: {it: code, en: code}, available_locales: ['it'], is_active: true})));
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
        if (p === '/api/session/frozen/bound-249') return state.snapshotStatus !== 200 ? json({detail: 'qpcc_legacy_profile'}, state.snapshotStatus) : state.snapshot ? json(state.snapshot) : json({}, 404);
        if (p === '/api/session/freeze') {state.snapshot = body;return json(body);}
        if (p === '/api/qsa/guided-ui-texts' && url.searchParams.get('questionnaire_type') === 'QPCC') return json({guided_steps: [
            {id: 'qpcc-intro', label: 'Presentazione', sort_order: 0, system_prompt_mode: 'generic'},
            {id: 'qpcc-profilo', label: 'Il mio profilo', sort_order: 1, system_prompt_mode: 'generic'}]});
        if (p === '/api/qsa/guided-ui-texts') return json({guided_steps: [
            {id: 'intro', label: 'Presentazione', sort_order: 0, system_prompt_mode: 'generic'},
            {id: 'qsa-focus', label: 'Il mio metodo', sort_order: 1, system_prompt_mode: 'generic'}]});
        if (p === '/api/memory/user/bound-249') return json({});
        if (p === '/api/user/questionnaire-result/bound-249/summary') return json({summary: 'Sintesi sintetica del piano', status: 'ready'});
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
        await page.reload({waitUntil: 'domcontentloaded'});await page.getByRole('log').getByText('Riflessione conservata sul risultato otto', {exact: true}).waitFor();
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 1);
        assert.equal(await page.getByRole('combobox', {name: 'Scegli la compilazione'}).count(), 0);assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

for (const width of [390, 1440]) test(`final choices of the plan analysis stay on the step at ${width}px`, async () => {
    const {context, page, state} = await fixture({teacher: false, width, options: {personal: true, ready: true, source_href: '/?start=QSA', results: [], session: bound(8)}});
    state.snapshot = {session_id: 'bound-249', questionnaire_type: 'QSA', current_phase: 'conclusion', scores: result(8).scores,
        counselor_id: 1, locale: 'it', guided_path: 'complete', messages: [{role: 'assistant', content: 'Conclusione sintetica'}]};
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Continua alle scelte finali', exact: true}).click();
        await page.getByRole('heading', {name: 'Analisi completata', exact: true}).waitFor();
        await page.getByText('Sintesi sintetica del piano', {exact: true}).waitFor();
        assert.equal(new URL(page.url()).pathname, '/profilo/piani-operativi/301/20/approfondimento');
        assert.ok(await page.getByRole('button', {name: 'Scarica il resoconto PDF'}).isVisible());
        assert.equal(await page.getByRole('link', {name: 'Torna ai piani operativi', exact: true}).getAttribute('href'), '/profilo/piani-operativi');
        // The finished chat leaves no pause behind in Resume.
        assert.ok(state.requests.some(row => row.p === '/api/session/frozen/bound-249' && row.method === 'DELETE'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});
test('a completed analysis without a pause reopens on its final choices', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: true, ready: true, source_href: '/?start=QSA', results: [], session: bound(8), completed: true}});
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('heading', {name: 'Analisi completata', exact: true}).waitFor();
        await page.getByText('Sintesi sintetica del piano', {exact: true}).waitFor();
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 0);
        assert.deepEqual(state.errors, []);
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

for (const width of [390, 1440]) test(`QPCC resumes the saved phase and keeps data entry available at ${width}px`, async () => {
    const qpcc = {...bound(8), results_step_id: 10, result: {...result(8), questionnaire_type: 'QPCC',
        scores: Object.fromEntries(['A1','A2','A3','V1','V2','C1','C2','M1','M2','M3'].map(code => [code, 5]))}};
    const {context, page, state} = await fixture({teacher: false, width, options: {personal: false, ready: true,
        source_href: '/profilo/piani-operativi/301/10', results: [], session: qpcc}});
    state.snapshot = {session_id: qpcc.session_id, questionnaire_type: 'QPCC', current_phase: 'qpcc-profilo',
        scores: qpcc.result.scores, counselor_id: 1, locale: 'it', messages: [
            {role: 'system', content: '--- Il mio profilo ---'},
            {role: 'user', content: 'Una riflessione già inviata'}, {role: 'assistant', content: 'Ripresa QPCC dal punto conservato'}]};
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('log').getByText('Ripresa QPCC dal punto conservato', {exact: true}).waitFor();
        const reenter = page.getByRole('link', {name: 'Reinserisci i dati', exact: true});
        assert.equal(await reenter.getAttribute('href'), '/profilo/piani-operativi/301/10');
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream').length, 0);
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 0);
        await page.screenshot({path: new URL(`../../output/playwright/qpcc-plan-resume-${width}.png`, import.meta.url).pathname, fullPage: true});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

test('a rejected legacy QPCC snapshot explains recovery and still links to data entry', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: false, ready: true,
        source_href: '/profilo/piani-operativi/301/10', results: [], session: {...bound(8), result: {...result(8), questionnaire_type: 'QPCC'}}}});
    state.snapshotStatus = 409;
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        await page.getByText(/Questo vecchio profilo K1–K5/).waitFor();
        assert.equal(await page.getByRole('link', {name: 'Reinserisci i dati', exact: true}).getAttribute('href'), '/profilo/piani-operativi/301/10');
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream').length, 0);
        assert.equal(state.requests.filter(row => row.method === 'DELETE').length, 0);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

test('legacy plan recovery opens the canonical ten-factor form', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: false, ready: false, legacy_profile: true,
        source_href: '/profilo/piani-operativi/301/10', results: [], session: null}});
    state.launch = {path_id: 301, step_id: 10, administration_plan_id: 5, instrument_code: 'QPCC', locale: 'it', delivery_mode: 'external_it',
        external_href: 'https://www.competenzestrategiche.it/QPCC/', latest_entry: null,
        score_factors: ['A1','A2','A3','V1','V2','C1','C2','M1','M2','M3'].map(code => ({code, label_i18n: {it: `Scala ${code}`}})),
        institution: {id: 5, name: 'Istituto sintetico', institution_code: 'SYN', institution_password: null}};
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        await page.getByText(/Questo vecchio profilo K1–K5/).waitFor();
        await page.getByRole('link', {name: 'Reinserisci i dati', exact: true}).click();
        await page.locator('input[name="scores.M3"]').waitFor();
        assert.equal(await page.locator('input[inputmode="numeric"]').count(), 10);
        assert.equal(state.requests.filter(row => row.method === 'DELETE').length, 0);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

test('an administration resumes its exact snapshot and can return to data entry', async () => {
    const {context, page, state} = await fixture({teacher: false});
    state.launch = {path_id: 301, step_id: 10, administration_plan_id: 5, instrument_code: 'QSA', locale: 'it', delivery_mode: 'external_it',
        external_href: 'https://www.competenzestrategiche.it/QSA/',
        latest_entry: {session_id: 'bound-249', guided_entry_id: 1, evidence_id: 1, accepted_at: '2026-10-21T12:00:00Z', result: result(8)},
        score_factors: ['C1','C2'].map(code => ({code, label_i18n: {it: `Scala ${code}`}})),
        institution: {id: 5, name: 'Istituto sintetico', institution_code: 'SYN', institution_password: null}};
    state.snapshot = {session_id: 'bound-249', questionnaire_type: 'QSA', current_phase: 'qsa-focus', scores: result(8).scores,
        counselor_id: 1, locale: 'it', messages: [{role: 'system', content: '--- Il mio metodo ---'},
            {role: 'assistant', content: 'Conversazione della somministrazione conservata'}]};
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/10`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Riprendi chat', exact: true}).click();
        await page.getByRole('log').getByText('Conversazione della somministrazione conservata', {exact: true}).waitFor();
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream').length, 0);
        await page.getByRole('button', {name: 'Reinserisci i dati', exact: true}).click();
        await page.locator('input[name="scores.C1"]').waitFor();
        assert.equal(await page.locator('input[name="scores.C1"]').inputValue(), '');
        state.snapshotStatus = 500;
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.locator('input[name="scores.C1"]').waitFor();
        assert.equal(await page.getByRole('button', {name: 'Riprendi chat', exact: true}).count(), 0);
        assert.equal(state.requests.filter(row => row.p.endsWith('/guided-entry')).length, 0);
        assert.equal(state.requests.filter(row => row.method === 'DELETE').length, 0);
        assert.deepEqual(state.errors, []);
    } catch (error) {
        error.message += `\nPage: ${await page.locator('body').innerText()}\nRequests: ${JSON.stringify(state.requests.map(row => [row.method, row.p]))}`;
        throw error;
    } finally {await context.close();}
});

test('a progress-section resume link directly opens the exact administration checkpoint', async () => {
    const {context, page, state} = await fixture({teacher: false});
    state.launch = {path_id: 301, step_id: 10, administration_plan_id: 5, instrument_code: 'QSA', locale: 'it', delivery_mode: 'external_it',
        external_href: 'https://www.competenzestrategiche.it/QSA/',
        latest_entry: {session_id: 'bound-249', guided_entry_id: 1, evidence_id: 1, accepted_at: '2026-10-21T12:00:00Z', result: result(8)},
        score_factors: ['C1','C2'].map(code => ({code, label_i18n: {it: `Scala ${code}`}})),
        institution: {id: 5, name: 'Istituto sintetico', institution_code: 'SYN', institution_password: null}};
    state.snapshot = {session_id: 'bound-249', questionnaire_type: 'QSA', current_phase: 'qsa-focus', scores: result(8).scores,
        counselor_id: 1, locale: 'it', messages: [{role: 'system', content: '--- Il mio metodo ---'},
            {role: 'assistant', content: 'Conversazione della somministrazione conservata'}]};
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/10?resume=1`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('log').getByText('Conversazione della somministrazione conservata', {exact: true}).waitFor();
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream').length, 0);
        await page.getByRole('button', {name: 'Reinserisci i dati', exact: true}).click();
        await page.locator('input[name="scores.C1"]').waitFor();
        assert.equal(await page.locator('input[name="scores.C1"]').inputValue(), '');
        state.snapshotStatus = 500;
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.locator('input[name="scores.C1"]').waitFor();
        assert.equal(await page.getByRole('button', {name: 'Riprendi chat', exact: true}).count(), 0);
        assert.equal(state.requests.filter(row => row.p.endsWith('/guided-entry')).length, 0);
        assert.equal(state.requests.filter(row => row.method === 'DELETE').length, 0);
        assert.deepEqual(state.errors, []);
    } catch (error) {
        error.message += `\nPage: ${await page.locator('body').innerText()}\nRequests: ${JSON.stringify(state.requests.map(row => [row.method, row.p]))}`;
        throw error;
    } finally {await context.close();}
});

test('a standalone plan chat exposes resume beside its new-start action', async () => {
    const {context, page, state} = await fixture({teacher: false});
    state.studentPaths = [{id: 301, group_id: 11, group_name: 'Classe sintetica', title: 'Piano sintetico', mode: 'recommended',
        done: 0, total: 1, next_step_id: 30, steps: [{id: 30, path_id: 301, position: 1, step_type: 'guided_chat',
            tool_key: 'SAVICKAS', title: 'Colloquio', state: 'not_done', start_href: '/?start=SAVICKAS'}]}];
    state.snapshot = {session_id: 'bound-249', questionnaire_type: 'SAVICKAS', current_phase: 'savickas-role-models',
        messages: [], updated_at: '2026-10-27T12:00:00Z'};
    try {
        await page.goto(`${origin}/profilo/piani-operativi`, {waitUntil: 'domcontentloaded'});
        const card = page.getByTestId('class-path-hero-card');
        await card.getByRole('link', {name: 'Riprendi chat', exact: true}).waitFor();
        assert.equal(await card.getByRole('link', {name: 'Riprendi chat', exact: true}).getAttribute('href'), '/?frozen=bound-249&from=plan');
        assert.equal(await card.getByRole('link', {name: 'Inizia', exact: false}).getAttribute('href'), '/?start=SAVICKAS&from=plan');
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});
