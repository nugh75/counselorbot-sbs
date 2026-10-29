import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// ChatMarkdown (#654): la stessa risposta produce lo stesso HTML in chat
// guidata, Bussola e Assistente. Fixture sintetiche, nessun backend o modello.
const origin = process.env.CHAT_MARKDOWN_BASE_URL || 'http://127.0.0.1:3173';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); });
after(async () => { await browser?.close(); });
const event = data => `data: ${JSON.stringify(data)}\n\n`;

const DIAGRAM = { type: 'cycle', title: 'Circolo dell’evitamento', nodes: [{ id: 'a', label: 'Compito difficile' }, { id: 'b', label: 'Rimando' }], edges: [{ from: 'a', to: 'b' }] };
const MARKDOWN = [
    '## Piano della settimana',
    'Testo con **grassetto**, `codice` e un [collegamento](https://example.org/guida). <img src="x" onerror="window.__xss=1">',
    '> Una citazione breve.',
    '- primo punto\n- secondo punto',
    '```js\nconst minuti = 25;\n```',
    '| Giorno | Attività | Durata | Luogo | Strumento | Nota | Verifica | Esito |\n|---|---|---|---|---|---|---|---|\n'
        + '| Lunedì | Ripasso del capitolo con schema e domande | 25 min | Biblioteca | Quaderno | Pausa breve | Domande | ULTIMA COLONNA |',
    JSON.stringify(DIAGRAM),
    '{"error":"Rate limit exceeded"}',
    'Domanda finale?',
].join('\n\n');

async function fixture(width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 600, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('cb_lang', 'it');
        localStorage.setItem('cb_theme', 'light');
        localStorage.setItem('counselorbot_selected_counselor', '1');
    });
    const guided = { session_id: 'markdown', questionnaire_type: 'QSA', current_phase: 'intro', counselor_id: 1, experience: 'standard', scores: { C1: 7 },
        messages: [{ role: 'system', content: '--- Introduzione ---' }, { role: 'user', content: 'Vorrei un piano.' }, { role: 'assistant', content: MARKDOWN }] };
    const orientation = { session_id: 'markdown', status: 'in_progress', counselor_id: 1, language: 'it', recommendations: [],
        messages: [{ role: 'user', content: 'Vorrei un piano.' }, { role: 'assistant', content: MARKDOWN }] };
    await page.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(origin).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'markdown', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true, latest_session_id: 'markdown' };
        else if (url.pathname.startsWith('/api/orientation/sessions')) data = orientation;
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/user/cross-synthesis/availability') data = { available: false, min_instruments: 2, instruments: [] };
        else if (url.pathname === '/api/user/learner-profile') data = { profile: {} };
        else if (url.pathname === '/api/user/readings') data = null;
        else if (url.pathname === '/api/session/frozen') data = [{ ...guided, label: 'Piano' }];
        else if (url.pathname === '/api/session/frozen/markdown') data = guided;
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro' }] };
        else if (url.pathname === '/api/user/questionnaire-results') data = [{ session_id: 'markdown', questionnaire_type: 'QSA', scores: { C1: 7 }, submitted_at: '2026-09-01T10:00:00Z' }];
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (url.pathname === '/api/site-chat/stream') return route.fulfill({ contentType: 'text/event-stream',
            body: event({ session_id: 'markdown', conversation_id: 'markdown' }) + event({ display: MARKDOWN }) + event({ done: true, response: MARKDOWN }) });
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

const surfaces = {
    guided: async page => { await page.goto(`${origin}/?frozen=markdown`); },
    bussola: async page => {
        await page.goto(`${origin}/bussola`);
        await page.getByRole('button', { name: 'Rivedi l’ultimo orientamento', exact: true }).click({ timeout: 120000 });
    },
    assistente: async page => {
        await page.goto(`${origin}/assistente`);
        const composer = page.locator('form.assistente-composer textarea');
        await composer.waitFor({ timeout: 120000 });
        await composer.fill('Vorrei un piano.');
        await composer.press('Enter');
    },
};

// Le parti prodotte da ChatMarkdown nell'ultima bolla dell'assistente.
async function rendered(page) {
    const bubble = page.locator('[role="log"] .chat-message').filter({ hasText: 'Domanda finale?' }).last();
    await bubble.waitFor({ timeout: 120000 });
    return bubble.evaluate(node => [...node.querySelectorAll('div[class*="overflow-wrap"], [role="alert"]')].map(el => el.outerHTML).join('\n'));
}

for (const width of [390, 1440]) {
    test(`guided chat, Bussola and Assistente render the same Markdown at ${width}px`, async () => {
        const html = {};
        for (const [name, open] of Object.entries(surfaces)) {
            const { page, context, errors } = await fixture(width);
            try {
                await open(page);
                html[name] = await rendered(page).catch(error => { throw new Error(`${name}: ${error.message}`); });
                const bubble = page.locator('[role="log"] .chat-message').filter({ hasText: 'Domanda finale?' }).last();

                // Link, codice, citazione, elenco, diagramma ed errore del provider.
                const link = bubble.getByRole('link', { name: 'collegamento' });
                assert.equal(await link.getAttribute('href'), 'https://example.org/guida');
                assert.equal(await bubble.locator('pre code').textContent(), 'const minuti = 25;\n');
                assert.equal(await bubble.locator('blockquote').count(), 1);
                assert.equal(await bubble.locator('div[class*="overflow-wrap"] li').count(), 2);
                assert.equal(await bubble.getByRole('group', { name: DIAGRAM.title }).count(), 1, `${name} diagram`);
                assert.equal(await bubble.getByRole('alert').count(), 1, `${name} provider error`);
                assert.ok(!(await bubble.textContent()).includes('Rate limit'));
                // HTML grezzo mai eseguito né reso.
                assert.equal(await bubble.locator('img').count(), 0);
                assert.equal(await page.evaluate(() => window.__xss), undefined);

                // La tabella scorre nel suo contenitore, la pagina no.
                const table = await bubble.locator('table').evaluate(node => {
                    const box = node.parentElement;
                    return { scrolls: box.scrollWidth > box.clientWidth, overflow: getComputedStyle(box).overflowX, tab: box.tabIndex };
                });
                assert.equal(table.overflow, 'auto');
                assert.equal(table.tab, 0);
                if (width < 768) assert.ok(table.scrolls, `${name} table scrolls inside its box`);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} page has no horizontal scroll`);
                assert.deepEqual(errors, []);
            } finally { await context.close(); }
        }
        // Testo, tabella ed errore: il grafico ha stato proprio ed è contato sopra.
        assert.equal(html.bussola, html.guided);
        assert.equal(html.assistente, html.guided);
    });
}
