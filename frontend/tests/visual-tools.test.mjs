import { chatLayoutLabel } from '../src/lib/i18n-chat-layout.ts';
import { chatPreferenceLabel } from '../src/lib/chat-preferences.ts';
import { visualLabel } from '../src/lib/i18n-visual-tools.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.VISUAL_TOOLS_BASE_URL || 'http://127.0.0.1:3000').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const reply = 'Scegli un obiettivo, studia e verifica quello che ricordi.';
const spec = { type: 'flow', title: 'Piano di studio e verifica dei risultati', nodes: [{ id: 'a', label: 'Obiettivo' }, { id: 'b', label: 'Verifica' }], edges: [{ from: 'a', to: 'b' }] };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180"><g class="node"><title>a</title><text x="40" y="40">Obiettivo</text></g><g class="edge"><title>a-&gt;b</title><path d="M60 50V100" stroke="#17747a"/></g><g class="node"><title>b</title><text x="40" y="130">Verifica</text></g></svg>';
const graphSpec = JSON.parse(readFileSync(new URL('./fixtures/reading-diagram.json', import.meta.url), 'utf8'));

async function fixture(width, phase = 'intro', options = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: options.timezone, reducedMotion: options.motion || 'reduce', hasTouch: Boolean(options.touch), isMobile: Boolean(options.touch) });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const control = { failSave: false, failLoad: false, failPdf: false, visual: { revision: 0, workspace: { actions: [], cards: [], comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' } } }, failDiagram: false, failPatch: false, failRender: false, failExport: false, saved: options.graph ? [{ source_text: reply, source_key: createHash('sha256').update(reply).digest('hex'), instruction: '', spec: graphSpec }] : [], requests: [], errors: [] };
    control.portfolio = [{ id: 91, title: 'Slide del progetto', description: 'Un lavoro di prova', images: [] }];
    control.copies = new Map();
    control.personal = { questionnaire_type: 'QSA', limits: { notebook: 600, booklet: 2000 }, sources: { actions: 'Strumenti visivi · Piano personale', cards: 'Strumenti visivi · Carte', comparison: 'Strumenti visivi · Confronto' }, notebook: { notes: 'Annotazione originale', goal: 'Organizzare lo studio' }, booklets: [{ id: 7, title: 'La mia scheda', data: { student_notes: 'Nota esistente' } }] };
    const catalog = {
        reading: [{ slug: 'test-book', title: 'Libro per la prova', why: 'Collegato al metodo di studio.', synopsis: 'SINOSSI COMPLETA DEL LIBRO', where: 'https://example.invalid/libro', languages: ['it', 'en'], warning: 'AVVERTENZA DEL LIBRO', status: 'proposed' }],
        strategy: [{ slug: 'test-strategy', name: 'Recupero attivo', description: 'Chiudi il testo e scrivi tre concetti.', recommended_when: 'Quando vuoi verificare cosa ricordi.', status: 'proposed' }],
    };
    if (options.guide) { catalog.reading = []; catalog.strategy = []; }
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(({ locale, dark }) => { localStorage.setItem('cb_lang', locale || 'it'); localStorage.setItem('counselorbot_selected_counselor', '1'); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, options);
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        control.requests.push({ path: url.pathname, search: url.search, method: request.method(), body: request.postDataJSON() });
        if (options.liveTimeline && (url.pathname.startsWith('/api/session/fixture/visual-tools') || url.pathname.startsWith('/api/user/portfolio') || url.pathname.startsWith('/api/user/timeline'))) {
            const response = await route.fetch({ url: `http://127.0.0.1:8189${url.pathname.slice(4)}${url.search}` });
            return route.fulfill({ response });
        }
        let data = [];
        if (url.pathname === '/api/tts/voices') return route.fulfill({ json: { voices: [] } });
        if (url.pathname === '/api/tts/stream') {
            const segment = { index: 0, paragraph_id: 0, text: request.postDataJSON().text };
            return route.fulfill({ contentType: 'text/event-stream', body: [
                { type: 'init', segments: [segment] }, { type: 'chunk', ...segment, audio: 'YXVkaW8=', words: [] }, { type: 'done' },
            ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') });
        }
        if (url.pathname === '/api/chat/stream') return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ display: 'Possiamo approfondire questo punto.' }) + '\n\ndata: ' + JSON.stringify({ done: true, response: 'Possiamo approfondire questo punto.', session_id: 'fixture' }) + '\n\n' });
        if (url.pathname === '/api/orientation-directory') data = { institution: null, events: [], referrals: [] };
        else if (url.pathname === '/api/user/portfolio') data = control.portfolio;
        else if (url.pathname.endsWith('/timeline/preview')) {
            const body = request.postDataJSON();
            data = { title: body.title, description: control.visual.workspace.timeline.events.filter(e => body.event_ids.includes(e.id)).map(e => e.title + ': ' + e.reflection).join('\n'), preview_hash: 'a'.repeat(64) };
        } else if (url.pathname.endsWith('/timeline/portfolio')) {
            if (control.failCopy) return route.fulfill({ status: 503, body: '{}' });
            const body = request.postDataJSON();
            if (!control.copies.has(body.request_id)) control.copies.set(body.request_id, { item_id: 92 });
            data = control.copies.get(body.request_id);
        } else if (url.pathname.endsWith('/timeline-links')) data = { links: [], snapshot: false };
        else if (url.pathname === '/api/opencode/workspace') data = { key: 'fixture', api_available: true, session_id: 'opencode-fixture', needs_seed: false, history: [{ role: 'assistant', content: reply }] };
        else if (url.pathname === '/api/session/fixture/visual-tools/personal') {
            if (control.failPersonal) return route.fulfill({ status: 503, body: '{}' });
            if (request.method() === 'POST') {
                const body = request.postDataJSON();
                let sheet = control.personal.booklets.find(item => item.id === body.booklet_id);
                if (body.destination === 'booklet' && !sheet) {
                    sheet = { id: 8, title: 'Nuova scheda', data: {} }; control.personal.booklets.push(sheet);
                }
                const target = body.destination === 'notebook' ? control.personal.notebook : sheet.data;
                const block = `${body.text}\n(${control.personal.sources[body.entry.split(':')[0]]})`;
                if ((target[body.field] || '').includes(block)) data = { status: 'duplicate', context: control.personal, booklet_id: sheet?.id };
                else if ((target[body.field] || '') !== body.expected_text) return route.fulfill({ status: 409, body: '{}' });
                else { target[body.field] = [target[body.field], block].filter(Boolean).join('\n\n'); data = { status: 'saved', context: control.personal, booklet_id: sheet?.id }; }
            } else data = control.personal;
        }
        else if ((url.pathname === '/api/session/fixture/visual-tools' || url.pathname === '/api/user/timeline')) {
            if (request.method() === 'GET' && control.deferRead) {
                const wait = control.deferRead; control.deferRead = null;
                const snapshot = structuredClone(control.visual);
                await wait();
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot) });
            }

            if (request.method() === 'PUT') {
                if (control.failSave) return route.fulfill({ status: 503, body: '{}' });
                const body = request.postDataJSON();
                if (body.revision !== control.visual.revision) return route.fulfill({ status: 409, body: '{}' });
                control.visual = { revision: control.visual.revision + 1, workspace: body.workspace };
            } else if (control.failLoad) return route.fulfill({ status: 503, body: '{}' });
            data = control.visual;
        } else if ((url.pathname === '/api/session/fixture/visual-tools/pdf' || url.pathname === '/api/user/timeline/pdf')) {
            if (control.failPdf) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
        } else if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'fixture', name: options.guide ? 'Esempio' : 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: options.guide ? 'Counselor dimostrativo' : 'Counselor di prova', language: ['it'], suitable: true }];
        else if (url.pathname === '/api/session/frozen/fixture') data = { session_id: 'fixture', questionnaire_type: 'QSA', current_phase: phase, counselor_id: 1, experience: options.experience || 'standard', scores: { C1: 7 }, messages: [{ role: 'system', content: phase === 'intro' ? '--- Introduzione ---' : 'FINE PERCORSO' }, { role: 'user', content: 'Vorrei organizzarmi.' }, ...Array.from({ length: options.longConversation ? 20 : 1 }, (_, index) => ({ role: 'assistant', content: reply, ...(options.feedback ? { responseId: `reply-${index}`, feedbackPhase: 'intro' } : {}) }))] };
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro' }], text_guided_conclusion: 'FINE PERCORSO' };
        else if (url.pathname === '/api/session/fixture/diagrams') data = control.saved;
        else if (url.pathname === '/api/session/fixture/recommendations') data = catalog;
        else if (url.pathname.startsWith('/api/session/fixture/recommendations/')) {
            if (control.failPatch) return route.fulfill({ status: 503, body: '{}' });
            const [, , , , , type, slug] = url.pathname.split('/');
            Object.assign(catalog[type].find(item => item.slug === slug), request.postDataJSON());
            data = catalog;
        } else if (url.pathname === '/api/diagram/from-message') {
            if (control.failDiagram) return route.fulfill({ status: 503, body: '{}' });
            const body = request.postDataJSON();
            assert.equal(body.session_id, 'fixture');
            control.saved = [{ source_text: body.source_text, source_key: createHash('sha256').update(body.source_text.trim()).digest('hex'), instruction: body.instruction, spec }];
            data = spec;
        } else if (url.pathname === '/api/diagram/render') {
            const body = request.postDataJSON();
            if (control.failRender || (body.embed_title && control.failExport)) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ contentType: body.format === 'png' ? 'image/png' : 'image/svg+xml', body: options.graph
                ? readFileSync(new URL(`./fixtures/reading-diagram-${body.theme}.${body.format}`, import.meta.url)) : svg });
        }
        else if (url.pathname.endsWith('/summary')) data = { summary: '## Scelta finale\nProverò il recupero attivo per una settimana.', status: 'ready' };
        else if (url.pathname.endsWith('/pdf')) return route.fulfill({ contentType: 'application/pdf', headers: { 'X-Summary-Status': 'ready' }, body: '%PDF-1.4\n%%EOF' });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
    return { page, context, control };
}

for (const width of [320, 1440]) {
    test(`one kebab and direct per-response audio and feedback at ${width}px`, async () => {
        const { page, context, control } = await fixture(width, 'intro', { feedback: true, longConversation: true });
        try {
            await page.evaluate(() => { window.Audio = class { play() { return Promise.resolve(); } pause() {} load() {} removeAttribute() {} }; });
            assert.equal(await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).count(), 1);
            assert.equal(await page.getByRole('button', { name: 'Inserisci audio', exact: true }).count(), 1);
            assert.equal(await page.getByRole('button', { name: 'Azioni del messaggio', exact: true }).count(), 0);
            const row = page.getByRole('group', { name: 'Azioni del messaggio', exact: true }).last();
            for (const name of ['Diagramma', 'Ascolta', 'Risposta utile', 'Risposta non utile']) {
                const button = row.getByRole('button', { name, exact: true });
                await button.scrollIntoViewIfNeeded();
                const bounds = await button.boundingBox();
                assert.ok(bounds.height >= 44 && bounds.width >= 44 && bounds.width <= 48);
                assert.equal((await button.innerText()).trim(), '', `${name} uses an icon`);
            }
            await row.getByRole('button', { name: 'Ascolta', exact: true }).click();
            const reader = page.getByRole('complementary', { name: 'Lettore audio' });
            if (await reader.getByRole('button', { name: 'Espandi lettore' }).count()) await reader.getByRole('button', { name: 'Espandi lettore' }).click();
            const stop = reader.getByRole('button', { name: 'Ferma', exact: true });
            await stop.waitFor();
            await stop.click();
            assert.equal(control.requests.find(r => r.path === '/api/tts/stream').body.text, reply);
            await reader.getByRole('button', { name: 'Chiudi lettore', exact: true }).click();
            await row.getByRole('button', { name: 'Ascolta', exact: true }).waitFor();
            const helpful = width === 320;
            const vote = row.getByRole('button', { name: helpful ? 'Risposta utile' : 'Risposta non utile', exact: true });
            await vote.click();
            await page.waitForFunction(() => document.querySelector('[aria-pressed="true"][aria-label^="Risposta"]'));
            assert.equal(await vote.getAttribute('aria-pressed'), 'true');
            const feedback = control.requests.find(r => r.path === '/api/strategy-feedback');
            assert.equal(feedback.body.response_id, 'reply-19');
            assert.equal(feedback.body.helpful, helpful);
            assert.equal(control.requests.some(r => r.path === '/api/chat/stream'), false);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

for (const options of [{ width: 320, locale: 'it', touch: true }, { width: 390, locale: 'de', touch: true, dark: true }, { width: 1024, locale: 'sv' }, { width: 1440, locale: 'en' }]) {
    test(`chat keeps resources but no personal workspaces at ${options.width}px`, async () => {
        const { page, context, control } = await fixture(options.width, 'intro', { ...options, openResources: false });
        const l = key => chatLayoutLabel(options.locale, key);
        try {
            const chat = page.getByRole('region', { name: 'CounselorBot AI', exact: true });
            const panel = page.getByRole('complementary', { name: l('panelTitle'), exact: true });
            const header = chat.locator('header');
            assert.equal(await header.getByRole('button', { name: visualLabel(options.locale, 'open'), exact: true }).count(), 0);
            assert.equal(await header.getByRole('button', { name: l('hide'), exact: true }).count(), 0);
            await page.locator('#guided-composer').fill('Una bozza da conservare');
            const trigger = page.getByRole('button', { name: l('options'), exact: true });
            await trigger.click();
            const menu = page.locator('.chat-options:visible');
            await menu.waitFor();
            assert.equal(await page.getByText('Tools', { exact: true }).count(), 0);
            await page.getByRole('radio', { name: new RegExp(chatPreferenceLabel(options.locale, 'format')) }).first().waitFor();
            const compactChoices = await page.getByRole('radio').count();
            assert.equal(compactChoices >= 6, true, `format and length use compact icon choices: ${compactChoices}`);
            await page.keyboard.press('Escape');
            if (options.width < 1024) {
                assert.equal(await panel.count(), 0, 'resources do not occupy space below the chat');
            } else {
                const original = await chat.boundingBox();
                await panel.getByRole('button', { name: l('hide'), exact: true }).click();
                assert.equal(await panel.isVisible(), false);
                assert.ok((await chat.boundingBox()).width > original.width + 250);
            }
            assert.equal(await page.locator('#guided-composer').inputValue(), 'Una bozza da conservare');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(control.requests.some(r => r.path === '/api/chat/stream'), false);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('the conversation menu toggles the desktop sidebar and remembers its visibility', async () => {
    const { page, context, control } = await fixture(1440);
    const l = key => chatLayoutLabel('it', key);
    try {
        const panel = page.getByRole('complementary', { name: l('panelTitle'), exact: true });
        const chat = page.getByRole('region', { name: 'CounselorBot AI', exact: true });
        const trigger = page.getByRole('button', { name: l('options'), exact: true });
        const composer = page.locator('#guided-composer');
        const togglePanel = async () => {
            await trigger.click();
            const menu = page.locator('.chat-options:visible');
            await menu.waitFor();
            await menu.getByRole('button', { name: l('panel'), exact: true }).click();
        };
        await panel.waitFor();
        const original = await chat.boundingBox();
        const panelWidth = (await panel.boundingBox()).width;
        await composer.fill('Una bozza da conservare');
        await togglePanel();
        await panel.waitFor({ state: 'hidden' });
        assert.equal(await page.locator('[popover]:popover-open').count(), 0);
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
        assert.ok((await chat.boundingBox()).width > original.width + 250);
        assert.equal(await composer.inputValue(), 'Una bozza da conservare');
        await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
        await composer.waitFor();
        assert.equal(await panel.isVisible(), false, 'the menu saves the collapsed preference');
        await composer.fill('Riprendo la bozza');
        await togglePanel();
        await panel.waitFor();
        await page.waitForFunction(() => document.activeElement?.tagName === 'ASIDE');
        assert.equal((await panel.boundingBox()).width, panelWidth);
        assert.equal((await chat.boundingBox()).width, original.width);
        assert.equal(await composer.inputValue(), 'Riprendo la bozza');
        await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
        await panel.waitFor();
        assert.ok(await panel.isVisible(), 'the menu saves the expanded preference');
        assert.equal(control.requests.some(r => r.path === '/api/chat/stream'), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('a single separator resizes the sidebar with keyboard and pointer and remembers preferences', async () => {
    const { page, context, control } = await fixture(1440);
    const l = key => chatLayoutLabel('it', key);
    try {
        const panel = page.getByRole('complementary', { name: l('panelTitle'), exact: true });
        const separator = page.getByRole('separator', { name: l('resize'), exact: true });
        await separator.waitFor();
        assert.equal(await panel.getByRole('button', { name: l('widen'), exact: true }).count(), 0);
        assert.equal(await panel.getByRole('button', { name: l('narrow'), exact: true }).count(), 0);
        const waitWidth = value => page.waitForFunction(value => { const separator = document.querySelector('[role="separator"]'); return separator?.getAttribute('aria-valuenow') === String(value) && separator.previousElementSibling.getBoundingClientRect().width === Number(value); }, value);
        await separator.focus(); await page.keyboard.press('Home');
        await waitWidth(260);
        await page.keyboard.press('ArrowRight');
        await waitWidth(280);
        await page.keyboard.press('End');
        await waitWidth(await separator.getAttribute('aria-valuemax'));
        await page.keyboard.press('Home');
        await waitWidth(260);
        const grip = await separator.boundingBox();
        await page.mouse.move(grip.x + grip.width / 2, grip.y + 80); await page.mouse.down();
        await page.mouse.move(grip.x + grip.width / 2 + 70, grip.y + 80, { steps: 5 }); await page.mouse.up();
        await waitWidth(330);
        const resized = Number(await separator.getAttribute('aria-valuenow'));
        await page.getByRole('button', { name: l('hide'), exact: true }).click();
        await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
        assert.equal(await panel.isVisible(), false);
        await page.getByRole('button', { name: l('show'), exact: true }).click();
        assert.equal(Number(await separator.getAttribute('aria-valuenow')), resized);
        await page.setViewportSize({ width: 1024, height: 844 });
        assert.ok((await page.getByRole('region', { name: 'CounselorBot AI', exact: true }).boundingBox()).width >= 420);
        await page.setViewportSize({ width: 390, height: 844 });
        await panel.waitFor({ state: 'hidden' });
        assert.equal(await separator.count(), 0);
        await page.setViewportSize({ width: 1440, height: 844 });
        await separator.waitFor();
        assert.equal(Number(await separator.getAttribute('aria-valuenow')), resized);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('step navigation stays below the composer while a long conversation scrolls, and advances once', async () => {
    const { page, context, control } = await fixture(320, 'intro', { touch: true, longConversation: true });
    try {
        const chat = page.getByRole('region', { name: 'CounselorBot AI', exact: true });
        const navigation = chat.getByRole('navigation', { name: chatLayoutLabel('it', 'navigation'), exact: true });
        const log = chat.getByRole('log');
        const composer = page.locator('#guided-composer');
        await navigation.waitFor();
        assert.equal(await page.getByRole('navigation', { name: chatLayoutLabel('it', 'navigation'), exact: true }).count(), 1);
        assert.ok(await log.evaluate(e => e.scrollHeight > e.clientHeight));
        const before = await navigation.boundingBox();
        await log.evaluate(e => { e.scrollTop = 0; });
        assert.equal((await navigation.boundingBox()).y, before.y);
        const inputBox = await composer.boundingBox();
        assert.ok(before.y >= inputBox.y + inputBox.height);
        assert.ok(before.y + before.height <= 844);
        assert.ok(before.y >= (await log.boundingBox()).y + (await log.boundingBox()).height - 1);
        assert.match(await navigation.textContent(), /1\/3/);
        await navigation.getByRole('button').last().click();
        await page.waitForFunction(() => document.querySelector('nav[aria-label="Avanzamento del percorso"]')?.textContent.includes('2/3'));
        await log.getByText('Possiamo approfondire questo punto.', { exact: true }).waitFor();
        assert.equal(control.requests.filter(r => r.path === '/api/chat/stream').length, 1);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('invalid saved panel preferences do not prevent reopening the chat', async () => {
    const { page, context, control } = await fixture(1440);
    try {
        await page.evaluate(() => localStorage.setItem('cb_chat_panel', '{broken'));
        await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: chatLayoutLabel('it', 'hide'), exact: true }).waitFor();
        assert.ok(await page.locator('#guided-composer').isVisible());
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const width of [320, 1440]) {
    test(`repeat step remains available without a detected error at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        try {
            const nav = page.getByRole('navigation', { name: chatLayoutLabel('it', 'navigation'), exact: true });
            const repeat = nav.getByRole('button', { name: 'Ripeti Passaggio', exact: true });
            await repeat.waitFor();
            assert.equal((await repeat.innerText()).trim(), '');
            assert.equal(await repeat.locator('svg.lucide-rotate-ccw').count(), 1);
            assert.equal(await nav.getByRole('button').first().getAttribute('aria-label'), 'Ripeti Passaggio');
            await repeat.click();
            await page.getByRole('log').getByText('Possiamo approfondire questo punto.', { exact: true }).waitFor();
            assert.match(await nav.textContent(), /1\/3/);
            assert.equal(control.requests.filter(r => r.path === '/api/chat/stream').length, 1);
            await nav.getByRole('button').last().click();
            await page.waitForFunction(() => document.querySelector('nav[aria-label="Avanzamento del percorso"]')?.textContent.includes('2/3'));
            assert.equal(await nav.getByRole('button').nth(1).getAttribute('aria-label'), 'Ripeti Passaggio');
            await repeat.click();
            await page.waitForFunction(() => [...document.querySelectorAll('nav button')].some(b => b.getAttribute('aria-label') === 'Ripeti Passaggio' && !b.disabled));
            assert.equal(control.requests.filter(r => r.path === '/api/chat/stream').length, 3);
            assert.match(await nav.textContent(), /2\/3/);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('capture current guide screenshots', { skip: process.env.UPDATE_GUIDE_SCREENSHOTS !== '1' }, async () => {
    const { page, context } = await fixture(1440, 'intro', { guide: true });
    try {
        await page.setViewportSize({ width: 1440, height: 900 });
        const nav = page.getByRole('navigation', { name: chatLayoutLabel('it', 'navigation'), exact: true });
        await nav.getByRole('button').last().click();
        await page.getByRole('log').getByText('Possiamo approfondire questo punto.', { exact: true }).waitFor();
        await page.mouse.move(1400, 20);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: 'public/guide/chat-guidata.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: chatLayoutLabel('it', 'options'), exact: true }).click();
        await page.locator('.chat-options:popover-open').waitFor();
        await page.mouse.move(380, 20);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: 'public/guide/controlli-chat.png' });
    } finally { await context.close(); }
});

for (const options of [{ width: 320, locale: 'de' }, { width: 390, locale: 'it', dark: true }, { width: 1440, locale: 'en' }, { width: 390, locale: 'es' }, { width: 1440, locale: 'fr' }, { width: 390, locale: 'sv' }]) {
    test(`updated guide loads and enlarges all screenshots at ${options.width}px in ${options.locale}`, async () => {
        const { page, context, control } = await fixture(options.width, 'intro', options);
        try {
            await page.goto(`${origin}/guide`, { waitUntil: 'networkidle' });
            const sections = page.locator('li[id^="guide-section-"]');
            assert.equal(await sections.count(), 15);
            for (let n = 10; n <= 15; n++) {
                const link = page.locator(`a[href="#guide-section-${n}"]`);
                const section = page.locator(`#guide-section-${n}`);
                assert.ok((await link.innerText()).includes(await section.locator('h2').innerText()));
                assert.ok((await section.locator('p').innerText()).length > 100);
                await link.click();
                assert.equal(new URL(page.url()).hash, `#guide-section-${n}`);
            }
            assert.doesNotMatch(await page.locator('main').innerText(), /guide\.(section|chat)\w*/);
            const figures = page.locator('figure');
            assert.equal(await figures.count(), 10);
            for (const figure of await figures.all()) {
                const thumbnail = figure.locator('img');
                await thumbnail.scrollIntoViewIfNeeded();
                await thumbnail.evaluate(img => img.decode());
                assert.ok(await thumbnail.getAttribute('alt'));
                const button = figure.getByRole('button');
                await button.click();
                const zoom = page.getByRole('dialog');
                await zoom.waitFor();
                await zoom.locator('img').evaluate(img => img.decode());
                await page.keyboard.press('Escape');
                assert.equal(await page.getByRole('dialog').count(), 0);
                assert.equal(await button.evaluate(el => el === document.activeElement), true);
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.doesNotMatch(await page.locator('main').innerText(), /guide\.chat\./);
            await page.locator('#guide-chat-controls').scrollIntoViewIfNeeded();
            await page.screenshot({ path: `/tmp/guide-reviewed-${options.width}.png` });
            assert.deepEqual(control.errors, []);

        } finally { await context.close(); }
    });
}

for (const [locale, width] of [['it', 390], ['en', 1440], ['de', 320], ['es', 390], ['fr', 1440], ['sv', 390]]) {
    test(`timeline links actions and Portfolio with explicit snapshot at ${width}px in ${locale}`, async () => {
        const { page, context, control } = await fixture(width, 'intro', { locale, touch: width < 500, dark: locale === 'de' });
        const l = key => visualLabel(locale, key === 'save' ? 'personalSave' : key);
        try {
            await page.goto(`${origin}/profilo/timeline`);
            const dialog = page.getByRole('dialog');

            await dialog.getByLabel(l('eventTitle'), { exact: true }).fill('Presentazione');
            await dialog.getByLabel(l('singleDate'), { exact: true }).fill('2026-10-15');
            await dialog.getByRole('button', { name: l('addEvent'), exact: true }).click();
            const event = dialog.locator('li[id^="timeline-"]');
            await event.getByLabel(l('diary'), { exact: true }).fill('Provare con un compagno');
            await event.getByRole('textbox', { name: l('createAction'), exact: true }).fill('Preparare le slide');
            await event.getByRole('combobox', { name: l('actionKind'), exact: true }).selectOption('book');
            await event.getByRole('button', { name: l('createAction'), exact: true }).click();
            await event.getByRole('combobox', { name: l('linkPortfolio'), exact: true }).selectOption('91');
            await dialog.getByRole('button', { name: l('save'), exact: true }).click();
            assert.equal(control.visual.workspace.actions[0].title, 'Preparare le slide');
            await dialog.getByRole('button', { name: l('savePortfolio'), exact: true }).click();
            await dialog.getByRole('button', { name: l('preview'), exact: true }).click();
            await dialog.locator('pre').waitFor();
            assert.match(await dialog.locator('pre').innerText(), /Provare con un compagno/);
            control.failCopy = true;
            await dialog.getByRole('button', { name: l('savePortfolio'), exact: true }).last().click();
            await dialog.getByRole('alert').waitFor();
            control.failCopy = false;
            await dialog.getByRole('button', { name: l('savePortfolio'), exact: true }).last().click();
            await dialog.getByText(l('snapshotSaved'), { exact: false }).waitFor();
            assert.equal(control.copies.size, 1);
            await page.screenshot({ path: `/tmp/timeline-${locale}-${width}.png` });
            assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
            await dialog.locator('.workspace-page-back').click();
            await page.waitForURL('**/profilo');
            await page.goto(`${origin}/profilo/timeline`);

            await dialog.getByRole('button', { name: `${l('eventDetails')}: Presentazione`, exact: true }).filter({ visible: true }).click();
            assert.equal(await event.getByLabel(l('singleDate'), { exact: true }).inputValue(), '2026-10-15');
            assert.equal(control.visual.workspace.actions.length, 1);
            assert.equal(control.visual.workspace.actions[0].kind, 'book');
            assert.equal(control.visual.workspace.timeline.events[0].portfolio[0].id, 91);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('timeline real API: reading and film goals, Portfolio return links, immutable copy and PDF', { skip: process.env.TIMELINE_LIVE !== '1' }, async () => {
    const { page, context, control } = await fixture(1440, 'intro', { locale: 'it', liveTimeline: true, dark: true });
    const l = key => visualLabel('it', key === 'save' ? 'personalSave' : key);
    try {
        await page.goto(`${origin}/profilo/timeline`);
        let dialog = page.getByRole('dialog');

        await dialog.getByLabel(l('eventTitle'), { exact: true }).fill('Preparazione della presentazione');
        await dialog.getByLabel(l('singleDate'), { exact: true }).fill('2026-10-15');
        await dialog.getByRole('button', { name: l('addEvent'), exact: true }).click();
        let event = dialog.locator('li[id^="timeline-"]');
        for (const [kind, title] of [['book', 'Leggere il libro scelto'], ['article', 'Studiare l’articolo scelto'], ['film', 'Vedere il film scelto']]) {
            await event.getByRole('combobox', { name: l('actionKind'), exact: true }).selectOption(kind);
            await event.getByRole('textbox', { name: l('createAction'), exact: true }).fill(title);
            await event.getByRole('button', { name: l('createAction'), exact: true }).click();
        }
        await event.getByRole('combobox', { name: l('linkPortfolio'), exact: true }).selectOption('1');
        await event.getByLabel(l('diary'), { exact: true }).fill('Le letture mi aiutano a preparare il confronto.');
        await dialog.getByRole('button', { name: l('savePortfolio'), exact: true }).click();
        await dialog.getByRole('button', { name: l('preview'), exact: true }).click();
        await dialog.locator('pre').waitFor();
        assert.match(await dialog.locator('pre').innerText(), /Libro da leggere/);
        assert.match(await dialog.locator('pre').innerText(), /Film da vedere/);
        await dialog.getByRole('button', { name: l('savePortfolio'), exact: true }).last().click();
        await dialog.getByText(l('snapshotSaved'), { exact: false }).waitFor();
        const download = page.waitForEvent('download');
        await dialog.getByRole('button', { name: l('export'), exact: true }).click();
        await (await download).saveAs('/tmp/timeline-live.pdf');
        await event.getByLabel(l('diary'), { exact: true }).fill('Riflessione modificata dopo la copia');
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await dialog.getByRole('button', { name: l('save'), exact: true }).waitFor({ state: 'visible' });
        await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === label && b.disabled), l('save'));
        await page.goto(`${origin}/profilo/portfolio#portfolio-2`, { waitUntil: 'networkidle' });
        const copy = page.locator('#portfolio-2');
        await copy.getByText(l('viewSnapshot'), { exact: true }).click();
        assert.match(await copy.innerText(), /Le letture mi aiutano/);
        assert.doesNotMatch(await copy.innerText(), /Riflessione modificata/);
        await copy.getByRole('link', { name: /Apri la tappa/ }).click();
        dialog = page.getByRole('dialog');
        event = dialog.locator('li[id^="timeline-"]');
        await event.waitFor();
        assert.equal(await event.getByLabel(l('diary'), { exact: true }).inputValue(), 'Riflessione modificata dopo la copia');
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
        await page.screenshot({ path: '/tmp/timeline-live-dark.png' });
        await dialog.getByRole('button', { name: /^Rimuovi: Preparazione/ }).click();
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === label && b.disabled), l('save'));
        assert.equal((await (await page.request.get('http://127.0.0.1:8189/user/timeline')).json()).workspace.actions.length, 3);
        await page.goto(`${origin}/profilo/portfolio`, { waitUntil: 'networkidle' });
        await page.locator('#portfolio-2').waitFor();
        assert.equal(await page.getByRole('link', { name: /Apri la tappa/ }).count(), 0);
        assert.equal(await page.locator('article[id^="portfolio-"]').count(), 2);
        assert.deepEqual(control.errors, []);
    } catch (error) { await page.screenshot({ path: '/tmp/timeline-live-failure.png' }); console.error((await page.locator('body').innerText()).slice(-2000)); throw error; } finally { await context.close(); }
});

for (const width of [390, 1440]) test(`personal calendar plans four date forms and closes an open period without losing the diary at ${width}px`, async () => {
    const { page, context, control } = await fixture(width, 'intro', { dark: width === 390 });
    const l = key => visualLabel('it', key === 'save' ? 'personalSave' : key);
    try {
        await page.goto(`${origin}/profilo/timeline`);
        const dialog = page.getByRole('dialog');
        const form = dialog.locator('form').first();
        await form.waitFor({ state: 'visible' });
        for (const [title, mode, start, end] of [
            ['Tirocinio', 'period', '2026-09-10', ''],
            ['Visita', 'point', '2026-09-01', ''],
            ['Iscrizione', 'period', '', '2026-10-01'],
            ['Corso', 'period', '2026-09-05', '2026-09-25'],
        ]) {
            if (!(await form.getByLabel(l('eventTitle'), { exact: true }).isVisible())) await dialog.locator('summary').filter({ hasText: l('addEvent') }).click();
            await form.getByLabel(l('eventTitle'), { exact: true }).fill(title);
            await form.getByLabel(l('dateMode'), { exact: true }).selectOption(mode);
            if (start) await form.getByLabel(l(mode === 'point' ? 'singleDate' : 'startDate'), { exact: true }).fill(start);
            if (end) await form.getByLabel(l('endDate'), { exact: true }).fill(end);
            await form.getByRole('button', { name: l('addEvent'), exact: true }).click();
        }
        const calendar = dialog.getByRole('region', { name: l('calendarView'), exact: true });
        assert.deepEqual(await calendar.getByRole('button').filter({ visible: true }).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['Visita', 'Corso', 'Tirocinio', 'Iscrizione'].map(title => `${l('eventDetails')}: ${title}`));
        await calendar.getByRole('button', { name: `${l('eventDetails')}: Tirocinio`, exact: true }).filter({ visible: true }).click();
        const event = dialog.locator('li[id^="timeline-"]');
        await event.getByLabel(l('planned'), { exact: true }).fill('Conoscere il lavoro');
        await event.getByLabel(l('diary'), { exact: true }).fill('Ho imparato ad ascoltare');
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === label && b.disabled), l('save'));
        await event.locator('summary').click();
        await calendar.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `/tmp/personal-calendar-${width}.png` });
        await page.reload();
        await calendar.getByRole('button', { name: `${l('eventDetails')}: Tirocinio`, exact: true }).filter({ visible: true }).click();
        await event.getByLabel(l('endDate'), { exact: true }).fill('2026-09-30');
        assert.equal(await event.getByLabel(l('planned'), { exact: true }).inputValue(), 'Conoscere il lavoro');
        assert.equal(await event.getByLabel(l('diary'), { exact: true }).inputValue(), 'Ho imparato ad ascoltare');
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === label && b.disabled), l('save'));
        assert.equal(control.visual.workspace.timeline.events.find(e => e.title === 'Tirocinio').end_date, '2026-09-30');
        const writes = control.requests.filter(r => r.method === 'PUT').length;
        await event.getByLabel(l('endDate'), { exact: true }).fill('2026-09-01');
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await dialog.getByRole('alert').filter({ hasText: l('dateError') }).waitFor();
        assert.equal(control.requests.filter(r => r.method === 'PUT').length, writes);
        assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('institutional calendar and details agree near midnight in the local timezone', async () => {
    const { page, context, control } = await fixture(390, 'intro', { timezone: 'Europe/Rome' });
    control.visual.workspace.timeline = { title: 'Percorso', events: [{ id: 'late', institution_event: 'open-day', title: 'Open day', period: '2026-11-10T23:30:00Z', tense: 'future', symbol: 'milestone', reflection: '', source: '', action_ids: [], portfolio: [] }] };
    try {
        await page.goto(`${origin}/profilo/timeline`);
        const button = page.getByRole('button', { name: 'Apri la tappa: Open day', exact: true }).filter({ visible: true });
        assert.match(await button.innerText(), /11\/11\/2026/);
        await button.click();
        assert.match(await page.locator('#timeline-late').getByLabel(visualLabel('it', 'period'), { exact: true }).inputValue(), /11\/11\/2026/);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('personal timeline preserves legacy text until explicitly placed on the calendar', async () => {
    const { page, context, control } = await fixture(390);
    const l = key => visualLabel('it', key === 'save' ? 'personalSave' : key);
    control.visual.workspace.timeline = { title: 'Il percorso', events: ['Prima', 'Dopo'].map((title, i) => ({ id: `event-${i}`, title, period: i ? 'Fra qualche mese' : 'Durante la scuola', tense: 'past', symbol: 'milestone', reflection: 'Ricordo originale', source: '', action_ids: [], portfolio: [] })) };
    try {
        await page.goto(`${origin}/profilo/timeline`);
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Dopo · Fra qualche mese', exact: true }).focus();
        await page.keyboard.press('Enter');
        const event = dialog.locator('li[id^="timeline-"]');
        await event.getByLabel(l('dateMode'), { exact: true }).selectOption('period');
        await event.getByLabel(l('endDate'), { exact: true }).fill('2026-12-01');
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === label && b.disabled), l('save'));
        assert.equal(control.visual.workspace.timeline.events.length, 2);
        const legacy = control.visual.workspace.timeline.events.find(e => e.id === 'event-0');
        assert.equal(legacy.period, 'Durante la scuola');
        assert.equal(legacy.reflection, 'Ricordo originale');
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const width of [390, 1280]) test(`personal area opens timeline without any session at ${width}px`, async () => {
    const { page, context, control } = await fixture(width);
    try {
        await page.goto(`${origin}/profilo`);
        await page.getByRole('link', { name: /Linea del tempo/ }).click();
        await page.getByRole('region', { name: visualLabel('it', 'calendarView'), exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.has('session'), false);
        assert.equal(await page.getByText('Scegli una sessione', { exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        control.failLoad = true;
        await page.reload();
        await page.getByRole('alert').filter({ hasText: visualLabel('it', 'loadError') }).waitFor();
        control.failLoad = false;
        await page.getByRole('button', { name: visualLabel('it', 'retry'), exact: true }).click();
        await page.getByRole('region', { name: visualLabel('it', 'calendarView'), exact: true }).waitFor();
    } finally { await context.close(); }
});

for (const width of [390, 1280]) test(`personal timeline integrates institution dates and tools at ${width}px`, async () => {
    const { page, context, control } = await fixture(width);
    try {
        await page.route('**/api/orientation-directory?*', route => route.fulfill({ json: { institution: { name: 'Istituto di prova' }, referrals: [], events: [
            { id: 'open-day', title: 'Open day dell’istituto', starts_at: '2026-11-10T10:00:00Z', registration_deadline: '2026-11-01T12:00:00Z', location: 'Aula magna', page_url: '' },
        ] } }));
        await page.goto(`${origin}/profilo/timeline`);
        await page.getByText(/Date di orientamento/).click();
        await page.getByRole('button', { name: 'Aggiungi appuntamento', exact: true }).click();
        await page.getByRole('button', { name: 'Aggiungi scadenza', exact: true }).click();
        await page.getByRole('button', { name: `${visualLabel('it', 'eventDetails')}: Open day dell’istituto`, exact: true }).filter({ visible: true }).first().click();
        const events = page.locator('li[id^="timeline-"]');
        assert.equal(await events.first().getByLabel('Titolo della tappa', { exact: true }).evaluate(el => el.readOnly), true);
        await events.first().getByRole('checkbox', { name: 'Taccuino', exact: true }).check();
        await events.first().getByRole('checkbox', { name: 'Libretto', exact: true }).check();
        assert.equal(await events.first().getByRole('link', { name: 'Taccuino', exact: true }).getAttribute('href'), '/profilo/taccuino');
        await page.getByRole('button', { name: visualLabel('it', 'personalSave'), exact: true }).click();
        await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === label && b.disabled), visualLabel('it', 'personalSave'));
        assert.equal(control.visual.workspace.timeline.events[0].institution_event, 'open-day');
        assert.equal(control.visual.workspace.timeline.events[0].institution_date, 'deadline');
        await page.screenshot({ path: `/tmp/personal-timeline-institution-${width}.png` });
        assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
    } finally { await context.close(); }
});
