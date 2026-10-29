// #249: synthetic browser journeys; all APIs intercepted, no external traffic.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {chromium} from 'playwright';
import {guideTaskCopy} from '../src/lib/i18n-guide-tasks.ts';
import {guidedIntroText} from '../src/lib/i18n-guided-intro.ts';
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
    const state = {requests: [], errors: [], options, activities: {}, snapshot: null, snapshotStatus: 200, studentPaths: [], launch: null, templates: [], path: {
        id: 301, group_id: 11, title: 'Analisi questionari', status: 'draft', mode: 'recommended', revision: 1,
        steps: pending ? [{id: 10, position: 1, step_type: 'pending', tool_key: null,
            pending_config: {kind: 'questionnaire_administration', instrument_code: 'QSA', plan_title: 'Avvio', locale: 'it'}}] : []}};
    const activityFor = stepId => {
        if (state.activities[stepId]) {
            const detail = state.activities[stepId], current = detail.current;
            return {...detail, primary: {label: current.state === 'completed' ? 'review' : 'resume', href: current.href},
                repeat: {label: detail.kind === 'questionnaire' ? 'newCompilation' : 'anotherAttempt', href: `/profilo/piani-operativi/301/${stepId}?attempt=new`}};
        }
        const kind = stepId === 10 ? 'questionnaire' : stepId === 30 ? 'chat' : 'analysis';
        const currentSession = kind === 'questionnaire' ? state.launch?.latest_entry
            : kind === 'chat' ? state.snapshot : state.options?.session;
        const sessions = kind === 'analysis' && state.options?.attempts?.length ? state.options.attempts : currentSession ? [currentSession] : [];
        const base = `/profilo/piani-operativi/301/${stepId}`;
        const attempts = sessions.map(session => {
            const completed = kind === 'questionnaire' || session.completed || (session.session_id === currentSession?.session_id && state.options?.completed);
            return {session_id: session.session_id, started_at: session.started_at || '2026-10-28T12:00:00Z',
                state: completed ? 'completed' : 'in_progress', resumable: !completed, revision: 0,
                result: session.result, href: `${base}?attempt=${session.session_id}${completed ? '&review=1' : ''}`};
        });
        const current = attempts.find(item => item.session_id === currentSession?.session_id) || attempts[0] || null;
        return {path_id: 301, step_id: stepId, title: 'Attività sintetica', path_title: 'Piano sintetico', position: 1,
            instrument_code: currentSession?.result?.questionnaire_type || state.launch?.instrument_code || (kind === 'chat' ? 'SAVICKAS' : 'QSA'),
            kind, current, attempts, next_href: kind === 'questionnaire' ? '/profilo/piani-operativi/301/20' : null,
            choices: state.options?.personal && !current ? state.options.results : [],
            primary: {label: current ? current.state === 'completed' ? 'review' : 'resume' : 'start', href: current?.href || base},
            repeat: current ? {label: kind === 'questionnaire' ? 'newCompilation' : 'anotherAttempt', href: `${base}?attempt=new`} : null};
    };
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
        if (p === '/api/user/paths') return json(state.studentPaths.map(path => ({...path,
            steps: path.steps.map(step => ({...step, activity: activityFor(step.id)}))})));
        const activityMatch = p.match(/\/steps\/(\d+)\/activity$/);
        if (activityMatch) return json(activityFor(Number(activityMatch[1])));
        const attemptMatch = p.match(/\/steps\/(\d+)\/attempts$/);
        if (attemptMatch) {
            const stepId = Number(attemptMatch[1]), detail = activityFor(stepId);
            let current = detail.attempts.find(item => item.session_id === body.attempt_id);
            if (!current && !body.new_attempt) current = detail.current;
            if (!current) current = {session_id: body.attempt_id, started_at: new Date().toISOString(), state: 'in_progress', resumable: true,
                revision: 0, draft: {}, href: `/profilo/piani-operativi/301/${stepId}?attempt=${body.attempt_id}`};
            state.activities[stepId] = {...detail, current, attempts: [current, ...detail.attempts.filter(item => item.session_id !== current.session_id)]};
            return json(current);
        }
        const draftMatch = p.match(/\/steps\/(\d+)\/attempts\/([^/]+)\/draft$/);
        if (draftMatch) {
            if (state.draftFailure) return json({}, 500);
            const detail = state.activities[Number(draftMatch[1])], attempt = detail.attempts.find(item => item.session_id === draftMatch[2]);
            attempt.draft = {scores: body.scores, answers: body.answers}; attempt.revision += 1;
            return json({revision: attempt.revision});
        }
        if (p.endsWith('/verify-institution')) return json({grant: 'g'.repeat(40), expires_at: '2026-12-31T12:00:00Z', institution: {id: 5, name: 'Istituto sintetico', institution_code: 'SYN'}});
        if (p.endsWith('/guided-entry')) {
            const accepted = {session_id: body.session_id, guided_entry_id: 1, evidence_id: 1,
                accepted_at: new Date().toISOString(), result: {...result(8), session_id: body.session_id, scores: body.scores || result(8).scores}};
            state.launch.latest_entry = accepted;
            const detail = state.activities[10], attempt = detail.attempts.find(item => item.session_id === body.session_id);
            attempt.state = 'completed'; attempt.result = accepted.result;
            return json(accepted);
        }
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
            if (state.startGate) await state.startGate;
            const session = state.autoSession ? structuredClone(state.autoSession) : bound(body?.result_id ?? state.options.session?.result.id ?? 8);
            if (body?.attempt_id) session.session_id = body.attempt_id;
            const previous = state.options.attempts || (state.options.session ? [{...state.options.session, completed: !!state.options.completed}] : []);
            state.options.session = session; state.options.completed = false;
            state.options.attempts = [{...session, completed: false, resumable: true}, ...previous.filter(item => item.session_id !== session.session_id)];
            return json(session);
        }
        if (p.startsWith('/api/session/frozen/')) {
            if (method === 'DELETE') { state.snapshot = null; if (state.options) state.options.completed = true; return json({}); }
            return state.snapshotStatus !== 200 ? json({detail: 'qpcc_legacy_profile'}, state.snapshotStatus)
                : state.snapshot?.session_id === p.split('/').at(-1) ? json(state.snapshot) : json({}, 404);
        }
        if (p.endsWith('/conversation')) return json([{role: 'student', text: 'Riflessione precedente'}, {role: 'counselor', text: 'Risposta precedente conservata'}]);
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
test('the plan starts QPCC directly and offers resume and redo after freezing', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: false, ready: true,
        source_href: '/profilo/piani-operativi/301/10', results: [], session: null, completed: false, attempts: []}});
    state.autoSession = {...bound(8), results_step_id: 10, result: {...result(8), questionnaire_type: 'QPCC',
        scores: Object.fromEntries(['A1','A2','A3','V1','V2','C1','C2','M1','M2','M3'].map(code => [code, 5]))}};
    state.autoPlanState = true;
    let releaseStart;
    state.startGate = new Promise(resolve => { releaseStart = resolve; });
    state.studentPaths = [{id: 301, group_id: 11, group_name: 'Classe sintetica', title: 'Piano sintetico', mode: 'recommended',
        done: 0, total: 1, next_step_id: 20, steps: [{id: 20, path_id: 301, position: 1, step_type: 'guided_results_chat',
            tool_key: '', title: 'Approfondimento QPCC', state: 'not_done', start_href: '/profilo/piani-operativi/301/20/approfondimento'}]}];
    try {
        await page.goto(`${origin}/profilo/piani-operativi`, {waitUntil: 'domcontentloaded'});
        const optionsLoaded = page.waitForResponse(response => response.url().endsWith('/deep-dive') && response.request().method() === 'GET');
        await page.getByTestId('class-path-hero-card').getByRole('link', {name: 'Inizia'}).click();
        await optionsLoaded;
        await page.getByText('Caricamento delle compilazioni…').waitFor();
        assert.equal(await page.getByRole('button', {name: 'Avvia o riprendi l’approfondimento'}).count(), 0);
        releaseStart();
        await page.getByRole('button', {name: 'Congela sessione'}).waitFor();
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 1);
        assert.equal(await page.getByRole('button', {name: 'Avvia o riprendi l’approfondimento'}).count(), 0);
        assert.equal(await page.getByRole('link', {name: 'Reinserisci i dati'}).count(), 0);
        assert.equal(await page.getByRole('button', {name: 'Rifai', exact: true}).count(), 0);
        await page.getByRole('button', {name: 'Congela sessione'}).click();
        const card = page.getByTestId('class-path-hero-card');
        await card.getByRole('link', {name: 'Riprendi'}).waitFor();
        assert.equal(await card.getByRole('link', {name: 'Fai un altro tentativo'}).getAttribute('href'), '/profilo/piani-operativi/301/20?attempt=new&return_to=%2Fprofilo%2Fpiani-operativi%23class-step-20');
        await card.getByRole('link', {name: 'Riprendi'}).click();
        await page.getByRole('button', {name: 'Congela sessione'}).waitFor();
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 1);
        assert.equal(await page.getByRole('link', {name: 'Reinserisci i dati'}).count(), 0);
        assert.deepEqual(state.errors, []);
    } finally {releaseStart?.(); await context.close();}
});

test('a single personal result starts without an extra selection', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: true, ready: true,
        source_href: '/?start=QSA', results: [{id: 8, submitted_at: '2026-09-20T12:00:00Z', locale: 'it'}], session: null}});
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Congela sessione', exact: true}).waitFor();
        assert.equal(await page.getByRole('button', {name: 'Inizia', exact: true}).count(), 0);
        assert.deepEqual(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').map(row => row.body), [{result_id: 8}]);
        assert.equal(await page.getByRole('combobox', {name: 'Scegli la compilazione'}).count(), 0);
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
        await page.getByRole('button', {name: 'Congela sessione', exact: true}).waitFor();
        assert.equal(await page.getByRole('button', {name: 'Inizia', exact: true}).count(), 0);
        assert.deepEqual(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').map(row => row.body), [{result_id: 8}]);
        state.snapshot = {session_id: 'bound-249', questionnaire_type: 'QSA', current_phase: 'qsa-focus', scores: result(8).scores,
            counselor_id: 1, locale: 'it', guided_path: 'complete', messages: [{role: 'assistant', content: 'Riflessione conservata sul risultato otto'}]};
        await page.reload({waitUntil: 'domcontentloaded'});await page.getByText('Riflessione conservata sul risultato otto', {exact: true}).waitFor();
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
        assert.equal(await page.getByRole('button', {name: 'Torna al piano', exact: false}).isVisible(), true);
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

test('redo from the plan starts a distinct attempt and keeps the earlier report available', async () => {
    const first = bound(8);
    const {context, page, state} = await fixture({teacher: false, options: {personal: true, ready: true,
        source_href: '/?start=QSA', results: [], session: first, completed: true,
        attempts: [{...first, completed: true}]}});
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento?attempt=new`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Congela sessione', exact: true}).waitFor();
        await page.getByRole('button', {name: 'Salva ed esci', exact: true}).waitFor();
        assert.equal(await page.getByRole('button', {name: 'Rifai', exact: true}).count(), 0);
        const request = state.requests.find(row => row.p.endsWith('/deep-dive') && row.method === 'POST');
        assert.match(request.body.attempt_id, /^[0-9a-f-]{36}$/i);
        assert.notEqual(request.body.attempt_id, first.session_id);
        assert.equal(request.body.result_id, 8);
        assert.equal(await page.getByText('Tentativi precedenti').count(), 0);
        assert.ok(state.options.attempts.some(item => item.session_id === first.session_id && item.completed));
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

for (const width of [390, 1440]) test(`QPCC resumes the saved phase without redundant data entry at ${width}px`, async () => {
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
        assert.equal(await page.getByRole('link', {name: 'Reinserisci i dati', exact: true}).count(), 0);
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

test('completed questionnaire reopens saved results without launching another chat', async () => {
    const {context, page, state} = await fixture({teacher: false});
    state.launch = {path_id: 301, step_id: 10, administration_plan_id: 5, instrument_code: 'QSA', locale: 'it', delivery_mode: 'external_it',
        external_href: 'https://www.competenzestrategiche.it/QSA/',
        latest_entry: {session_id: 'bound-249', guided_entry_id: 1, evidence_id: 1, accepted_at: '2026-10-21T12:00:00Z', result: result(8)},
        score_factors: ['C1','C2'].map(code => ({code, label_i18n: {it: `Scala ${code}`}})),
        institution: {id: 5, name: 'Istituto sintetico', institution_code: 'SYN', institution_password: null}};
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/10`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('heading', {name: 'Risultati salvati', exact: true}).waitFor();
        await page.getByRole('link', {name: 'Vai all’approfondimento', exact: true}).waitFor();
        assert.equal(await page.locator('input[name="scores.C1"]').count(), 0);
        assert.equal(await page.getByRole('button', {name: 'Riprendi chat', exact: true}).count(), 0);
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream' || row.p.endsWith('/guided-entry')).length, 0);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

test('a standalone plan chat exposes resume beside its new-start action', async () => {
    const {context, page, state} = await fixture({teacher: false});
    state.studentPaths = [{id: 301, group_id: 11, group_name: 'Classe sintetica', title: 'Piano sintetico', mode: 'recommended',
        done: 0, total: 1, next_step_id: 30, steps: [{id: 30, path_id: 301, position: 1, step_type: 'guided_chat',
            tool_key: 'SAVICKAS', title: 'Colloquio', state: 'not_done', start_href: '/?start=SAVICKAS'}]}];
    state.snapshot = {session_id: 'bound-249', path_id: 301, path_step_id: 30, questionnaire_type: 'SAVICKAS', current_phase: 'savickas-role-models',
        messages: [], updated_at: '2026-10-27T12:00:00Z'};
    try {
        await page.goto(`${origin}/profilo/piani-operativi`, {waitUntil: 'domcontentloaded'});
        const card = page.getByTestId('class-path-hero-card');
        await card.getByRole('link', {name: 'Riprendi', exact: true}).waitFor();
        assert.equal(await card.getByRole('link', {name: 'Riprendi', exact: true}).getAttribute('href'), '/profilo/piani-operativi/301/30?attempt=bound-249&return_to=%2Fprofilo%2Fpiani-operativi%23class-step-30');
        assert.equal(await card.getByRole('link', {name: 'Fai un altro tentativo', exact: true}).getAttribute('href'), '/profilo/piani-operativi/301/30?attempt=new&return_to=%2Fprofilo%2Fpiani-operativi%23class-step-30');
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

for (const width of [390, 1440]) test(`questionnaire draft survives reload and save exits to its original step at ${width}px`, async () => {
    const {context, page, state} = await fixture({teacher: false, width});
    state.launch = {path_id: 301, step_id: 10, administration_plan_id: 5, instrument_code: 'QSA', locale: 'it', delivery_mode: 'external_it',
        external_href: 'https://www.competenzestrategiche.it/QSA/', latest_entry: null,
        score_factors: ['C1','C2'].map(code => ({code, label_i18n: {it: `Scala ${code}`}})),
        institution: {id: 5, name: 'Istituto sintetico', institution_code: 'SYN', institution_password: null}};
    state.studentPaths = [{id: 301, group_id: 11, group_name: 'Classe sintetica', title: 'Piano sintetico', done: 0, total: 1,
        next_step_id: 10, steps: [{id: 10, step_type: 'questionnaire_administration', title: 'Questionario', state: 'not_done',
            start_href: '/profilo/piani-operativi/301/10'}]}];
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/10?return_to=%2Fprofilo%2Fpiani-operativi%23class-step-10`, {waitUntil: 'domcontentloaded'});
        await page.locator('input[name="scores.C1"]').fill('5');
        await page.locator('input[name="scores.C2"]').fill('7');
        await page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/draft'));
        const firstId = state.activities[10].current.session_id;
        if (width === 1440) {
            await page.evaluate(sessionId => {
                localStorage.setItem('counselorbot_resume', JSON.stringify({instrument: 'QSA', sessionId, experience: 'standard', counselorId: 1}));
                window.dispatchEvent(new Event('counselorbot-resume-change'));
            }, firstId);
            const trigger = page.locator('header').getByRole('button', {name: 'Riprendi un’attività', exact: true});
            await trigger.click();
            const panel = page.locator('#resume-panel');
            assert.equal(await panel.getByRole('link').count(), 1);
            assert.equal(await panel.getByRole('link').getAttribute('href'), `/profilo/piani-operativi/301/10?attempt=${firstId}`);
            assert.equal(await panel.getByRole('button').count(), 0);
            await trigger.click();
        }
        await page.evaluate(() => sessionStorage.clear());
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.locator('input[name="scores.C1"]').waitFor();
        assert.equal(await page.locator('input[name="scores.C1"]').inputValue(), '5');
        assert.equal(await page.locator('input[name="scores.C2"]').inputValue(), '7');
        assert.equal(state.activities[10].attempts.length, 1);
        assert.equal(state.activities[10].current.session_id, firstId);
        state.draftFailure = true;
        await page.locator('input[name="scores.C1"]').fill('6');
        await page.getByRole('button', {name: 'Salva ed esci', exact: true}).click();
        await page.getByText('Non è stato possibile recuperare o salvare l’attività. Riprova: il tentativo resta conservato.').waitFor();
        assert.equal(new URL(page.url()).pathname, '/profilo/piani-operativi/301/10');
        state.draftFailure = false;
        await page.getByRole('button', {name: 'Salva ed esci', exact: true}).click();
        await page.waitForURL('**/profilo/piani-operativi#class-step-10');
        assert.equal(state.activities[10].current.draft.scores.C1, 6);
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream').length, 0);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

test('an analysis with lost saved state offers retry without starting an empty conversation', async () => {
    const session = bound(8);
    const {context, page, state} = await fixture({teacher: false, options: {personal: false, ready: true,
        source_href: '/profilo/piani-operativi/301/10', results: [], session,
        attempts: [{...session, completed: false, resumable: false, has_turns: true}]}});
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20?attempt=bound-249`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Riprova', exact: true}).waitFor();
        assert.equal(await page.getByRole('log').count(), 0);
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream' || row.method === 'POST' && row.p.endsWith('/deep-dive')).length, 0);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

for (const width of [390, 1440]) test(`completed plan activity can be repeated and reviewed from history at ${width}px`, async () => {
    const first = bound(8);
    const {context, page, state} = await fixture({teacher: false, width, options: {personal: true, ready: true,
        source_href: '/?start=QSA', results: [], session: first, completed: true, attempts: [{...first, completed: true}]}});
    state.studentPaths = [{id: 301, group_id: 11, group_name: 'Classe sintetica', title: 'Piano sintetico', done: 1, total: 1,
        next_step_id: null, steps: [{id: 20, step_type: 'guided_results_chat', tool_key: 'QSA', title: 'Riflessione sui risultati', state: 'done',
            start_href: '/profilo/piani-operativi/301/20'}]}];
    try {
        await page.goto(`${origin}/profilo/piani-operativi`, {waitUntil: 'domcontentloaded'});
        let card = page.getByTestId('class-path-hero-card');
        await card.getByRole('link', {name: 'Rivedi', exact: true}).waitFor();
        await card.getByRole('link', {name: 'Fai un altro tentativo', exact: true}).click();
        await page.getByRole('button', {name: 'Congela sessione', exact: true}).waitFor();
        assert.equal(await page.getByRole('button', {name: 'Inizia', exact: true}).count(), 0);
        const newId = state.options.session.session_id;
        assert.notEqual(newId, first.session_id);
        await page.getByRole('button', {name: 'Salva ed esci', exact: true}).click();
        await page.waitForURL('**/profilo/piani-operativi#class-step-20');
        card = page.getByTestId('class-path-hero-card');
        await card.getByRole('link', {name: 'Riprendi', exact: true}).waitFor();
        await card.getByText('Storico dei tentativi (2)', {exact: true}).click();
        const requestsBeforeReview = state.requests.filter(row => row.p === '/api/chat/stream').length;
        await card.getByRole('link', {name: 'Rivedi', exact: true}).click();
        await page.getByText('Sintesi sintetica del piano', {exact: true}).waitFor();
        await page.getByText('Conversazione svolta', {exact: true}).click();
        await page.getByText('Risposta precedente conservata', {exact: true}).waitFor();
        assert.equal(state.requests.filter(row => row.p === '/api/chat/stream').length, requestsBeforeReview);
        assert.equal(state.options.session.session_id, newId);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({path: new URL(`../../output/playwright/plan-activity-review-${width}.png`, import.meta.url).pathname, fullPage: true});
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

test('result and essential path can be chosen in the plan with no second start page', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: true, ready: true,
        source_href: '/?start=QSA', results: [{id: 7, submitted_at: '2026-10-20T12:00:00Z', locale: 'it'},
            {id: 8, submitted_at: '2026-10-21T12:00:00Z', locale: 'it'}], session: null}});
    state.studentPaths = [{id: 301, group_id: 11, group_name: 'Classe sintetica', title: 'Piano sintetico', done: 0, total: 1,
        next_step_id: 20, steps: [{id: 20, step_type: 'guided_results_chat', tool_key: 'QSA', title: 'Riflessione sui risultati', state: 'not_done',
            start_href: '/profilo/piani-operativi/301/20'}]}];
    try {
        await page.goto(`${origin}/profilo/piani-operativi`, {waitUntil: 'domcontentloaded'});
        const card = page.getByTestId('class-path-hero-card');
        assert.equal(await card.getByRole('link', {name: 'Inizia', exact: true}).getAttribute('aria-disabled'), 'true');
        await card.getByText('Opzioni del percorso', {exact: true}).click();
        await card.getByRole('combobox').first().selectOption('essential');
        await card.getByRole('combobox', {name: 'Scegli la compilazione', exact: true}).selectOption('8');
        await card.getByRole('link', {name: 'Inizia', exact: true}).click();
        await page.getByRole('button', {name: 'Congela sessione', exact: true}).waitFor();
        assert.equal(await page.getByRole('button', {name: 'Inizia', exact: true}).count(), 0);
        assert.equal(await page.getByRole('combobox', {name: 'Scegli la compilazione', exact: true}).count(), 0);
        assert.equal(state.requests.find(row => row.p.endsWith('/deep-dive') && row.method === 'POST').body.result_id, 8);
        await page.getByRole('button', {name: 'Salva ed esci', exact: true}).click();
        await page.waitForURL('**/profilo/piani-operativi#class-step-20');
        assert.equal(state.snapshot.guided_path, 'essential');
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

test('new analysis after a new compilation remains the same attempt after reload', async () => {
    const {context, page, state} = await fixture({teacher: false, options: {personal: false, ready: true,
        source_href: '/profilo/piani-operativi/301/10', results: [], session: null, attempts: []}});
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20?attempt=new`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Congela sessione', exact: true}).waitFor();
        const firstId = state.options.session.session_id;
        assert.equal(new URL(page.url()).searchParams.get('attempt'), firstId);
        await page.getByRole('button', {name: 'Salva ed esci', exact: true}).click();
        await page.goto(`${origin}/profilo/piani-operativi/301/20?attempt=${firstId}`, {waitUntil: 'domcontentloaded'});
        await page.getByRole('button', {name: 'Congela sessione', exact: true}).waitFor();
        assert.equal(state.requests.filter(row => row.p.endsWith('/deep-dive') && row.method === 'POST').length, 1);
        assert.equal(state.options.session.session_id, firstId);
        assert.deepEqual(state.errors, []);
    } finally {await context.close();}
});

for (const lang of ['it','en','es','fr','de','sv']) test(`chat popup shares the concise guide and preserves the draft in ${lang}`, async () => {
    const {context,page,state} = await fixture({teacher:false,width:390,options:{personal:false,ready:true,
        source_href:'/profilo/piani-operativi/301/10',results:[],session:bound(8)}});
    await page.addInitScript(lang => {localStorage.setItem('cb_lang',lang);},lang);
    try {
        await page.goto(`${origin}/profilo/piani-operativi/301/20`);
        const trigger=page.getByRole('button',{name:guidedIntroText(lang,'openGuide'),exact:true});
        await trigger.waitFor();
        const input=page.locator('#guided-composer');await input.fill('Draft');
        await trigger.click();
        const dialog=page.getByTestId('guided-guide');await dialog.waitFor();
        const copy=guideTaskCopy(lang,'chat');
        assert.equal(await dialog.getByRole('heading').innerText(),copy.title);
        assert.equal(await dialog.locator('ol > li').count(),3);
        assert.ok((await dialog.innerText()).split(/\s+/).length<150);
        assert.equal(await dialog.getByRole('link').getAttribute('href'),'/guide?audience=student&task=chat');
        await page.keyboard.press('Escape');
        assert.equal(await dialog.count(),0);
        assert.equal(await input.inputValue(),'Draft');
        assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
        assert.deepEqual(state.errors,[]);
    } finally {await context.close();}
});
