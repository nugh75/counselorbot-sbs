import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.CHAT_PREFS_BASE_URL || 'http://127.0.0.1:3101';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const event = value => `data: ${JSON.stringify(value)}\n\n`;
async function fixture(width, instrument = 'QSA', experience = 'standard') {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const state = { streams: [], freezes: [], workspaces: 0, errors: [], fail: false, snapshot: null };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.addInitScript(({ instrument, experience }) => {
        localStorage.setItem('cb_lang', 'it'); localStorage.setItem('counselorbot_selected_counselor', '1');
        localStorage.setItem('counselorbot_completed_profiles', JSON.stringify([{ questionnaireType: instrument, sessionId: 'prefs', completedAt: '2026-09-21T12:00:00Z', scores: { C1: 7, C2: 2, A1: 8 } }]));
        localStorage.setItem('counselorbot_resume', JSON.stringify({ instrument, experience, sessionId: 'prefs', counselorId: 1 }));
    }, { instrument, experience });
    await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return req.method() === 'GET' ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'prefs', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true, latest_session_id: 'previous' };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, name: 'Counselor', slug: 'fixture', language: ['it'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/user/learner-profile') data = { id: 1, data: { goal: 'Organizzare lo studio' } };
        else if (url.pathname === '/api/session/frozen') data = state.snapshot ? [state.snapshot] : [];
        else if (url.pathname === '/api/session/frozen/prefs') data = state.snapshot;
        else if (url.pathname === '/api/session/freeze') { state.snapshot = req.postDataJSON(); state.freezes.push(state.snapshot); data = state.snapshot; }
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: state.guidedSteps ?? [{ id: 'intro', label: 'Introduzione', sort_order: 0, system_prompt_mode: 'generic' }] };
        else if (url.pathname === '/api/memory/user/prefs') data = {};
        else if (url.pathname === '/api/idea/next-step') data = { step_id: 'idea-statement', focus: null, reason: 'no-map', detail: '', reason_text: '', pivot: '', task_label: null, statuses: {}, flaws: {}, turns_used: 0, budget: 8, pace_stops: [8, 16] };
        else if (url.pathname === '/api/idea/map') data = { spec: null, revision_id: null, missing_roles: [], complete: false, focus: null, owners: {} };
        else if (url.pathname === '/api/idea/reference') return route.fulfill({ status: 404, json: {} });
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (url.pathname === '/api/opencode/workspace') { state.workspaces++; data = { key: 'prefs', session_id: 'oc-prefs', api_available: true, needs_seed: false, history: [{ role: 'assistant', content: 'Benvenuto' }] }; }
        else if (url.pathname === '/api/orientation/sessions') data = { session_id: 'compass-prefs', counselor_id: 1, status: 'in_progress', language: 'it', messages: [{ role: 'assistant', content: 'Cosa vuoi affrontare?' }], recommendations: [] };
        else if (url.pathname.endsWith('/message')) { state.streams.push(req.postDataJSON()); data = { session_id: 'compass-prefs', counselor_id: 1, status: 'in_progress', language: 'it', messages: [{ role: 'assistant', content: '| Tema | Passo |\n| --- | --- |\n| Studio | Prova |' }], recommendations: [] }; }
        else if (['/api/chat/stream', '/api/site-chat/stream', '/api/opencode/workspace/prefs/chat'].includes(url.pathname)) {
            const body = req.postDataJSON(); state.streams.push(body);
            if (state.fail) return route.fulfill({ status: 503, json: {} });
            if (state.script) {
                const { text, done = true, display = text, signals, exploration } = state.script(body);
                return route.fulfill({ contentType: 'text/event-stream', body: event({ conversation_id: 'prefs-conversation' }) + event({ display }) + (done ? event({ done: true, response: text, conversation_id: 'prefs-conversation', control_signals: signals, exploration }) : '') });
            }
            const reply = body.response_format === 'table' ? '| Tema | Passo |\n| --- | --- |\n| Studio | Prova |' : `Risposta ${state.streams.length}: ${body.phase || 'chat'}`;
            return route.fulfill({ contentType: 'text/event-stream', body: event({ conversation_id: 'prefs-conversation' }) + event({ display: reply }) + event({ done: true, response: reply, conversation_id: 'prefs-conversation' }) });
        }
        return route.fulfill({ json: data });
    });
    return { context, page, state };
}
const STEPS = [
    ['obbstudio-intro', 'Presentazione e accordo', 'intro'],
    ['obbstudio-partenza', 'Cosa voglio imparare', 'obiettivo-interview'],
    ['obbstudio-livello', 'Rendiamo preciso', 'obiettivo-interview'],
    ['obbstudio-piano', 'Come ci arrivo', 'obiettivo-interview'],
    ['obbstudio-final', 'Obiettivo finale', 'obiettivo-summary'],
].map(([id, label, system_prompt_mode], sort_order) => ({ id, label, sort_order, system_prompt_mode }));
const branch = { id: 'auto-branch', title: 'Organizzazione', origin_phase: 'obbstudio-partenza' };
const send = async (page, text) => { await page.locator('#guided-composer').fill(text); await page.locator('#guided-composer').press('Enter'); };
async function path(page, width) {
    if (width < 1024) {
        await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
        await page.getByRole('button', { name: 'Percorso', exact: true }).click();
    }
}
async function start(page) {
    await page.goto(`${origin}/?resume=1`);
    await page.getByRole('button', { name: 'Inizia', exact: true }).click();
    await page.getByRole('log').getByText('Apertura obbstudio-intro', { exact: true }).waitFor();
}

for (const width of [390, 1440]) {
    test(`all steps respect agreement and skipping preserves visited conversations at ${width}px`, async () => {
        const { context, page, state } = await fixture(width, 'OBIETTIVO_STUDIO');
        state.guidedSteps = STEPS;
        state.script = body => ({ text: `Apertura ${body.phase}` });
        try {
            await start(page);
            await path(page, width);
            assert.equal(await page.locator('[data-path-phase="obbstudio-piano"]').isDisabled(), true);
            if (width < 1024) await page.keyboard.press('Escape');
            assert.equal(await page.getByRole('button', { name: 'Prossimo Argomento', exact: true }).isDisabled(), true);
            await page.getByRole('button', { name: 'Accetto', exact: true }).click();
            await page.getByRole('log').getByText('Apertura obbstudio-partenza', { exact: true }).waitFor();
            await page.locator('#guided-composer').fill('Bozza del focus');
            await path(page, width);
            await page.locator('[data-path-phase="obbstudio-piano"]').click();
            await page.getByRole('log').getByText('Apertura obbstudio-piano', { exact: true }).waitFor();
            await path(page, width);
            assert.equal(await page.locator('[data-path-phase="obbstudio-livello"]').getByText('Completato').count(), 0);
            await page.locator('[data-path-phase="obbstudio-partenza"]').click();
            assert.equal(await page.locator('#guided-composer').inputValue(), 'Bozza del focus');
            assert.deepEqual(state.streams.map(r => r.phase), ['obbstudio-intro', 'obbstudio-partenza', 'obbstudio-piano']);
            await page.waitForTimeout(1700);
            assert.deepEqual(state.snapshot.guided_navigation.completed, ['obbstudio-intro']);
            assert.equal(state.snapshot.guided_navigation.agreement_accepted, true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(state.errors, []);
        } finally { await context.close(); }
    });

    test(`dedicated branch returns to its checkpoint, reopens and resumes drafts at ${width}px`, async () => {
        const { context, page, state } = await fixture(width, 'OBIETTIVO_STUDIO');
        state.guidedSteps = STEPS;
        state.script = body => {
            if (body.use_phase_prompt) return { text: `Apertura ${body.phase}` };
            if (body.exploration) return { text: 'Dialogo nel ramo', exploration: { ...body.exploration, action: 'stay' }, signals: ['AVANZA_STEP'] };
            return { text: 'Proposta di approfondimento' };
        };
        try {
            await start(page);
            await page.getByRole('button', { name: 'Accetto', exact: true }).click();
            await page.getByRole('log').getByText('Apertura obbstudio-partenza', { exact: true }).waitFor();
            await page.locator('#guided-composer').fill('Bozza originale');
            await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
            await page.getByRole('button', { name: 'Approfondisci un tema', exact: true }).click();
            await page.getByLabel('Tema da approfondire', { exact: true }).fill('Iniziare lo studio');
            await page.getByRole('button', { name: 'Apri approfondimento', exact: true }).click();
            await page.getByRole('region', { name: 'Approfondimento', exact: true }).waitFor();
            assert.equal(await page.getByRole('log').getByText('Apertura obbstudio-partenza', { exact: true }).count(), 0);
            await send(page, 'Vorrei un esempio concreto');
            await page.getByRole('log').getByText('Dialogo nel ramo', { exact: true }).waitFor();
            assert.equal(state.streams.at(-1).exploration.title, 'Iniziare lo studio');
            assert.equal(state.streams.at(-1).phase, 'obbstudio-partenza');
            await page.locator('#guided-composer').fill('Bozza del ramo');
            await page.waitForTimeout(1700);
            const count = state.streams.length;
            await page.goto(`${origin}/?frozen=prefs`);
            await page.getByRole('region', { name: 'Approfondimento', exact: true }).waitFor();
            assert.equal(await page.locator('#guided-composer').inputValue(), 'Bozza del ramo');
            assert.equal(state.streams.length, count);
            await page.getByRole('button', { name: 'Torna al percorso', exact: true }).click();
            assert.equal(await page.locator('#guided-composer').inputValue(), 'Bozza originale');
            assert.equal(await page.getByRole('log').getByText('Dialogo nel ramo', { exact: true }).count(), 0);
            await path(page, width);
            await page.getByRole('button', { name: 'Riapri approfondimento: Iniziare lo studio', exact: true }).click();
            assert.equal(await page.locator('#guided-composer').inputValue(), 'Bozza del ramo');
            await page.getByRole('log').getByText('Dialogo nel ramo', { exact: true }).waitFor();
            await page.screenshot({ path: `/tmp/guided-branch-${width}.png` });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(state.errors, []);
        } finally { await context.close(); }
    });
}

test('only completed counselor signals open and return an automatic branch', async () => {
    const { context, page, state } = await fixture(1440, 'OBIETTIVO_STUDIO');
    state.guidedSteps = STEPS;
    let interrupted = false;
    state.script = body => {
        if (body.use_phase_prompt) return { text: `Apertura ${body.phase}` };
        if (body.exploration) return { text: 'Rientriamo al focus.', exploration: { ...branch, action: 'return' } };
        if (body.memory_message === 'Sì, approfondiamo') return { text: 'Esploriamo come iniziare. [[APRI_APPROFONDIMENTO]]', done: !interrupted, exploration: { ...branch, action: 'open' } };
        return { text: 'Vuoi approfondire?' };
    };
    try {
        await start(page);
        await page.getByRole('button', { name: 'Accetto', exact: true }).click();
        await page.getByRole('log').getByText('Apertura obbstudio-partenza', { exact: true }).waitFor();
        await send(page, 'Vorrei approfondire');
        await page.getByRole('log').getByText('Vuoi approfondire?', { exact: true }).waitFor();
        assert.equal(await page.getByRole('region', { name: 'Approfondimento', exact: true }).count(), 0);
        interrupted = true;
        await send(page, 'Sì, approfondiamo');
        await page.getByRole('button', { name: 'Continua', exact: true }).waitFor();
        assert.equal(await page.getByRole('region', { name: 'Approfondimento', exact: true }).count(), 0);
        interrupted = false;
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        await page.getByRole('region', { name: 'Approfondimento', exact: true }).waitFor();
        assert.equal(await page.getByRole('log').getByText('Vuoi approfondire?', { exact: true }).count(), 0);
        assert.equal(await page.getByText(/APRI_APPROFONDIMENTO/).count(), 0);
        await send(page, 'Torniamo al percorso');
        await page.getByRole('log').getByText('Vuoi approfondire?', { exact: true }).waitFor();
        assert.equal(await page.getByRole('region', { name: 'Approfondimento', exact: true }).count(), 0);
        assert.equal(state.streams.filter(r => r.use_phase_prompt).length, 2);
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('IDEA exploration keeps the original focus and remains reopenable', async () => {
    const { context, page, state } = await fixture(1440, 'IDEA');
    state.guidedSteps = [{ id: 'idea-intro', label: 'Di cosa parliamo', sort_order: 0, system_prompt_mode: 'idea-focus' }, { id: 'idea-statement', label: 'Idea in una frase', sort_order: 1, system_prompt_mode: 'idea-focus' }];
    state.script = body => ({ text: 'Risposta nel ramo Idea', exploration: body.exploration ? { ...body.exploration, action: 'stay' } : undefined });
    try {
        await page.goto(`${origin}/?resume=1`);
        await page.locator('#guided-composer').waitFor();
        await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
        await page.getByRole('button', { name: 'Approfondisci un tema', exact: true }).click();
        await page.getByLabel('Tema da approfondire', { exact: true }).fill('Una possibilità');
        await page.getByRole('button', { name: 'Apri approfondimento', exact: true }).click();
        await send(page, 'Una domanda');
        await page.getByRole('log').getByText('Risposta nel ramo Idea', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Torna al percorso', exact: true }).click();
        await page.getByRole('button', { name: 'Riapri approfondimento: Una possibilità', exact: true }).click();
        await page.getByRole('log').getByText('Risposta nel ramo Idea', { exact: true }).waitFor();
        assert.equal(state.streams.at(-1).phase, state.streams.at(-1).exploration.origin_phase);
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('QSA summary follow-up opens a branch and keeps the visible summary as return point', async () => {
    const { context, page, state } = await fixture(390, 'QSA');
    state.snapshot = { session_id: 'prefs', questionnaire_type: 'QSA', current_phase: 'qsa-essential-summary', guided_path: 'essential', scores: {}, counselor_id: 1, experience: 'standard', locale: 'it', messages: [{ role: 'user', content: 'Il mio focus' }, { role: 'assistant', content: 'Sintesi del percorso. Approfondimento facoltativo.' }] };
    state.script = body => ({ text: 'Approfondiamo il tema.', exploration: body.exploration ? { ...body.exploration, action: 'stay' } : { id: 'summary-branch', title: 'Approfondimento', origin_phase: body.phase, action: 'open' } });
    try {
        await page.goto(`${origin}/?frozen=prefs`);
        await page.locator('#guided-composer').waitFor();
        await send(page, 'Sì, approfondiamo');
        await page.getByRole('region', { name: 'Approfondimento', exact: true }).waitFor();
        await send(page, 'Un esempio');
        await page.getByRole('log').getByText('Un esempio', { exact: true }).waitFor();
        await page.waitForFunction(() => document.querySelector('button') && !document.querySelector('#guided-composer')?.disabled);
        assert.equal(state.streams.at(-1).phase, 'qsa-essential-summary');
        assert.equal(state.streams.at(-1).exploration.origin_phase, 'qsa-essential-summary');
        await page.getByRole('button', { name: 'Torna al percorso', exact: true }).click();
        await page.getByRole('log').getByText('Sintesi del percorso. Approfondimento facoltativo.', { exact: true }).waitFor();
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});
