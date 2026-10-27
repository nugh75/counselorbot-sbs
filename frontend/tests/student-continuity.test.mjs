import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.STUDENT_CONTINUITY_BASE_URL || 'http://127.0.0.1:3172';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({ teacher = false, width = 390 } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(180000);
    const state = { errors: [], turns: [], freezes: [], failList: false, failPolicy: false, heldFreeze: null,
        snapshot: {
            session_id: 'saved-plan', questionnaire_type: 'QSA', current_phase: 'qsa-focus', locale: 'it',
            scores: { C1: 5, C2: 7 }, counselor_id: 1, response_format: 'standard', response_length: 'long', reasoning_effort: 'deep',
            guided_navigation: { visited: ['qsa-focus'], completed: [], agreement_accepted: true,
                active_exploration_id: null, explorations: [], checkpoints: { 'qsa-focus': {
                    draft: 'Una bozza ancora da inviare', scroll_top: 0, user_messages: 1, advance_suggestion: false,
                } } },
            messages: [{ role: 'assistant', content: 'Domanda già posta nel passo salvato.', phaseId: 'qsa-focus' },
                { role: 'user', content: 'La mia risposta già salvata.', phaseId: 'qsa-focus' },
                { role: 'assistant', content: 'Ultima riflessione già salvata.', phaseId: 'qsa-focus' }],
        } };
    const summary = { session_id: 'saved-plan', questionnaire_type: 'QSA', label: 'QSA — Il mio metodo',
        current_phase: 'qsa-focus', updated_at: '2026-10-27T12:00:00Z',
        resume_href: '/profilo/piani-operativi/301/20/approfondimento?resume=1' };
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); localStorage.setItem('counselorbot_selected_counselor', '1'); });
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), p = url.pathname;
        if (url.origin !== origin) return route.abort();
        if (!p.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({ json: data, status });
        if (p === '/api/auth/me') return json({ authenticated: true, username: 'learner', name: 'Partecipante', groups: teacher ? ['docenti'] : ['studenti'], is_admin: false });
        if (p === '/api/user/account-preferences' || p === '/api/user/account') return json({ setup_completed: true, counselor_id: 1, counselor_ready: true, notebook_ready: true });
        if (p === '/api/orientation/status') return json({ required: false, completed: true });
        if (p === '/api/user/access') return json({ restricted: false, tool_keys: ['QSA', 'actions'], class_ids: [11], counselor_ids: null });
        if (p === '/api/student/class-chat-settings') return state.failPolicy ? json({}, 503) : json({ group_ids: [11],
            response_format: 'bullets', response_length: 'short', response_reasoning: 'off',
            allow_student_response_format: false, allow_student_response_length: false, allow_student_response_reasoning: false });
        if (p === '/api/session/frozen') return state.failList ? json({}, 503) : json([summary]);
        if (p === '/api/session/frozen/saved-plan') return json(state.snapshot);
        if (p === '/api/session/freeze') {
            const body = req.postDataJSON(); state.freezes.push(body);
            if (state.heldFreeze) { const held = state.heldFreeze; state.heldFreeze = null; await held; }
            state.snapshot = body;
            return json(summary);
        }
        if (p.endsWith('/deep-dive')) return json({ personal: false, ready: true, completed: false, source_href: '/profilo/piani-operativi/301/10', results: [],
            session: { path_id: 301, step_id: 20, results_step_id: 10, session_id: 'saved-plan', started_at: '2026-10-27T12:00:00Z',
                result: { id: 1, session_id: 'result', questionnaire_type: 'QSA', scores: { C1: 5, C2: 7 }, locale: 'it' } } });
        if (p === '/api/qsa/guided-ui-texts') return json({ guided_steps: [
            { id: 'qsa-welcome', label: 'Presentazione', sort_order: 0, system_prompt_mode: 'generic' },
            { id: 'qsa-focus', label: 'Il mio metodo', sort_order: 1, system_prompt_mode: 'generic' },
            { id: 'qsa-action', label: 'Un passo avanti', sort_order: 2, system_prompt_mode: 'generic' },
        ] });
        if (p === '/api/chat/stream') {
            state.turns.push(req.postDataJSON());
            return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"display":"Nuova risposta sintetica."}\n\ndata: {"done":true,"response":"Nuova risposta sintetica."}\n\n' });
        }
        if (p === '/api/user/questionnaire-results') return json([{ id: 1, session_id: 'result', questionnaire_type: 'QSA', scores: { C1: 5, C2: 7 }, submitted_at: '2026-10-27T12:00:00Z' }]);
        if (p.endsWith('/result/conversation')) return json([{ role: 'assistant', text: 'Conversazione della compilazione.' }]);
        if (p === '/api/user/timeline') return json({ workspace: { actions: [{ id: 'one', title: 'Azione personale in corso', stage: 'doing' }], cards: [], timeline: { events: [] } }, revision: 1 });
        if (p === '/api/counselors') return json([{ id: 1, name: 'Counselor sintetico', is_active: true, language: ['it'], suitable: true }]);
        if (p === '/api/user/readings') return json(null);
        if (p.endsWith('/recommendations')) return json({ reading: [], strategy: [], advice: [] });
        if (p === '/api/tavolo/enabled') return json({ enabled: false });
        return json([]);
    });
    return { page, context, state };
}

for (const teacher of [false, true]) test(`one student section includes ongoing work, compilations and results (${teacher ? 'teacher learner' : 'student'})`, async () => {
    const f = await fixture({ teacher });
    try {
        await f.page.goto(`${origin}/profilo/compilazioni`, { waitUntil: 'domcontentloaded' });
        const chats = f.page.getByRole('region', { name: 'Conversazioni in corso', exact: true });
        const link = chats.getByRole('link', { name: /Il mio metodo/ });
        await link.waitFor();
        assert.equal(await link.getAttribute('href'), '/profilo/piani-operativi/301/20/approfondimento?resume=1');
        await f.page.getByText('Azione personale in corso', { exact: true }).waitFor();
        await f.page.getByRole('heading', { name: 'Risultato della compilazione', exact: true }).waitFor();
        await f.page.getByText('Conversazione della compilazione.', { exact: true }).waitFor();
        await f.page.screenshot({ path: new URL(`../../output/playwright/student-continuity-${teacher ? 'teacher' : 'student'}.png`, import.meta.url).pathname, fullPage: true });
        await link.click();
        await f.page.getByRole('log').getByText('Ultima riflessione già salvata.', { exact: true }).waitFor();
        assert.equal(await f.page.locator('#guided-composer').inputValue(), 'Una bozza ancora da inviare');
        assert.equal(f.state.turns.length, 0, 'resume must not regenerate an opening');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const width of [390, 1440]) test(`resumed chat applies current locks and preserves a new draft on exit at ${width}px`, async () => {
    const f = await fixture({ width });
    try {
        await f.page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento?resume=1`, { waitUntil: 'domcontentloaded' });
        await f.page.getByRole('log').getByText('Ultima riflessione già salvata.', { exact: true }).waitFor();
        await f.page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
        const format = f.page.getByRole('radiogroup', { name: 'Formato', exact: true });
        await format.waitFor();
        assert.ok(await format.getByRole('radio').first().isDisabled());
        assert.equal(await format.getByRole('radio', { checked: true }).getAttribute('aria-label'), 'Formato: Per punti');
        await f.page.keyboard.press('Escape');
        await f.page.locator('#guided-composer').fill('Bozza più recente da conservare');
        await f.page.getByRole('link', { name: 'Reinserisci i dati', exact: true }).click();
        await f.page.waitForURL('**/profilo/piani-operativi/301/10');
        await f.page.waitForFunction(() => true);
        await assert.doesNotReject(async () => {
            const until = Date.now() + 10000;
            while (!f.state.freezes.some(row => row.guided_navigation?.checkpoints?.['qsa-focus']?.draft === 'Bozza più recente da conservare')) {
                if (Date.now() > until) throw new Error('latest checkpoint was not flushed');
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });
        await f.page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento?resume=1`, { waitUntil: 'domcontentloaded' });
        await f.page.getByRole('log').getByText('Ultima riflessione già salvata.', { exact: true }).waitFor();
        assert.equal(await f.page.locator('#guided-composer').inputValue(), 'Bozza più recente da conservare');
        assert.equal(f.state.turns.length, 0);
    } finally { await f.context.close(); }
});

test('a failed resume list leaves results visible and offers retry', async () => {
    const f = await fixture(); f.state.failList = true;
    try {
        await f.page.goto(`${origin}/profilo/compilazioni`, { waitUntil: 'domcontentloaded' });
        const chats = f.page.getByRole('region', { name: 'Conversazioni in corso', exact: true });
        await chats.getByRole('alert').waitFor();
        await f.page.getByRole('heading', { name: 'Risultato della compilazione', exact: true }).waitFor();
        f.state.failList = false;
        await chats.getByRole('button', { name: 'Riprova', exact: true }).click();
        await chats.getByRole('link', { name: /Il mio metodo/ }).waitFor();
    } finally { await f.context.close(); }
});

test('a slow older save cannot overwrite the draft flushed on navigation', async () => {
    const f = await fixture();
    let release;
    f.state.heldFreeze = new Promise(resolve => { release = resolve; });
    try {
        await f.page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, { waitUntil: 'domcontentloaded' });
        await f.page.getByRole('log').getByText('Ultima riflessione già salvata.', { exact: true }).waitFor();
        const until = Date.now() + 15000;
        while (!f.state.freezes.length) {
            if (Date.now() > until) throw new Error('first autosave did not start');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await f.page.locator('#guided-composer').fill('La bozza più recente');
        await f.page.getByRole('link', { name: 'Reinserisci i dati', exact: true }).click();
        assert.equal(f.state.freezes.length, 1, 'new checkpoint must wait for older write');
        release();
        const deadline = Date.now() + 10000;
        while (f.state.snapshot.guided_navigation?.checkpoints?.['qsa-focus']?.draft !== 'La bozza più recente') {
            if (Date.now() > deadline) throw new Error('latest draft did not persist');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } finally { release(); await f.context.close(); }
});

test('older plan snapshots without phase tags resume without regenerating the opening', async () => {
    const f = await fixture();
    delete f.state.snapshot.guided_navigation;
    f.state.snapshot.messages.forEach(row => { delete row.phaseId; });
    try {
        await f.page.goto(`${origin}/profilo/piani-operativi/301/20/approfondimento`, { waitUntil: 'networkidle' });
        await f.page.getByRole('log').getByText('Ultima riflessione già salvata.', { exact: true }).waitFor();
        assert.equal(f.state.turns.length, 0);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});
