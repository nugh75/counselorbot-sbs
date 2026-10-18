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
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (url.pathname === '/api/opencode/workspace') { state.workspaces++; data = { key: 'prefs', session_id: 'oc-prefs', api_available: true, needs_seed: false, history: [{ role: 'assistant', content: 'Benvenuto' }] }; }
        else if (url.pathname === '/api/orientation/sessions') data = { session_id: 'compass-prefs', counselor_id: 1, status: 'in_progress', language: 'it', messages: [{ role: 'assistant', content: 'Cosa vuoi affrontare?' }], recommendations: [] };
        else if (url.pathname.endsWith('/message')) { state.streams.push(req.postDataJSON()); data = { session_id: 'compass-prefs', counselor_id: 1, status: 'in_progress', language: 'it', messages: [{ role: 'assistant', content: '| Tema | Passo |\n| --- | --- |\n| Studio | Prova |' }], recommendations: [] }; }
        else if (['/api/chat/stream', '/api/site-chat/stream', '/api/opencode/workspace/prefs/chat'].includes(url.pathname)) {
            const body = req.postDataJSON(); state.streams.push(body);
            if (state.fail) return route.fulfill({ status: 503, json: {} });
            if (state.script) {
                const { text, done = true, display = text, signals } = state.script(body);
                return route.fulfill({ contentType: 'text/event-stream', body: event({ conversation_id: 'prefs-conversation' }) + event({ display }) + (done ? event({ done: true, response: text, conversation_id: 'prefs-conversation', control_signals: signals }) : '') });
            }
            const reply = `Risposta ${state.streams.length}: ${body.phase || 'chat'}`;
            return route.fulfill({ contentType: 'text/event-stream', body: event({ conversation_id: 'prefs-conversation' }) + event({ display: reply }) + event({ done: true, response: reply, conversation_id: 'prefs-conversation' }) });
        }
        return route.fulfill({ json: data });
    });
    return { context, page, state };
}
for (const width of [390, 1440]) {
    test(`QSA essential reaches summary after three replies and resumes at ${width}px`, async () => {
        const { context, page, state } = await fixture(width);
        try {
            await page.goto(`${origin}/?resume=1`);
            await page.getByRole('radio', { name: /Percorso essenziale/ }).check();
            await page.getByRole('button', { name: 'Inizia', exact: true }).click();
            await page.getByRole('log').getByText('Risposta 1: qsa-essential-focus', { exact: true }).waitFor();
            // Resume bypasses the shared settings page; choose format in the conversation options.
            await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
            await page.getByRole('radio', { name: 'Formato: Per punti', exact: true }).click();
            await page.keyboard.press('Escape');
            for (const [index, reply] of ['Organizzazione', 'Rimando il primo esercizio', 'Scelgo dieci minuti'].entries()) {
                await page.locator('#guided-composer').fill(reply); await page.locator('#guided-composer').press('Enter');
                await page.getByRole('log').getByText(`Risposta ${index + 2}: qsa-essential-${['experience','action','summary'][index]}`, { exact: true }).waitFor();
                if (index === 1) {
                    await page.waitForTimeout(1700);
                    await page.goto(`${origin}/?resume=1`); await page.locator('#guided-composer').waitFor();
                    assert.equal(state.streams.length, 3, 'local resume restores the action step without reopening it');
                }
            }
            assert.deepEqual(state.streams.map(x => x.phase), ['qsa-essential-focus', 'qsa-essential-experience', 'qsa-essential-action', 'qsa-essential-summary']);
            assert.ok(state.streams.every(x => x.guided_path === 'essential'));
            assert.equal(state.streams[0].response_format, 'standard');
            assert.ok(state.streams.slice(1).every(x => x.response_format === 'bullets'));
            await page.getByText('Puoi concludere oppure approfondire scrivendo qui.').waitFor();
            await page.waitForTimeout(1700);
            assert.equal(state.snapshot.current_phase, 'qsa-essential-summary');
            assert.equal(state.snapshot.conversation_id, 'prefs-conversation');
            await page.goto(`${origin}/?frozen=prefs`); await page.locator('#guided-composer').waitFor();
            assert.equal(state.streams.length, 4, 'resume does not generate another opening');
            await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
            assert.equal(await page.getByRole('radio', { name: 'Formato: Per punti', exact: true }).getAttribute('aria-checked'), 'true');
            // The selector offers only Discorsivo and Per punti since 9c5230fb.
            await page.getByRole('radio', { name: 'Formato: Discorsivo', exact: true }).click(); await page.keyboard.press('Escape');
            await page.locator('#guided-composer').fill('Approfondiamo'); await page.locator('#guided-composer').press('Enter');
            await page.getByRole('log').getByText('Risposta 5: qsa-essential-followup', { exact: true }).waitFor();
            assert.equal(state.streams.at(-1).phase, 'qsa-essential-followup');
            assert.equal(state.streams.at(-1).response_format, 'standard');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(state.errors, []);
        } finally { await context.close(); }
    });
}
test('QSAr keeps its original path and receives the format choice', async () => {
    const { context, page, state } = await fixture(390, 'QSAr');
    try {
        await page.goto(`${origin}/?resume=1`); await page.locator('#guided-composer').waitFor();
        assert.equal(await page.getByRole('radio', { name: /Percorso essenziale/ }).count(), 0);
        await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
        await page.getByRole('radio', { name: 'Formato: Per punti', exact: true }).click(); await page.keyboard.press('Escape');
        const replies = page.getByRole('log').getByText(/^Risposta \d+: /);
        const before = await replies.count();
        await page.locator('#guided-composer').fill('Un confronto'); await page.locator('#guided-composer').press('Enter');
        await replies.nth(before).waitFor();
        assert.equal(state.streams.at(-1).guided_path, 'complete'); assert.equal(state.streams.at(-1).response_format, 'bullets');
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});
test('OpenCode sends the chosen format', async () => {
    const { context, page, state } = await fixture(390, 'QSA', 'opencode');
    try {
        await page.goto(`${origin}/?resume=1`);
        await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('bullets');
        await page.locator('form textarea').fill('Aiutami a riflettere'); await page.locator('form textarea').press('Enter');
        await page.getByText('Risposta 1: chat', { exact: true }).waitFor();
        assert.equal(state.streams[0].response_format, 'bullets');
        const workspaceRequests = state.workspaces;
        await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('standard');
        await page.locator('form textarea').fill('Metti a confronto'); await page.locator('form textarea').press('Enter');
        await page.getByText('Risposta 2: chat', { exact: true }).waitFor();
        assert.equal(await page.getByText('Risposta 1: chat', { exact: true }).count(), 1);
        assert.equal(state.workspaces, workspaceRequests, 'a presentation preference must not restart the workspace');
        assert.equal(state.streams.at(-1).response_format, 'standard');
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('a failed essential turn keeps its phase and a retry can continue', async () => {
    const { context, page, state } = await fixture(390);
    try {
        await page.goto(`${origin}/?resume=1`);
        await page.getByRole('radio', { name: /Percorso essenziale/ }).check();
        await page.getByRole('button', { name: 'Inizia', exact: true }).click();
        await page.getByRole('log').getByText('Risposta 1: qsa-essential-focus', { exact: true }).waitFor();
        state.fail = true;
        await page.locator('#guided-composer').fill('Organizzazione'); await page.locator('#guided-composer').press('Enter');
        await page.waitForTimeout(1700);
        assert.equal(state.snapshot.current_phase, 'qsa-essential-focus');
        state.fail = false;
        await page.locator('#guided-composer').fill('Confermo organizzazione'); await page.locator('#guided-composer').press('Enter');
        await page.getByRole('log').getByText('Risposta 3: qsa-essential-experience', { exact: true }).waitFor();
        assert.deepEqual(state.streams.map(x => x.phase), ['qsa-essential-focus','qsa-essential-experience','qsa-essential-experience']);
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('complete QSA retains its configured steps', async () => {
    const { context, page, state } = await fixture(390);
    try {
        await page.goto(`${origin}/?resume=1`);
        assert.equal(await page.getByRole('radio', { name: /Percorso completo/ }).isChecked(), true);
        await page.getByRole('button', { name: 'Inizia', exact: true }).click();
        await page.getByRole('log').getByText('Risposta 1: intro', { exact: true }).waitFor();
        assert.equal(state.streams[0].guided_path, 'complete');
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('Compass sends the preference and renders a table on mobile', async () => {
    const { context, page, state } = await fixture(390);
    try {
        await page.goto(`${origin}/bussola`);
        await page.getByRole('button', { name: 'Inizia un nuovo orientamento', exact: true }).click();
        await page.locator('#bussola-composer').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Il tuo taccuino', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Libretto dello studente', exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
        await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('bullets'); await page.keyboard.press('Escape');
        await page.locator('#bussola-composer').fill('Cosa posso fare?'); await page.locator('#bussola-composer').press('Enter');
        // The fixture reply is a Markdown table: it must render without horizontal overflow.
        await page.getByRole('table').waitFor();
        assert.equal(state.streams[0].response_format, 'bullets');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('Assistant uses the selected format for subsequent replies', async () => {
    const { context, page, state } = await fixture(390);
    try {
        await page.goto(`${origin}/assistente`);
        assert.equal(await page.getByRole('button', { name: 'Il tuo taccuino', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Libretto dello studente', exact: true }).count(), 0);
        await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('bullets');
        const input = page.locator('main textarea').last();
        await input.fill('Come funziona il QSA?'); await input.press('Enter');
        await page.getByRole('log').getByText('Risposta 1: chat', { exact: true }).waitFor();
        assert.equal(state.streams[0].response_format, 'bullets');
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('Obiettivo essential keeps a stage open until the marker closes it, never on an interrupted stream', async () => {
    const { context, page, state } = await fixture(390, 'OBIETTIVO_STUDIO');
    const phases = { focus: 'obbstudio-essential-focus', define: 'obbstudio-essential-smart', plan: 'obbstudio-essential-plan', summary: 'obbstudio-essential-summary' };
    // Synthetic replies: the fixture decides where the model would put the marker.
    let interrupted = false;
    state.script = body => {
        const message = body.memory_message ?? '';
        if (body.partial_response !== undefined) return { text: `${body.partial_response} fine. [[AVANZA_STEP]]`, done: !interrupted };
        if (message === 'Con una scheda guida') return { text: 'Obiettivo: con una scheda guida descrivo l’andamento.', done: false };
        if (message === 'Scelgo i grafici') return { text: 'Bozza: descrivo l’andamento di un grafico. [[AVANZA_STEP]]' };
        if (body.phase === phases.summary) return { text: 'Sintesi: un solo obiettivo, la prova scelta.' };
        return { text: `Turno ${state.streams.length}: ${body.phase}` };
    };
    try {
        await page.goto(`${origin}/?resume=1`);
        await page.getByRole('radio', { name: /Percorso essenziale/ }).check();
        await page.getByText(/3 fasi brevi \(focus, obiettivo, piano\)/).waitFor();
        await page.getByRole('button', { name: 'Inizia', exact: true }).click();
        await page.getByRole('log').getByText(`Turno 1: ${phases.focus}`, { exact: true }).waitFor();
        const send = async text => { await page.locator('#guided-composer').fill(text); await page.locator('#guided-composer').press('Enter'); };

        // Several wishes, no marker: the stage stays open and the next reply is still focus.
        await send('Vorrei imparare grafici, collaborazione e relazione');
        await page.getByRole('log').getByText(`Turno 2: ${phases.focus}`, { exact: true }).waitFor();
        await send('Scelgo i grafici');
        await page.getByRole('log').getByText(`Turno 4: ${phases.define}`, { exact: true }).waitFor();
        assert.equal(await page.getByRole('log').getByText('[[AVANZA_STEP]]').count(), 0, 'the marker is never shown');

        // Interrupted stream with the marker: no advance while the reply is incomplete.
        interrupted = true;
        await send('Con una scheda guida');
        await page.getByRole('button', { name: 'Continua', exact: true }).waitFor({ timeout: 10000 });
        assert.ok(state.streams.every(x => x.phase !== phases.plan), 'no plan before the reply completes');
        interrupted = false;
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        const planOpening = state.streams.length + 1;
        await page.getByRole('log').getByText(`Turno ${planOpening}: ${phases.plan}`, { exact: true }).waitFor();

        // The person chooses to move on with points still open: the summary is generated.
        await send('Inizio domani');
        await page.getByRole('log').getByText(`Turno ${planOpening + 1}: ${phases.plan}`, { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Passa al prossimo tema', exact: true }).click();
        await page.getByRole('log').getByText('Sintesi: un solo obiettivo, la prova scelta.', { exact: true }).waitFor();
        await page.getByText('Puoi concludere oppure approfondire scrivendo qui.').waitFor();

        const replies = state.streams.filter(x => x.memory_message);
        assert.deepEqual(replies.map(x => [x.memory_message, x.phase]).filter(([m]) => !m.startsWith('Con una')), [
            ['Vorrei imparare grafici, collaborazione e relazione', phases.focus],
            ['Scelgo i grafici', phases.focus],
            ['Inizio domani', phases.plan],
        ]);
        assert.ok(state.streams.filter(x => x.memory_message === 'Con una scheda guida').every(x => x.phase === phases.define));
        const openings = state.streams.filter(x => x.use_phase_prompt).map(x => x.phase);
        assert.deepEqual(openings, [phases.focus, phases.define, phases.plan, phases.summary]);
        assert.ok(state.streams.every(x => x.guided_path === 'essential'));
        await page.waitForTimeout(1700);
        assert.equal(state.snapshot.current_phase, phases.summary);
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

// Percorso completo Obiettivo: passaggio iniziale con l'accordo e cinque fasi d'azione.
const GOAL_STEPS = [
    ['obbstudio-intro', 'Presentazione e accordo', 'intro'],
    ['obbstudio-partenza', 'Cosa voglio imparare', 'obiettivo-interview'],
    ['obbstudio-livello', "Rendiamo l'obiettivo preciso", 'obiettivo-interview'],
    ['obbstudio-piano', 'Come ci arrivo', 'obiettivo-interview'],
    ['obbstudio-verifica', 'Come capirò di avercela fatta', 'obiettivo-interview'],
    ['obbstudio-final', "L'obiettivo finale", 'obiettivo-summary'],
].map(([id, label, system_prompt_mode], sort_order) => ({ id, label, sort_order, system_prompt_mode }));

test('Obiettivo complete path moves on by itself on the signal and ends on the final objective', async () => {
    const { context, page, state } = await fixture(1440, 'OBIETTIVO_STUDIO');
    state.guidedSteps = GOAL_STEPS;
    const advance = ['AVANZA_STEP'];
    state.script = body => {
        const message = body.memory_message ?? '';
        if (body.use_phase_prompt && body.phase === 'obbstudio-livello') return { text: 'È già preciso.', display: 'È già preciso. [[AVANZA_', signals: advance };
        if (body.use_phase_prompt) return { text: `Apertura: ${body.phase}` };
        if (message === 'Voglio leggere i grafici') return { text: 'Bozza fissata.', signals: advance };
        if (message === 'Esercizi a casa') return { text: 'Primi passi concordati. [[AVANZA_STEP]]' };
        if (message === 'Una prova scritta') return { text: 'Prova concordata.', signals: advance };
        return { text: `Risposta: ${body.phase}` };
    };
    try {
        await page.goto(`${origin}/?resume=1`);
        await page.getByRole('button', { name: 'Inizia', exact: true }).click();
        await page.getByRole('log').getByText('Apertura: obbstudio-intro', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Accetto', exact: true }).click();
        await page.getByRole('log').getByText('Apertura: obbstudio-partenza', { exact: true }).waitFor();
        const send = async text => { await page.locator('#guided-composer').fill(text); await page.locator('#guided-composer').press('Enter'); };
        await send('Voglio leggere i grafici');
        // «Rendiamo l'obiettivo preciso» trova l'obiettivo già preciso e passa oltre.
        await page.getByRole('log').getByText('Apertura: obbstudio-piano', { exact: true }).waitFor();
        await send('Esercizi a casa');
        await page.getByRole('log').getByText('Apertura: obbstudio-verifica', { exact: true }).waitFor();
        await send('Una prova scritta');
        await page.getByRole('log').getByText('Apertura: obbstudio-final', { exact: true }).waitFor();
        await page.getByText('Puoi concludere oppure approfondire scrivendo qui.').waitFor();
        await page.getByRole('button', { name: 'Concludi', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Passa al prossimo tema', exact: true }).count(), 0);
        assert.equal(await page.getByText('Domande e Approfondimenti').count(), 0);
        assert.equal(await page.getByText(/AVANZA/).count(), 0, 'the signal is never shown');
        const openings = state.streams.filter(x => x.use_phase_prompt).map(x => x.phase);
        assert.deepEqual(openings, GOAL_STEPS.map(step => step.id));
        // Nessuna conferma chiesta: ogni fase si è chiusa sulla sola risposta della persona.
        assert.deepEqual(state.streams.filter(x => x.memory_message).map(x => x.memory_message),
            ['Voglio leggere i grafici', 'Esercizi a casa', 'Una prova scritta']);
        await page.waitForTimeout(1700);
        assert.equal(state.snapshot.current_phase, 'obbstudio-final');
        assert.ok(state.snapshot.messages.every(m => !/AVANZA/.test(m.content)));
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});

test('Obiettivo snapshot frozen on a retired phase resumes in the phase that absorbed it', async () => {
    const { context, page, state } = await fixture(1440, 'OBIETTIVO_STUDIO');
    state.guidedSteps = GOAL_STEPS;
    state.snapshot = {
        session_id: 'prefs', questionnaire_type: 'OBIETTIVO_STUDIO', current_phase: 'obbstudio-smart', scores: {},
        counselor_id: 1, experience: 'standard', locale: 'it', guided_path: 'complete', response_format: 'standard',
        messages: [
            { role: 'assistant', content: 'Benvenuto.' },
            { role: 'system', content: '--- Alla prova SMART ---' },
            { role: 'assistant', content: 'Manca il criterio. [[AVANZA_STEP]]' },
            { role: 'assistant', content: '[[AVANZA_STEP]]' },
        ],
    };
    try {
        await page.goto(`${origin}/?resume=1`);
        await page.getByRole('log').getByText('Manca il criterio.', { exact: true }).waitFor();
        await page.getByRole('navigation', { name: 'Avanzamento del percorso' }).getByText("Rendiamo l'obiettivo preciso").waitFor();
        await page.waitForTimeout(500);
        assert.equal(state.streams.length, 0, 'the resumed phase is not opened again');
        assert.equal(await page.getByText(/AVANZA/).count(), 0, 'old snapshots never show the signal');
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});
