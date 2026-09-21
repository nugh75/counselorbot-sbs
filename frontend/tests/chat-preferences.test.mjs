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
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 0, system_prompt_mode: 'generic' }] };
        else if (url.pathname === '/api/memory/user/prefs') data = {};
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (url.pathname === '/api/opencode/workspace') { state.workspaces++; data = { key: 'prefs', session_id: 'oc-prefs', api_available: true, needs_seed: false, history: [{ role: 'assistant', content: 'Benvenuto' }] }; }
        else if (url.pathname === '/api/orientation/sessions') data = { session_id: 'compass-prefs', counselor_id: 1, status: 'in_progress', language: 'it', messages: [{ role: 'assistant', content: 'Cosa vuoi affrontare?' }], recommendations: [] };
        else if (url.pathname.endsWith('/message')) { state.streams.push(req.postDataJSON()); data = { session_id: 'compass-prefs', counselor_id: 1, status: 'in_progress', language: 'it', messages: [{ role: 'assistant', content: '| Tema | Passo |\n| --- | --- |\n| Studio | Prova |' }], recommendations: [] }; }
        else if (['/api/chat/stream', '/api/site-chat/stream', '/api/opencode/workspace/prefs/chat'].includes(url.pathname)) {
            const body = req.postDataJSON(); state.streams.push(body);
            if (state.fail) return route.fulfill({ status: 503, json: {} });
            const reply = body.response_format === 'table' ? '| Tema | Passo |\n| --- | --- |\n| Studio | Prova |' : `Risposta ${state.streams.length}: ${body.phase || 'chat'}`;
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
            await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('bullets');
            await page.getByRole('button', { name: 'Inizia', exact: true }).click();
            await page.getByRole('log').getByText('Risposta 1: qsa-essential-focus', { exact: true }).waitFor();
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
            assert.ok(state.streams.every(x => x.guided_path === 'essential' && x.response_format === 'bullets'));
            await page.getByText('Puoi concludere oppure approfondire scrivendo qui.').waitFor();
            await page.waitForTimeout(1700);
            assert.equal(state.snapshot.current_phase, 'qsa-essential-summary');
            assert.equal(state.snapshot.conversation_id, 'prefs-conversation');
            await page.goto(`${origin}/?frozen=prefs`); await page.locator('#guided-composer').waitFor();
            assert.equal(state.streams.length, 4, 'resume does not generate another opening');
            await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
            assert.equal(await page.getByRole('radio', { name: 'Formato: Per punti', exact: true }).getAttribute('aria-checked'), 'true');
            await page.getByRole('radio', { name: 'Formato: Tabella', exact: true }).click(); await page.keyboard.press('Escape');
            await page.locator('#guided-composer').fill('Approfondiamo'); await page.locator('#guided-composer').press('Enter');
            await page.getByRole('table').waitFor();
            assert.equal(state.streams.at(-1).phase, 'qsa-essential-followup');
            assert.equal(state.streams.at(-1).response_format, 'table');
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
        await page.getByRole('radio', { name: 'Formato: Tabella', exact: true }).click(); await page.keyboard.press('Escape');
        await page.locator('#guided-composer').fill('Un confronto'); await page.locator('#guided-composer').press('Enter');
        await page.getByRole('table').waitFor();
        assert.equal(state.streams.at(-1).guided_path, 'complete'); assert.equal(state.streams.at(-1).response_format, 'table');
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
        await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('table');
        await page.locator('form textarea').fill('Metti a confronto'); await page.locator('form textarea').press('Enter');
        await page.getByRole('table').waitFor();
        assert.equal(await page.getByText('Risposta 1: chat', { exact: true }).count(), 1);
        assert.equal(state.workspaces, workspaceRequests, 'a presentation preference must not restart the workspace');
        assert.equal(state.streams.at(-1).response_format, 'table');
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
        await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('table'); await page.keyboard.press('Escape');
        await page.locator('#bussola-composer').fill('Cosa posso fare?'); await page.locator('#bussola-composer').press('Enter');
        await page.getByRole('table').waitFor();
        assert.equal(state.streams[0].response_format, 'table');
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
        await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('table');
        const input = page.locator('main textarea').last();
        await input.fill('Come funziona il QSA?'); await input.press('Enter');
        await page.getByRole('table').waitFor();
        assert.equal(state.streams[0].response_format, 'table');
        assert.deepEqual(state.errors, []);
    } finally { await context.close(); }
});
