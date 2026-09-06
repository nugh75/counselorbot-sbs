import { chatLayoutLabel } from '../src/lib/i18n-chat-layout.ts';
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
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: options.motion || 'reduce', hasTouch: Boolean(options.touch), isMobile: Boolean(options.touch) });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const control = { failSave: false, failLoad: false, failPdf: false, visual: { revision: 0, workspace: { actions: [], cards: [], comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' } } }, failDiagram: false, failPatch: false, failRender: false, failExport: false, saved: options.graph ? [{ source_text: reply, source_key: createHash('sha256').update(reply).digest('hex'), instruction: '', spec: graphSpec }] : [], requests: [], errors: [] };
    control.personal = { questionnaire_type: 'QSA', limits: { notebook: 600, booklet: 2000 }, sources: { actions: 'Strumenti visivi · Piano personale', cards: 'Strumenti visivi · Carte', comparison: 'Strumenti visivi · Confronto' }, notebook: { notes: 'Annotazione originale', goal: 'Organizzare lo studio' }, booklets: [{ id: 7, title: 'La mia scheda', data: { student_notes: 'Nota esistente' } }] };
    const catalog = {
        reading: [{ slug: 'test-book', title: 'Libro per la prova', why: 'Collegato al metodo di studio.', synopsis: 'SINOSSI COMPLETA DEL LIBRO', where: 'https://example.invalid/libro', languages: ['it', 'en'], warning: 'AVVERTENZA DEL LIBRO', status: 'proposed' }],
        strategy: [{ slug: 'test-strategy', name: 'Recupero attivo', description: 'Chiudi il testo e scrivi tre concetti.', recommended_when: 'Quando vuoi verificare cosa ricordi.', status: 'proposed' }],
    };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(({ locale, dark }) => { localStorage.setItem('cb_lang', locale || 'it'); localStorage.setItem('counselorbot_selected_counselor', '1'); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, options);
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        control.requests.push({ path: url.pathname, search: url.search, method: request.method(), body: request.postDataJSON() });
        let data = [];
        if (url.pathname === '/api/chat/stream') return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ display: 'Possiamo approfondire questo punto.' }) + '\n\ndata: ' + JSON.stringify({ done: true, response: 'Possiamo approfondire questo punto.', session_id: 'fixture' }) + '\n\n' });
        if (url.pathname === '/api/opencode/workspace') data = { key: 'fixture', api_available: true, session_id: 'opencode-fixture', needs_seed: false, history: [{ role: 'assistant', content: reply }] };
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
        else if (url.pathname === '/api/session/fixture/visual-tools') {
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
        } else if (url.pathname === '/api/session/fixture/visual-tools/pdf') {
            if (control.failPdf) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
        } else if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'fixture', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true }];
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

async function openVisual(page, label) {
    if (await page.locator('#guided-chat-title').count()) {
        const locale = await page.evaluate(() => localStorage.getItem('cb_lang'));
        await page.getByRole('button', { name: chatLayoutLabel(locale, 'options'), exact: true }).click();
    }
    await page.getByRole('button', { name: label, exact: true }).click();
}

for (const options of [{ width: 320, locale: 'it', touch: true }, { width: 390, locale: 'de', dark: true }, { width: 1440, locale: 'en' }]) {
    test(`visual workspace completes and restores work at ${options.width}px in ${options.locale}`, async () => {
        const { page, context, control } = await fixture(options.width, 'intro', options);
        const l = key => visualLabel(options.locale, key);
        try {
            await openVisual(page, l('open'));
            const dialog = page.getByRole('dialog', { name: l('title'), exact: true });
            await dialog.getByText(l('emptyBoard'), { exact: true }).waitFor();
            const bounds = await dialog.boundingBox();
            assert.deepEqual({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, { x: 0, y: 0, width: options.width, height: 844 }, 'visual tools fill the viewport');
            for (const button of await dialog.locator('button:visible').all()) {
                assert.equal((await button.innerText()).trim(), '', 'visual controls use icons');
                assert.equal((await button.boundingBox()).width, 44);
                assert.ok(await button.getAttribute('aria-label'));
            }
            await dialog.getByLabel(l('titleField'), { exact: true }).fill('Studiare un capitolo');
            await dialog.getByLabel(l('detail'), { exact: true }).fill('Venti minuti e poi richiamo libero');
            await dialog.getByRole('button', { name: l('addAction'), exact: true }).click();
            await dialog.getByRole('combobox', { name: `${l('move')}: Studiare un capitolo` }).selectOption('doing');
            const action = dialog.getByRole('region', { name: l('doing'), exact: true }).locator('article');
            await action.locator('summary').click();
            await action.getByLabel(l('reflection'), { exact: true }).fill('Ho ricordato tre concetti');
            await dialog.getByRole('tab', { name: l('comparison'), exact: true }).click();
            for (const title of ['Corso serale', 'Corso diurno']) {
                const creation = dialog.locator('details').filter({ has: page.locator('summary').filter({ hasText: l('addOption') }) });
                if (!(await creation.getAttribute('open') !== null)) await creation.locator('summary').click();
                await dialog.locator('form').filter({ has: page.getByRole('button', { name: l('addOption'), exact: true }) }).getByRole('textbox').fill(title);
                await dialog.getByRole('button', { name: l('addOption'), exact: true }).click();
            }
            const criteria = dialog.getByRole('region', { name: l('criteria'), exact: true });
            await criteria.locator('form input').fill('Tempo disponibile');
            await criteria.getByRole('button', { name: l('addCriterion'), exact: true }).click();
            const option = dialog.locator('article').first();
            await option.getByRole('textbox', { name: 'Tempo disponibile' }).fill('Compatibile con il lavoro');
            await option.getByRole('radio').check();
            await dialog.getByLabel(l('reason'), { exact: true }).fill('Posso frequentarlo');
            await dialog.getByRole('tab', { name: l('cards'), exact: true }).click();
            await dialog.getByLabel(l('cardText'), { exact: true }).fill('Preferisco esempi concreti');
            await dialog.getByRole('button', { name: l('addCard'), exact: true }).click();
            await dialog.locator('article select').selectOption('yes');
            await dialog.getByRole('button', { name: l('undo'), exact: true }).click();
            assert.equal(await dialog.locator('article select').inputValue(), 'unsorted');
            await dialog.locator('article select').selectOption('explore');
            await page.waitForFunction(() => document.activeElement?.tagName === 'SELECT' && document.activeElement.value === 'explore');
            await dialog.getByRole('button', { name: l('save'), exact: true }).click();
            await dialog.getByRole('status').filter({ hasText: l('saved') }).waitFor();
            assert.equal(control.visual.workspace.actions[0].stage, 'doing');
            assert.equal(control.visual.workspace.cards[0].bucket, 'explore');
            assert.equal(control.visual.workspace.comparison.cells[0].note, 'Compatibile con il lavoro');
            for (const button of await dialog.locator('button:visible').all()) {
                const box = await button.boundingBox();
                assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= options.width, `control fits: ${await button.textContent()}`);
            }
            assert.equal(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth), true);
            await dialog.getByRole('tab', { name: l('cards'), exact: true }).focus();
            await page.keyboard.press('ArrowLeft');
            assert.equal(await dialog.getByRole('tab', { name: l('comparison'), exact: true }).getAttribute('aria-selected'), 'true');
            await dialog.locator('button:visible').last().focus(); await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
            const download = page.waitForEvent('download');
            await dialog.getByRole('button', { name: l('export'), exact: true }).click();
            assert.equal((await download).suggestedFilename(), 'counselorbot_visual_tools.pdf');
            await dialog.getByRole('button', { name: l('discuss'), exact: true }).click();
            await dialog.waitFor({ state: 'detached' });
            assert.match(await page.locator('#guided-composer').inputValue(), /Posso frequentarlo/);
            assert.equal(control.requests.some(r => r.path === '/api/chat/stream'), false);
            await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
            await openVisual(page, l('open'));
            await dialog.getByLabel(l('titleField'), { exact: true }).nth(1).waitFor();
            assert.equal(await dialog.getByLabel(l('titleField'), { exact: true }).nth(1).inputValue(), 'Studiare un capitolo');
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('failed writes and revision conflicts retain the local draft', async () => {
    const { page, context, control } = await fixture(390);
    const l = key => visualLabel('it', key);
    try {
        control.failLoad = true;
        await openVisual(page, l('open'));
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('alert').waitFor();
        assert.ok(await dialog.getByRole('button', { name: l('save'), exact: true }).isDisabled());
        control.failLoad = false;
        await dialog.getByRole('button', { name: l('retry'), exact: true }).click();
        await dialog.getByLabel(l('titleField'), { exact: true }).fill('La mia attività');
        await dialog.getByRole('button', { name: l('addAction'), exact: true }).click();
        control.failSave = true;
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await dialog.getByRole('alert').waitFor();
        assert.equal(await dialog.getByLabel(l('titleField'), { exact: true }).nth(1).inputValue(), 'La mia attività');
        assert.equal(control.visual.revision, 0);
        control.failSave = false;
        control.visual.revision = 4;
        await dialog.getByRole('button', { name: l('retry'), exact: true }).click();
        await dialog.getByText(l('conflict'), { exact: true }).waitFor();
        const download = page.waitForEvent('download');
        await dialog.getByRole('button', { name: l('copyDownload'), exact: true }).click();
        assert.equal((await download).suggestedFilename(), 'counselorbot_visual_draft.txt');
        assert.equal(control.visual.workspace.actions.length, 0);
        page.once('dialog', d => d.accept());
        await dialog.getByRole('button', { name: l('reload'), exact: true }).click();
        await dialog.getByText(l('emptyBoard'), { exact: true }).waitFor();
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('the single conversation kebab opens full-page visual tools on Actions and preserves drafts', async () => {
    const { page, context, control } = await fixture(1440);
    const l = key => visualLabel('it', key);
    try {
        assert.equal(await page.getByRole('button', { name: l('organize'), exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Diagramma', exact: true }).count(), 1);
        const trigger = page.getByRole('button', { name: chatLayoutLabel('it', 'options'), exact: true });
        assert.equal(await page.locator('button[popovertarget]').count(), 1);
        const menu = page.getByRole('group', { name: chatLayoutLabel('it', 'options'), exact: true });
        await trigger.click();
        const dots = await trigger.locator('svg circle').evaluateAll(elements => elements.map(el => [el.getAttribute('cx'), el.getAttribute('cy')]));
        assert.equal(dots.length, 3);
        assert.equal(new Set(dots.map(dot => dot[0])).size, 1);
        assert.equal(new Set(dots.map(dot => dot[1])).size, 3);
        await menu.getByRole('button', { name: l('open'), exact: true }).click();
        const dialog = page.getByRole('dialog', { name: l('title'), exact: true });
        await dialog.getByLabel(l('titleField'), { exact: true }).fill('Una bozza ancora da completare');
        assert.equal(await dialog.getByRole('tab', { name: l('board'), exact: true }).getAttribute('aria-selected'), 'true');
        assert.equal(await menu.isVisible(), false);
        await dialog.getByRole('tab', { name: l('cards'), exact: true }).click();
        await dialog.getByRole('button', { name: l('close'), exact: true }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
        await trigger.click();
        await menu.getByRole('button', { name: l('open'), exact: true }).click();
        await dialog.getByLabel(l('titleField'), { exact: true }).waitFor();
        assert.equal(await dialog.getByRole('tab', { name: l('board'), exact: true }).getAttribute('aria-selected'), 'true');
        assert.equal(await dialog.getByLabel(l('titleField'), { exact: true }).inputValue(), 'Una bozza ancora da completare');
        const bounds = await dialog.boundingBox();
        assert.deepEqual(bounds, { x: 0, y: 0, width: 1440, height: 844 });
        assert.equal(control.requests.some(r => r.method !== 'GET' && r.path !== '/api/session/freeze'), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const width of [320, 1440]) {
    test(`one kebab and direct per-response audio and feedback at ${width}px`, async () => {
        const { page, context, control } = await fixture(width, 'intro', { feedback: true, longConversation: true });
        try {
            await page.evaluate(() => { window.Audio = class { play() { return Promise.resolve(); } pause() {} }; });
            assert.equal(await page.locator('button[popovertarget]').count(), 1);
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
            const stop = row.getByRole('button', { name: 'Stop Lettura', exact: true });
            await stop.waitFor();
            await stop.click();
            assert.equal(control.requests.find(r => r.path === '/api/tts').body.text, reply);
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

test('the shared visual workspace creates and saves an editable card without sending it', async () => {
    const { page, context, control } = await fixture(390);
    const l = key => visualLabel('it', key);
    try {
        await openVisual(page, l('open'));
        await page.getByRole('tab', { name: l('cards'), exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('textbox', { name: l('cardText'), exact: true }).waitFor();
        assert.equal(await dialog.getByRole('textbox', { name: l('cardText'), exact: true }).inputValue(), '');
        await dialog.getByRole('textbox', { name: l('cardText'), exact: true }).fill('Voglio verificare ciò che ricordo');
        await dialog.getByRole('button', { name: l('addCard'), exact: true }).click();
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await dialog.getByRole('status').filter({ hasText: l('saved') }).waitFor();
        assert.equal(control.visual.workspace.cards[0].text, 'Voglio verificare ciò che ricordo');
        assert.equal(control.visual.workspace.cards[0].bucket, 'unsorted');
        assert.equal(control.requests.some(r => r.path === '/api/chat/stream' || r.path === '/api/diagram/from-message'), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('suggested material can seed a plan without changing recommendation state, and PDF retry works', async () => {
    const { page, context, control } = await fixture(390);
    const l = key => visualLabel('it', key);
    try {
        await openVisual(page, l('open'));
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('combobox', { name: l('fromCatalog'), exact: true }).selectOption('strategy:test-strategy');
        assert.equal(await dialog.getByLabel(l('titleField'), { exact: true }).inputValue(), 'Recupero attivo');
        await dialog.getByRole('button', { name: l('addAction'), exact: true }).click();
        await dialog.getByRole('button', { name: l('close'), exact: true }).click();
        await openVisual(page, l('open'));
        assert.equal(await dialog.getByLabel(l('titleField'), { exact: true }).nth(1).inputValue(), 'Recupero attivo');
        control.failPdf = true;
        await dialog.getByRole('button', { name: l('export'), exact: true }).click();
        await dialog.getByText(l('exportError'), { exact: true }).waitFor();
        control.failPdf = false;
        const download = page.waitForEvent('download');
        await dialog.getByRole('button', { name: l('retry'), exact: true }).click();
        assert.equal((await download).suggestedFilename(), 'counselorbot_visual_tools.pdf');
        await dialog.getByRole('alert').waitFor({ state: 'detached' });
        assert.equal(control.requests.some(r => r.method === 'PATCH'), false);
        assert.equal(control.visual.workspace.actions[0].source, 'Recupero attivo');
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('OpenCode graphical chat restores the same session workspace and accepts its handoff', async () => {
    const { page, context, control } = await fixture(390, 'intro', { experience: 'opencode' });
    const l = key => visualLabel('it', key);
    try {
        control.visual.workspace.cards = [{ id: 'card-opencode', text: 'La mia riflessione', source: '', bucket: 'yes' }];
        await openVisual(page, l('open'));
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('tab', { name: l('cards'), exact: true }).click();
        await dialog.locator('article textarea').waitFor();
        assert.equal(await dialog.locator('article textarea').inputValue(), 'La mia riflessione');
        await dialog.getByRole('button', { name: l('discuss'), exact: true }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.match(await page.locator('#opencode-composer').inputValue(), /La mia riflessione/);
        assert.equal(control.requests.some(r => r.path.includes('/message') && r.method === 'POST'), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('completed sessions keep visual export available without offering a missing composer', async () => {
    const { page, context, control } = await fixture(390, 'conclusion');
    const l = key => visualLabel('it', key);
    try {
        await openVisual(page, l('open'));
        const dialog = page.getByRole('dialog');
        await dialog.getByText(l('emptyBoard'), { exact: true }).waitFor();
        assert.equal(await dialog.getByRole('button', { name: l('discuss'), exact: true }).count(), 0);
        assert.equal(await dialog.getByRole('button', { name: l('export'), exact: true }).count(), 1);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('a delayed earlier load cannot replace edits made after reopening the panel', async () => {
    const { page, context, control } = await fixture(390);
    const l = key => visualLabel('it', key);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    let started;
    const firstRead = new Promise(resolve => { started = resolve; });
    control.deferRead = () => { started(); return pending; };
    try {
        await openVisual(page, l('open'));
        await firstRead;
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: l('close'), exact: true }).click();
        await openVisual(page, l('open'));
        await dialog.getByLabel(l('titleField'), { exact: true }).fill('Conserva questa bozza');
        await dialog.getByRole('button', { name: l('addAction'), exact: true }).click();
        const response = page.waitForResponse(r => r.url().endsWith('/visual-tools') && r.request().method() === 'GET');
        release(); await response;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await dialog.locator('article input').count(), 1);
        assert.equal(await dialog.locator('article input').inputValue(), 'Conserva questa bozza');
        assert.deepEqual(control.errors, []);
    } finally { release(); await context.close(); }
});

for (const locale of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`visual tools explain purpose, steps and examples on touch in ${locale}`, async () => {
        const { page, context, control } = await fixture(320, 'intro', { locale, touch: true, dark: locale === 'de' });
        const l = key => visualLabel(locale, key);
        try {
            await openVisual(page, l('open'));
            const dialog = page.getByRole('dialog', { name: l('title'), exact: true });
            const help = dialog.getByRole('region', { name: l('howTo'), exact: true });
            for (const tab of ['board', 'comparison', 'cards']) {
                await dialog.getByRole('tab', { name: l(tab), exact: true }).click();
                await help.getByText(l(`${tab}Purpose`), { exact: true }).waitFor();
                assert.equal(await help.locator('li').count(), 3);
                for (const key of [`${tab}Step1`, `${tab}Step2`, `${tab}Step3`, `${tab}Example`, 'saveHelp', 'discussHelp', 'exportHelp', 'undoHelp']) {
                    assert.notEqual(l(key), key, `translated ${locale}:${key}`);
                    assert.ok(await help.getByText(l(key), { exact: key !== `${tab}Example` }).isVisible());
                }
                await help.locator('summary').tap();
                assert.ok(await help.getByText(l(`${tab}Purpose`), { exact: true }).isVisible());
                assert.equal(await help.locator('li').first().isVisible(), false);
                await help.locator('summary').tap();
                assert.ok(await help.locator('li').first().isVisible());
                await help.getByRole('button', { name: l('startWorking'), exact: true }).tap();
                await page.waitForFunction(() => document.activeElement === document.querySelector('[role="dialog"] form')?.closest('details')?.querySelector('summary'));
                assert.equal(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth), true);
                const box = await help.locator('summary').boundingBox();
                assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= 320);
            }
            // Each tab retains its own collapsed help while the workspace stays open.
            await dialog.getByRole('tab', { name: l('board'), exact: true }).click();
            assert.equal(await help.locator('li').first().isVisible(), false);
            // The chat may auto-freeze while the help is read; the tools must not write.
            assert.equal(control.requests.some(r => r.method !== 'GET' && r.path !== '/api/session/freeze'), false);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('keyboard tooltips explain actions and Escape dismisses help before the workspace', async () => {
    const { page, context, control } = await fixture(1440);
    const l = key => visualLabel('it', key);
    try {
        await openVisual(page, l('open'));
        const dialog = page.getByRole('dialog', { name: l('title'), exact: true });
        await dialog.getByLabel(l('titleField'), { exact: true }).fill('Una piccola prova');
        await dialog.getByRole('button', { name: l('addAction'), exact: true }).click();
        for (const key of ['save', 'undo', 'export', 'discuss']) {
            await dialog.getByRole('button', { name: l(key), exact: true }).focus();
            const tooltip = page.getByRole('tooltip');
            await tooltip.waitFor();
            assert.equal(await tooltip.textContent(), l(`${key}Help`));
            await page.keyboard.press('Escape');
            await tooltip.waitFor({ state: 'detached' });
            assert.ok(await dialog.isVisible());
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        // The chat may auto-freeze while the help is read; the tools must not write.
        assert.equal(control.requests.some(r => r.method !== 'GET' && r.path !== '/api/session/freeze'), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const options of [{ width: 320, locale: 'it', touch: true }, { width: 390, locale: 'de', touch: true, dark: true }, { width: 1024, locale: 'sv' }, { width: 1440, locale: 'en' }]) {
    test(`chat keeps secondary tools with resources at ${options.width}px`, async () => {
        const { page, context, control } = await fixture(options.width, 'intro', { ...options, openResources: false });
        const l = key => chatLayoutLabel(options.locale, key);
        try {
            const chat = page.getByRole('region', { name: 'CounselorBot AI', exact: true });
            const panel = page.getByRole('complementary', { name: l('panelTitle'), exact: true });
            const header = chat.locator('header');
            assert.equal(await header.getByRole('button', { name: visualLabel(options.locale, 'open'), exact: true }).count(), 0);
            assert.equal(await header.getByRole('button', { name: l('hide'), exact: true }).count(), 0);
            await page.locator('#guided-composer').fill('Una bozza da conservare');
            if (options.width < 1024) {
                assert.equal(await panel.count(), 0, 'resources do not occupy space below the chat');
                await openVisual(page, visualLabel(options.locale, 'open'));
                const dialog = page.getByRole('dialog', { name: visualLabel(options.locale, 'title'), exact: true });
                await dialog.getByRole('button', { name: visualLabel(options.locale, 'close'), exact: true }).click();
                await dialog.waitFor({ state: 'detached' });
                const trigger = page.getByRole('button', { name: l('options'), exact: true });
                assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
            } else {
                assert.equal(await panel.getByRole('button', { name: visualLabel(options.locale, 'open'), exact: true }).count(), 0, 'visual tools are absent from the sidebar');
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
            await page.locator('[popover]:popover-open').getByRole('button', { name: new RegExp(`^${l('panelTitle')}`) }).click();
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
    test(`personal transfers require selection, preserve notes and import explicitly at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        const l = key => visualLabel('it', key);
        try {
            control.visual.workspace.cards.push({ id: 'card1', text: 'Gli esempi aiutano', bucket: 'yes', source: '' });
            await openVisual(page, l('open'));
            const dialog = page.getByRole('dialog', { name: l('title'), exact: true });
            control.failPersonal = true;
            await dialog.getByRole('button', { name: l('personalLinks'), exact: true }).click();
            await dialog.getByRole('button', { name: l('reloadPersonal'), exact: true }).waitFor();
            control.failPersonal = false;
            await dialog.getByRole('button', { name: l('reloadPersonal'), exact: true }).click();
            await dialog.getByLabel(l('chooseContent'), { exact: true }).selectOption('cards:card1');
            await dialog.getByLabel(l('reviewTransfer'), { exact: true }).fill('Testo scelto e rivisto');
            assert.equal(control.requests.filter(r => r.path.endsWith('/personal') && r.method === 'POST').length, 0);
            assert.match(await dialog.locator('details').innerText(), /Annotazione originale/);
            control.personal.notebook.notes = 'Annotazione originale aggiornata';
            await dialog.getByRole('button', { name: l('savePersonal'), exact: true }).click();
            await dialog.getByText(l('personalConflict'), { exact: false }).waitFor();
            await dialog.getByRole('button', { name: l('reloadPersonal'), exact: true }).click();
            await dialog.getByText('Annotazione originale aggiornata', { exact: false }).waitFor();
            assert.equal(await dialog.getByLabel(l('reviewTransfer'), { exact: true }).inputValue(), 'Testo scelto e rivisto');
            await dialog.getByRole('button', { name: l('savePersonal'), exact: true }).click();
            await dialog.getByText(l('personalSaved'), { exact: true }).waitFor();
            assert.match(control.personal.notebook.notes, /^Annotazione originale aggiornata\n\nTesto scelto e rivisto/);
            await dialog.getByRole('button', { name: l('savePersonal'), exact: true }).click();
            await dialog.getByText(l('personalDuplicate'), { exact: true }).waitFor();
            await dialog.getByLabel(l('reviewTransfer'), { exact: true }).fill('x'.repeat(601));
            assert.equal(await dialog.getByRole('button', { name: l('savePersonal'), exact: true }).isEnabled(), false);
            await dialog.getByLabel(l('reviewTransfer'), { exact: true }).fill('Un impegno');
            await dialog.getByLabel(l('destination'), { exact: true }).selectOption('booklet');
            await dialog.getByLabel(l('bookletSheet'), { exact: true }).selectOption('7');
            await dialog.getByRole('button', { name: l('savePersonal'), exact: true }).click();
            await dialog.getByText(l('personalSaved'), { exact: true }).waitFor();
            assert.match(control.personal.booklets[0].data.student_notes, /^Nota esistente\n\nUn impegno/);
            await dialog.getByLabel(l('bookletSheet'), { exact: true }).selectOption('');
            await dialog.getByLabel(l('reviewTransfer'), { exact: true }).fill('Nuova riflessione');
            await dialog.getByRole('button', { name: l('savePersonal'), exact: true }).click();
            await dialog.getByText(l('personalSaved'), { exact: true }).waitFor();
            assert.equal(control.personal.booklets.length, 2);
            await dialog.getByLabel(l('transferDirection'), { exact: true }).selectOption('in');
            await dialog.getByLabel(l('chooseContent'), { exact: true }).selectOption('notebook_goal');
            await dialog.getByLabel(l('reviewTransfer'), { exact: true }).fill('Organizzare una prova');
            control.failSave = true;
            await dialog.getByRole('button', { name: l('saveVisual'), exact: true }).click();
            await dialog.getByText(l('personalSaveError'), { exact: true }).waitFor();
            assert.equal(await dialog.getByLabel(l('reviewTransfer'), { exact: true }).inputValue(), 'Organizzare una prova');
            control.failSave = false;
            await dialog.getByRole('button', { name: l('saveVisual'), exact: true }).click();
            await dialog.getByText(l('personalImported'), { exact: true }).waitFor();
            assert.equal(control.visual.workspace.cards.at(-1).text, 'Organizzare una prova');
            assert.match(control.visual.workspace.cards.at(-1).source, /Taccuino/);
            await dialog.getByRole('button', { name: l('saveVisual'), exact: true }).click();
            await dialog.getByText(l('personalDuplicate'), { exact: true }).waitFor();
            assert.equal(control.visual.workspace.cards.length, 2);
            await dialog.getByLabel(l('chooseContent'), { exact: true }).selectOption('booklet_7_student_notes');
            await dialog.getByLabel(l('destination'), { exact: true }).selectOption('actions');
            await dialog.getByLabel(l('titleField'), { exact: true }).fill('Provare una strategia');
            await dialog.getByLabel(l('reviewTransfer'), { exact: true }).fill('Parto dalla riflessione nel libretto');
            await dialog.getByRole('button', { name: l('saveVisual'), exact: true }).click();
            await dialog.getByText(l('personalImported'), { exact: true }).waitFor();
            assert.equal(control.visual.workspace.actions[0].stage, 'todo');
            assert.match(control.visual.workspace.actions[0].source, /Libretto/);
            await dialog.getByLabel(l('destination'), { exact: true }).selectOption('comparison');
            await dialog.getByLabel(l('reviewTransfer'), { exact: true }).fill('Una possibile alternativa');
            await dialog.getByRole('button', { name: l('saveVisual'), exact: true }).click();
            await dialog.getByText(l('personalImported'), { exact: true }).waitFor();
            assert.equal(control.visual.workspace.comparison.options[0].title, 'Una possibile alternativa');
            assert.equal(control.visual.workspace.comparison.chosen, null);
            await dialog.getByRole('heading', { name: l('personalLinks'), exact: true }).scrollIntoViewIfNeeded();
            assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
            await page.screenshot({ path: `/tmp/visual-personal-${width}.png`, fullPage: true });
            assert.deepEqual(control.errors, []);
        } catch (error) { await page.screenshot({ path: `/tmp/visual-personal-failure-${width}.png` }); console.error(await page.getByRole('dialog').innerText()); throw error; } finally { await context.close(); }
    });
}

for (const width of [320, 1440]) {
    test(`chat menu labels tools and paints its tooltip above the native popover at ${width}px`, async () => {
        const { page, context } = await fixture(width);
        try {
            await page.getByRole('button', { name: chatLayoutLabel('it', 'options'), exact: true }).click();
            const menu = page.locator('.chat-options:popover-open');
            const tools = menu.getByRole('button', { name: visualLabel('it', 'open'), exact: true });
            assert.equal((await tools.innerText()).trim(), 'Strumenti');
            assert.ok((await menu.locator('button').first().getAttribute('class')).startsWith(await tools.getAttribute('class')), 'same row styling as adjacent menu entries');
            await tools.focus();
            const tooltip = page.locator('[data-radix-popper-content-wrapper]').filter({ has: page.getByRole('tooltip', { name: visualLabel('it', 'open'), exact: true }) });
            await tooltip.waitFor({ state: 'visible' });
            assert.equal(await tooltip.evaluate(el => {
                const r = el.getBoundingClientRect();
                const front = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return el.contains(front);
            }), true, 'tooltip is actually painted above the menu');
            await page.screenshot({ path: `/tmp/chat-menu-tooltip-${width}.png` });
            await tools.click();
            await page.getByRole('dialog', { name: visualLabel('it', 'title'), exact: true }).waitFor();
        } finally { await context.close(); }
    });
}
