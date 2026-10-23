import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chromium } from 'playwright';

// Synthetic fixtures only: block external traffic and intercept every API request.
const origin = new URL(process.env.QSA_PROMPTING_BASE_URL || 'http://127.0.0.1:3157').origin;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
after(() => browser.close());
const steps = ['intro', 'cognitive', 'affective', 'sl-elaboration', 'sl-selfcontrol', 'sl-motivation', 'sl-emotions', 'sl-attribution', 'sl-social', 'sl-synthesis'].map((id, sort_order) => ({
    id, sort_order, label: `QSA fixture ${id}`, system_prompt_mode: sort_order === 0 ? 'intro' : sort_order < 3 ? 'factor' : 'second-level',
}));

async function fixture(width, panelOpen = true, failure = null) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(120000);
    const errors = [], streams = [];
    let loadRequests = 0;
    let loadRecovered = !failure;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(panelOpen => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('counselorbot_selected_counselor', '1');
        localStorage.setItem('cb_chat_panel', JSON.stringify({ open: panelOpen, width: 300 }));
    }, panelOpen);
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'qsa-fixture', name: 'Synthetic fixture', is_admin: false, groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false };
        else if (url.pathname === '/api/user/access') data = { restricted: false, tool_keys: ['QSA'], counselor_ids: [1], default_counselor_id: 1, class_ids: [] };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor fixture', language: ['*'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/user/learner-profile') data = { profile: {} };
        else if (url.pathname === '/api/user/readings') data = null;
        else if (url.pathname === '/api/user/cross-synthesis/availability') data = { available: false, min_instruments: 2, instruments: [] };
        else if (url.pathname === '/api/session/frozen/qsa-fixture') data = {
            session_id: 'qsa-fixture', questionnaire_type: 'QSA', current_phase: 'cognitive', experience: 'standard', counselor_id: 1,
            scores: { C1: 7, A1: 3 }, messages: [{ role: 'system', content: '--- QSA fixture cognitive ---' }, { role: 'user', content: 'Synthetic question' }, { role: 'assistant', content: 'Synthetic answer' }],
        };
        else if (url.pathname === '/api/qsa/guided-ui-texts') {
            loadRequests += 1;
            if (!loadRecovered) {
                if (failure === 'network') return route.abort('failed');
                if (failure === 'json') return route.fulfill({ contentType: 'application/json', body: '{invalid' });
                return route.fulfill({ status: 503, json: { detail: 'Synthetic unavailable service' } });
            }
            data = { guided_steps: steps, fixed_phase_questions: [] };
        }
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (url.pathname === '/api/chat/stream') {
            const body = request.postDataJSON(); streams.push(body);
            const reply = `Synthetic ${body.phase}`;
            return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ display: reply })}\n\ndata: ${JSON.stringify({ done: true, response: reply })}\n\n` });
        }
        return route.fulfill({ json: data });
    });
    try {
        await page.goto(`${origin}/?frozen=qsa-fixture`);
        if (!failure) await page.getByRole('log').getByText('Synthetic answer', { exact: true }).waitFor();
    } catch (error) {
        await context.close();
        throw new Error(`Synthetic QSA fixture failed; page errors: ${JSON.stringify(errors)}`, { cause: error });
    }
    return { page, context, errors, streams, loadRequests: () => loadRequests, recoverLoad: () => { loadRecovered = true; } };
}

for (const width of [390, 1440]) {
    test(`QSA retains all ten configured steps and advances after resume at ${width}px`, async () => {
        const f = await fixture(width);
        try {
            if (width < 1024) {
                await f.page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
                await f.page.getByRole('button', { name: 'Percorso', exact: true }).click();
            }
            const panel = f.page.locator('#guided-path-panel');
            await panel.waitFor({ state: 'visible' });
            for (const step of steps) await panel.getByText(step.label, { exact: true }).waitFor();
            assert.equal(await panel.locator('[aria-current="step"]').innerText(), '2\nQSA fixture cognitive');
            if (process.env.QSA_PROMPTING_SCREENSHOT_DIR) await f.page.screenshot({ path: `${process.env.QSA_PROMPTING_SCREENSHOT_DIR}/qsa-steps-${width}.png`, fullPage: true });
            if (width < 1024) await f.page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
            await f.page.getByRole('button', { name: 'Prossimo Step', exact: true }).first().click();
            await f.page.getByRole('log').getByText('Synthetic affective', { exact: true }).waitFor();
            assert.equal(f.streams.at(-1).phase, 'affective');
            assert.equal(f.streams.at(-1).questionnaire_type, 'QSA');
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

test('QSA saved collapsed panel can be reopened without losing steps', async () => {
    const f = await fixture(1440, false);
    try {
        assert.equal(await f.page.locator('#guided-path-panel').isVisible(), false);
        await f.page.getByRole('button', { name: 'Mostra pannello', exact: true }).click();
        await f.page.locator('#guided-path-panel').waitFor({ state: 'visible' });
        for (const step of steps) await f.page.locator('#guided-path-panel').getByText(step.label, { exact: true }).waitFor();
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

for (const failure of ['http', 'network', 'json']) {
    test(`failed QSA step load (${failure}) is recoverable without skipping to final questions`, async () => {
        const f = await fixture(1440, true, failure);
        try {
            const alert = f.page.getByRole('alert').filter({ hasText: 'Non riesco a caricare il percorso. Riprova.' });
            try { await alert.waitFor({ timeout: 30000 }); } catch {
                if (process.env.QSA_PROMPTING_SCREENSHOT_DIR) await f.page.screenshot({ path: `${process.env.QSA_PROMPTING_SCREENSHOT_DIR}/qsa-load-failure.png`, fullPage: true });
                assert.fail(`No recoverable load error: load requests=${f.loadRequests()}; phases=${f.streams.map(row => row.phase).join(',')}; alerts=${JSON.stringify(await f.page.getByRole('alert').allTextContents())}; page errors=${JSON.stringify(f.errors)}`);
            }
            assert.deepEqual(f.streams, [], 'a failed path load must not start a questions-phase AI turn');
            const initialRequests = f.loadRequests();
            f.recoverLoad();
            await alert.getByRole('button', { name: 'Riprova', exact: true }).click();
            await f.page.getByRole('log').getByText('Synthetic answer', { exact: true }).waitFor();
            for (const step of steps) await f.page.locator('#guided-path-panel').getByText(step.label, { exact: true }).waitFor();
            assert.equal(f.loadRequests(), initialRequests + 1);
            assert.equal(await f.page.locator('#guided-path-panel [aria-current="step"]').innerText(), '2\nQSA fixture cognitive');
            assert.deepEqual(f.streams, [], 'retry restores the frozen phase and transcript without generating a new answer');
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}
