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
        else if (url.pathname === '/api/session/frozen/fixture') data = { session_id: 'fixture', questionnaire_type: 'QSA', current_phase: phase, counselor_id: 1, experience: options.experience || 'standard', scores: { C1: 7 }, messages: [{ role: 'system', content: phase === 'intro' ? '--- Introduzione ---' : 'FINE PERCORSO' }, { role: 'user', content: 'Vorrei organizzarmi.' }, ...Array.from({ length: options.longConversation ? 20 : 1 }, () => ({ role: 'assistant', content: reply }))] };
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

for (const options of [{ width: 320, locale: 'it', touch: true }, { width: 390, locale: 'de', dark: true }, { width: 1440, locale: 'en' }]) {
    test(`visual workspace completes and restores work at ${options.width}px in ${options.locale}`, async () => {
        const { page, context, control } = await fixture(options.width, 'intro', options);
        const l = key => visualLabel(options.locale, key);
        try {
            await page.getByRole('button', { name: l('open'), exact: true }).click();
            const dialog = page.getByRole('dialog', { name: l('title'), exact: true });
            await dialog.getByText(l('emptyBoard'), { exact: true }).waitFor();
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
            await page.getByRole('button', { name: l('open'), exact: true }).click();
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
        await page.getByRole('button', { name: l('open'), exact: true }).click();
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

test('organizing a message creates an editable card with its source, without sending it', async () => {
    const { page, context, control } = await fixture(390);
    const l = key => visualLabel('it', key);
    try {
        await page.getByRole('button', { name: l('organize'), exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('textbox', { name: l('cardText'), exact: true }).waitFor();
        assert.equal(await dialog.getByRole('textbox', { name: l('cardText'), exact: true }).inputValue(), reply);
        await dialog.getByRole('textbox', { name: l('cardText'), exact: true }).fill('Voglio verificare ciò che ricordo');
        await dialog.getByRole('button', { name: l('addCard'), exact: true }).click();
        await dialog.getByRole('button', { name: l('save'), exact: true }).click();
        await dialog.getByRole('status').filter({ hasText: l('saved') }).waitFor();
        assert.equal(control.visual.workspace.cards[0].source, l('fromChat'));
        assert.equal(control.visual.workspace.cards[0].bucket, 'unsorted');
        assert.equal(control.requests.some(r => r.path === '/api/chat/stream' || r.path === '/api/diagram/from-message'), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('suggested material can seed a plan without changing recommendation state, and PDF retry works', async () => {
    const { page, context, control } = await fixture(390);
    const l = key => visualLabel('it', key);
    try {
        await page.getByRole('button', { name: l('open'), exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('combobox', { name: l('fromCatalog'), exact: true }).selectOption('strategy:test-strategy');
        assert.equal(await dialog.getByLabel(l('titleField'), { exact: true }).inputValue(), 'Recupero attivo');
        await dialog.getByRole('button', { name: l('addAction'), exact: true }).click();
        await dialog.getByRole('button', { name: l('close'), exact: true }).click();
        await page.getByRole('button', { name: l('open'), exact: true }).click();
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
        await page.getByRole('button', { name: l('open'), exact: true }).click();
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
        await page.getByRole('button', { name: l('open'), exact: true }).click();
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
        await page.getByRole('button', { name: l('open'), exact: true }).click();
        await firstRead;
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: l('close'), exact: true }).click();
        await page.getByRole('button', { name: l('open'), exact: true }).click();
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
            await page.getByRole('button', { name: l('open'), exact: true }).click();
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
            assert.equal(control.requests.some(r => r.method !== 'GET'), false);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('keyboard tooltips explain actions and Escape dismisses help before the workspace', async () => {
    const { page, context, control } = await fixture(1440);
    const l = key => visualLabel('it', key);
    try {
        await page.getByRole('button', { name: l('open'), exact: true }).click();
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
        assert.equal(control.requests.some(r => r.method !== 'GET'), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const options of [{ width: 320, locale: 'it', touch: true }, { width: 390, locale: 'de', touch: true, dark: true }, { width: 1024, locale: 'sv' }, { width: 1440, locale: 'en' }]) {
    test(`chat keeps tools in its header and its panel ${options.width < 1024 ? 'below' : 'beside'} it at ${options.width}px`, async () => {
        const { page, context, control } = await fixture(options.width, 'intro', options);
        const l = key => chatLayoutLabel(options.locale, key);
        try {
            const chat = page.getByRole('region', { name: 'CounselorBot AI', exact: true });
            const panel = page.getByRole('complementary', { name: l('panelTitle'), exact: true });
            const header = chat.locator('header');
            await header.getByRole('button', { name: visualLabel(options.locale, 'open'), exact: true }).waitFor();
            assert.equal(await chat.getByRole('button', { name: visualLabel(options.locale, 'open'), exact: true }).count(), 1);
            assert.equal(await header.getByRole('button', { name: visualLabel(options.locale, 'open'), exact: true }).textContent(), visualLabel(options.locale, 'tools'));
            await page.locator('#guided-composer').fill('Una bozza da conservare');
            if (options.width < 1024) {
                assert.ok((await panel.boundingBox()).y >= (await chat.boundingBox()).y + (await chat.boundingBox()).height);
                await header.getByRole('button', { name: l('show'), exact: true }).click();
                assert.equal(await page.getByRole('dialog').count(), 0, 'mobile panel stays in the page');
                assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
                assert.ok((await panel.boundingBox()).y >= (await chat.boundingBox()).y + (await chat.boundingBox()).height);
                await panel.getByRole('button', { name: l('panelTitle'), exact: true }).click();
                assert.equal(await header.getByRole('button', { name: l('show'), exact: true }).getAttribute('aria-expanded'), 'false');
            } else {
                const original = await chat.boundingBox();
                assert.ok((await panel.boundingBox()).x < original.x);
                await header.getByRole('button', { name: l('hide'), exact: true }).click();
                assert.equal(await panel.isVisible(), false);
                assert.ok((await chat.boundingBox()).width > original.width + 250);
            }
            assert.ok(await header.getByLabel(`${l('resources')}: 2`, { exact: true }).isVisible());
            assert.equal(await page.locator('#guided-composer').inputValue(), 'Una bozza da conservare');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(control.requests.some(r => r.path === '/api/chat/stream'), false);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('desktop panel resizes with buttons, keyboard and pointer and remembers width and visibility', async () => {
    const { page, context, control } = await fixture(1440);
    const l = key => chatLayoutLabel('it', key);
    try {
        const panel = page.getByRole('complementary', { name: l('panelTitle'), exact: true });
        const separator = page.getByRole('separator', { name: l('resize'), exact: true });
        await separator.waitFor();
        const waitWidth = value => page.waitForFunction(value => { const separator = document.querySelector('[role="separator"]'); return separator?.getAttribute('aria-valuenow') === String(value) && separator.previousElementSibling.getBoundingClientRect().width === Number(value); }, value);
        const original = (await panel.boundingBox()).width;
        await panel.getByRole('button', { name: l('widen'), exact: true }).click();
        await page.waitForFunction(({ label, original }) => document.querySelector(`aside[aria-label="${label}"]`)?.getBoundingClientRect().width > original, { label: l('panelTitle'), original });
        await panel.getByRole('button', { name: l('narrow'), exact: true }).click();
        await page.waitForFunction(({ label, original }) => document.querySelector(`aside[aria-label="${label}"]`)?.getBoundingClientRect().width === original, { label: l('panelTitle'), original });
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
        assert.ok(resized >= 329 && resized <= 331);
        await page.getByRole('button', { name: l('hide'), exact: true }).click();
        await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
        assert.equal(await panel.isVisible(), false);
        await page.getByRole('button', { name: l('show'), exact: true }).click();
        assert.equal(Number(await separator.getAttribute('aria-valuenow')), resized);
        await page.setViewportSize({ width: 1024, height: 844 });
        assert.ok((await page.getByRole('region', { name: 'CounselorBot AI', exact: true }).boundingBox()).width >= 420);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: l('show'), exact: true }).waitFor();
        assert.equal(await separator.count(), 0);
        await page.setViewportSize({ width: 1440, height: 844 });
        await separator.waitFor();
        assert.equal(Number(await separator.getAttribute('aria-valuenow')), resized);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('step navigation stays above the composer while a long conversation scrolls, and advances once', async () => {
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
        assert.ok(before.y + before.height <= (await composer.boundingBox()).y);
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
