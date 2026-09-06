import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.RECOVERY_BASE_URL || 'http://127.0.0.1:3101';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const event = data => `data: ${JSON.stringify(data)}\n\n`;

async function fixture(width = 390, { initialError = false, experience = 'standard' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const control = { frozenError: initialError, streams: [], details: [], errors: [] };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('counselorbot_selected_counselor', '1');
    });
    const snapshot = { session_id: 'recovery', questionnaire_type: 'QSA', current_phase: 'intro', counselor_id: 1, experience,
        scores: { C1: 7 }, messages: [{ role: 'system', content: '--- Introduzione ---' }, { role: 'user', content: 'Vorrei organizzarmi.' }, { role: 'assistant', content: 'Parliamo del tuo studio.' }] };
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'recovery-test', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/orientation/status') data = { required: false };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/user/cross-synthesis/availability') data = { available: false, min_instruments: 2, instruments: [] };
        else if (url.pathname === '/api/user/learner-profile') data = { profile: {} };
        else if (url.pathname === '/api/session/frozen') {
            if (control.frozenError) return route.fulfill({ status: 503, body: '{}' });
            data = [{ ...snapshot, label: 'Sessione da ritrovare' }];
        }
        else if (url.pathname === '/api/session/frozen/recovery') data = snapshot;
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro' }] };
        else if (url.pathname === '/api/user/questionnaire-results') data = [{ session_id: 'recovery', questionnaire_type: 'QSA', scores: { C1: 7 }, submitted_at: '2026-09-01T10:00:00Z' }];
        else if (/\/questionnaire-result\/recovery\/(conversation|summary)$/.test(url.pathname)) {
            control.details.push(url.pathname);
            data = url.pathname.endsWith('/summary') ? { summary: 'Sintesi disponibile.' } : [{ role: 'counselor', text: 'Conversazione disponibile.' }];
        }
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (url.pathname === '/api/opencode/workspace') data = { key: 'recovery', api_available: true, session_id: 'opencode-test', needs_seed: false, history: snapshot.messages.filter(message => message.role !== 'system') };
        else if (['/api/chat/stream', '/api/site-chat/stream', '/api/opencode/workspace/recovery/chat'].includes(url.pathname)) {
            control.streams.push(request.postDataJSON());
            if (control.streams.length === 2) return route.fulfill({ status: 503, body: '{}' });
            const body = control.streams.length === 1
                ? event({ session_id: url.pathname.includes('/opencode/') ? 'opencode-test' : 'recovery', conversation_id: 'turn-session' }) + event({ display: 'Studia e' })
                : event({ display: 'Studia e verifica.' }) + event({ done: true, response: 'Studia e verifica.', response_id: 'final-response' });
            return route.fulfill({ contentType: 'text/event-stream', body });
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    return { page, context, control };
}

for (const width of [390, 1440]) {
    test(`guided partial response survives two failures and continues once at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        try {
            await page.goto(`${origin}/?frozen=recovery`, { waitUntil: 'networkidle' });
            await page.locator('#guided-composer').fill('Come posso studiare?');
            await page.locator('#guided-composer').press('Enter');
            const button = page.getByRole('button', { name: 'Continua', exact: true });
            await button.waitFor();
            assert.equal(await page.getByText('Studia e', { exact: true }).count(), 1);
            await Promise.all([
                page.waitForResponse(response => response.url().endsWith('/api/chat/stream') && response.status() === 503),
                button.click(),
            ]);
            await button.waitFor();
            await button.click();
            await page.getByRole('log').getByText('Studia e verifica.', { exact: true }).waitFor();
            await button.waitFor({ state: 'hidden' });
            assert.equal(control.streams.length, 3);
            assert.equal(control.streams[2].partial_response, 'Studia e');
            assert.equal(control.streams[2].message, control.streams[0].message);
            assert.equal(control.streams[2].conversation_id, 'turn-session');
            assert.equal(await page.getByText('Come posso studiare?', { exact: true }).count(), 1);
            assert.equal(await page.getByRole('log').getByText('Studia e verifica.', { exact: true }).count(), 1);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

for (const initialError of [false, true]) {
    test(`resume error remains retryable and preserves prior sessions (initialError=${initialError})`, async () => {
        const { page, context, control } = await fixture(1440, { initialError });
        try {
            await page.goto(`${origin}/profilo/taccuino`, { waitUntil: 'networkidle' });
            if (!initialError) {
                control.frozenError = true;
                await page.evaluate(() => dispatchEvent(new Event('frozen-sessions-change')));
            }
            await page.getByRole('button', { name: 'Riprendi una sessione', exact: true }).click();
            await page.getByText('Impossibile aggiornare le sessioni da riprendere.').waitFor();
            if (!initialError) assert.equal(await page.getByRole('menuitem', { name: 'Sessione da ritrovare' }).count(), 1);
            control.frozenError = false;
            await page.getByRole('button', { name: 'Riprova', exact: true }).click();
            await page.getByRole('button', { name: 'Riprova', exact: true }).waitFor({ state: 'hidden' });
            assert.equal(await page.getByRole('menuitem', { name: 'Sessione da ritrovare' }).count(), 1);
            assert.deepEqual(control.details, []);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('personal pages fetch conversation and summary only in compilations', async () => {
    const { page, context, control } = await fixture();
    try {
        await page.goto(`${origin}/profilo/taccuino`, { waitUntil: 'networkidle' });
        assert.deepEqual(control.details, []);
        await page.goto(`${origin}/profilo/compilazioni`, { waitUntil: 'networkidle' });
        assert.equal(control.details.filter(path => path.endsWith('/conversation')).length, 1);
        assert.equal(control.details.filter(path => path.endsWith('/summary')).length, 1);
        assert.deepEqual(control.errors, []);
        assert.ok((await page.locator('body').innerText()).includes('Conversazione disponibile.'), (await page.locator('body').innerText()).slice(-4500));
    } finally { await context.close(); }
});

for (const surface of ['site', 'opencode']) {
    test(`${surface} chat preserves the partial answer across retry failure`, async () => {
        const { page, context, control } = await fixture(390, { experience: surface === 'opencode' ? 'opencode' : 'standard' });
        try {
            await page.goto(`${origin}${surface === 'site' ? '/assistente' : '/?frozen=recovery'}`, { waitUntil: 'networkidle' });
            const input = surface === 'site' ? page.locator('textarea').first() : page.locator('#opencode-composer');
            await input.fill('Come posso studiare?');
            await input.press('Enter');
            const button = page.getByRole('button', { name: 'Continua', exact: true });
            await button.waitFor();
            await Promise.all([page.waitForResponse(response => response.status() === 503), button.click()]);
            await button.waitFor();
            await button.click();
            await button.waitFor({ state: 'hidden' });
            assert.equal(control.streams.length, 3);
            assert.equal(control.streams[2].partial_response, 'Studia e');
            await page.getByText('Studia e verifica.', { exact: true }).last().waitFor();
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('mobile navigation exposes retry after frozen-session failure', async () => {
    const { page, context, control } = await fixture(390, { initialError: true });
    try {
        await page.goto(`${origin}/profilo/taccuino`, { waitUntil: 'networkidle' });
        await page.locator('button[aria-controls="mobile-menu"]').click();
        const menu = page.locator('#mobile-menu');
        await menu.getByText('Impossibile aggiornare le sessioni da riprendere.').waitFor();
        control.frozenError = false;
        await menu.getByRole('button', { name: 'Riprova', exact: true }).click();
        await menu.getByRole('link', { name: 'Sessione da ritrovare' }).waitFor();
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});
