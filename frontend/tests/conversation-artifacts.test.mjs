import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.ARTIFACTS_BASE_URL || 'http://127.0.0.1:3000').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const reply = 'Scegli un obiettivo, studia e verifica quello che ricordi.';
const spec = { type: 'flow', title: 'Piano di studio e verifica dei risultati', nodes: [{ id: 'a', label: 'Obiettivo' }, { id: 'b', label: 'Verifica' }], edges: [{ from: 'a', to: 'b' }] };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180"><g class="node"><title>a</title><text x="40" y="40">Obiettivo</text></g><g class="edge"><title>a-&gt;b</title><path d="M60 50V100" stroke="#17747a"/></g><g class="node"><title>b</title><text x="40" y="130">Verifica</text></g></svg>';
const graphSpec = JSON.parse(readFileSync(new URL('./fixtures/reading-diagram.json', import.meta.url), 'utf8'));
const semanticSpec = JSON.parse(readFileSync(new URL('./fixtures/semantic-diagram.json', import.meta.url), 'utf8'));
const factorSpec = JSON.parse(readFileSync(new URL('./fixtures/factor-diagram.json', import.meta.url), 'utf8'));

async function openMessageDiagram(page) {
    const menu = page.getByRole('button', { name: 'Azioni del messaggio', exact: true });
    if (await menu.count()) await menu.first().click();
    await page.getByRole('button', { name: 'Diagramma', exact: true }).click();
}

async function fixture(width, phase = 'intro', options = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: options.motion || 'reduce', hasTouch: Boolean(options.touch), isMobile: Boolean(options.touch) });
    const page = await context.newPage();
    const fixtureName = options.factor ? 'factor' : options.semantic ? 'semantic' : options.graph ? 'reading' : null;
    const fixtureSpec = options.factor ? factorSpec : options.semantic ? semanticSpec : options.graph ? graphSpec : spec;
    const control = { failDiagram: false, failPatch: false, failRender: false, failExport: false, saved: fixtureName ? [{ source_text: reply, source_key: createHash('sha256').update(reply).digest('hex'), instruction: '', spec: fixtureSpec }] : [], requests: [], errors: [] };
    const catalog = {
        advice: [{ slug: 'question-one', kind: 'question', name: 'Quale episodio ti viene in mente?', status: 'proposed' }, { slug: 'advice-one', kind: 'advice', name: 'Riserva dieci minuti al progetto.', status: 'proposed' }],
        reading: [{ slug: 'test-book', title: 'Libro per la prova', why: 'Collegato al metodo di studio.', synopsis: 'SINOSSI COMPLETA DEL LIBRO', where: 'https://example.invalid/libro', languages: ['it', 'en'], warning: 'AVVERTENZA DEL LIBRO', status: 'proposed' }],
        strategy: [{ slug: 'test-strategy', name: 'Recupero attivo', description: 'Chiudi il testo e scrivi tre concetti.', recommended_when: 'Quando vuoi verificare cosa ricordi.', status: 'proposed' }],
    };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(({ locale, dark }) => { localStorage.setItem('cb_lang', locale || 'it'); localStorage.setItem('counselorbot_selected_counselor', '1'); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, options);
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        control.requests.push({ path: url.pathname, search: url.search, method: request.method(), body: request.postDataJSON() });
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'fixture', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true }, { id: 2, slug: 'second', name: 'Secondo counselor', language: ['it'], suitable: true }];
        else if (url.pathname === '/api/session/frozen/fixture') data = { session_id: 'fixture', questionnaire_type: 'QSA', current_phase: phase, counselor_id: 1, experience: 'standard', scores: { C1: 7 }, messages: [{ role: 'system', content: phase === 'intro' ? '--- Introduzione ---' : 'FINE PERCORSO' }, { role: 'user', content: 'Vorrei organizzarmi.' }, { role: 'assistant', content: reply }] };
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro', suggested_questions: ['Mi riconosco soprattutto in…'] }], text_guided_conclusion: 'FINE PERCORSO' };
        else if (url.pathname === '/api/chat/stream') return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"done":true,"response":"Proseguiamo."}\n\n' });
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
            control.saved = [{ source_text: body.source_text, source_key: createHash('sha256').update(body.source_text.trim()).digest('hex'), instruction: body.instruction, spec: fixtureSpec }];
            data = fixtureSpec;
        } else if (url.pathname === '/api/diagram/render') {
            const body = request.postDataJSON();
            if (control.failRender || (body.embed_title && control.failExport)) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ contentType: body.format === 'png' ? 'image/png' : 'image/svg+xml', body: fixtureName
                ? readFileSync(new URL(`./fixtures/${fixtureName}-diagram-${body.theme}.${body.format}`, import.meta.url)) : svg });
        }
        else if (url.pathname.endsWith('/summary')) data = { summary: '## Scelta finale\nProverò il recupero attivo per una settimana.', status: 'ready' };
        else if (url.pathname.endsWith('/pdf')) return route.fulfill({ contentType: 'application/pdf', headers: { 'X-Summary-Status': 'ready' }, body: '%PDF-1.4\n%%EOF' });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
    return { page, context, control };
}

test('semantic icons and an icon-free node survive restore and export', async () => {
    const { page, context, control } = await fixture(390, 'intro', { semantic: true });
    try {
        const figure = page.locator('figure');
        await figure.locator('svg g.node').first().waitFor();
        assert.equal(await figure.locator('svg g.node').count(), 3);
        assert.equal(await figure.locator('svg g.node svg').count(), 2);
        const renderRequest = control.requests.find(request => request.path === '/api/diagram/render');
        assert.deepEqual(renderRequest.body.spec.nodes.map(node => node.icon ?? null), ['calendar', null, 'review']);
        await figure.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        const download = page.waitForEvent('download');
        await figure.getByRole('button', { name: 'Scarica SVG', exact: true }).click();
        await download;
        const exported = control.requests.find(request => request.path === '/api/diagram/render' && request.body.embed_title);
        assert.equal(exported.body.spec.nodes[1].label, 'Obiettivo non ancora raggiunto');
        assert.equal(exported.body.spec.nodes[0].icon, 'calendar');
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('factor references without model icons reach rendering and export', async () => {
    const { page, context, control } = await fixture(390, 'intro', { factor: true, dark: true });
    try {
        const figure = page.locator('figure');
        await figure.locator('svg g.node').first().waitFor();
        assert.equal(await figure.locator('svg g.node svg').count(), 2);
        const request = control.requests.find(request => request.path === '/api/diagram/render');
        assert.equal(request.body.spec.questionnaire_type, 'QSA');
        assert.deepEqual(request.body.spec.nodes.map(node => node.factor), ['QSA:A6', 'QSA:A3']);
        await figure.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        const download = page.waitForEvent('download');
        await figure.getByRole('button', { name: 'Scarica SVG', exact: true }).click();
        await download;
        const exported = control.requests.find(request => request.path === '/api/diagram/render' && request.body.embed_title);
        assert.equal(exported.body.spec.nodes[0].factor, 'QSA:A6');
        assert.equal(exported.body.spec.nodes[0].label, 'Percezione di competenza bassa');
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const width of [320, 390, 1440]) {
    test(`message diagrams persist and controls fit at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        try {
            await openMessageDiagram(page);
            const send = page.locator('form').filter({ has: page.locator('input[maxlength="400"]') }).locator('button[type="submit"]');
            await send.click();
            await page.locator('figure svg g.node').first().waitFor();
            const buttons = page.locator('figure button:visible');
            for (const button of await buttons.all()) {
                await button.scrollIntoViewIfNeeded();
                const box = await button.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width, 'diagram control fits viewport');
                assert.equal((await button.innerText()).trim(), '', 'diagram controls use icons');
                assert.equal(box.width, 44);
                assert.ok(await button.getAttribute('aria-label'));
            }
            await page.getByRole('button', { name: 'Apri il diagramma a schermo intero' }).click();
            const dialog = page.getByRole('dialog');
            await dialog.waitFor();
            for (const button of await dialog.locator('button:visible').all()) {
                const box = await button.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width, 'fullscreen control fits viewport');
            }
            await page.keyboard.press('Escape');
            control.failDiagram = true;
            await send.click();
            await page.getByRole('alert').filter({hasText:'Il servizio non risponde'}).waitFor();
            assert.equal(await page.locator('figure svg g.node').count(), 2, 'last valid diagram remains');
            await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
            await page.locator('figure svg g.node').first().waitFor();
            assert.equal(await page.locator('figure svg g.node').count(), 2, 'saved diagram restored');
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('recommendation actions save per item, retry, and hand a prompt to the composer', async () => {
    const { page, context, control } = await fixture(390);
    try {
        await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
        await page.getByRole('button', { name: 'Per te', exact: true }).click();
        const panel = page.locator('#guided-recommendations-panel');
        await panel.getByRole('link', { name: 'https://example.invalid/libro' }).waitFor();
        await panel.getByRole('button', { name: 'Leggi la sintesi' }).click();
        assert.equal(await panel.getByText('SINOSSI COMPLETA DEL LIBRO').isVisible(), true);
        assert.equal(await panel.getByText('AVVERTENZA DEL LIBRO', { exact: false }).isVisible(), true);
        control.failPatch = true;
        await panel.getByRole('button', { name: 'Mi interessa', exact: true }).click();
        await panel.getByRole('alert').waitFor();
        control.failPatch = false;
        await panel.getByRole('button', { name: 'Riprova', exact: true }).click();
        await panel.getByRole('alert').waitFor({ state: 'detached' });
        await panel.getByRole('button', { name: 'Riprendi in chat', exact: true }).click();
        assert.match(await page.locator('#guided-composer').inputValue(), /Libro per la prova/);
        assert.equal(control.requests.some(request => request.path === '/api/chat/stream'), false, 'discussion action does not send automatically');
        await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
        await page.getByRole('button', { name: 'Per te', exact: true }).click();
        await panel.getByRole('tab', { name: /Strategie/ }).click();
        await panel.getByRole('button', { name: 'Voglio provarla', exact: true }).click();
        await panel.getByRole('button', { name: 'Provata', exact: true }).click();
        await panel.getByRole('button', { name: 'Sì, mi è servita', exact: true }).click();
        await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
        assert.ok(control.requests.some(request => request.method === 'PATCH' && request.body.helpful === true));
        assert.ok(control.requests.filter(request => request.method === 'PATCH').every(request => request.search === '?lang=it'));
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('completed session previews the summary and downloads both PDF formats', async () => {
    const { page, context, control } = await fixture(390, 'conclusion');
    try {
        await page.getByRole('button', { name: 'Continua alle scelte finali' }).first().click();
        await page.getByRole('heading', { name: 'Scelta finale' }).waitFor();
        for (const mode of ['brief', 'full']) {
            await page.locator(`input[name="report-mode"][value="${mode}"]`).check();
            const download = page.waitForEvent('download');
            await page.getByRole('button', { name: 'Scarica il resoconto PDF' }).click();
            assert.ok((await download).suggestedFilename().endsWith(`_${mode}.pdf`));
        }
        assert.ok(control.requests.some(request => request.search.includes('mode=brief')));
        assert.ok(control.requests.some(request => request.search.includes('mode=full')));
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const options of [{ width: 320, touch: true }, { width: 390, dark: true }, { width: 1440 }]) {
    test(`diagram reading, selection and text view at ${options.width}px${options.dark ? ' dark' : ''}`, async () => {
        const { page, context, control } = await fixture(options.width, 'intro', { ...options, graph: true });
        try {
            const figure = page.locator('figure');
            await figure.locator('.dg-node').first().waitFor();
            assert.equal(await figure.locator('.dg-hidden').count(), 0);
            await figure.getByRole('button', { name: 'Lettura', exact: true }).click();
            await figure.locator('[data-reading="true"]').waitFor();
            await page.waitForFunction(svg => Math.min(...[...svg.querySelectorAll('text')].map(text => Number(text.getAttribute('font-size')) * Math.abs(text.getScreenCTM().a))) >= 14.9, await figure.locator('.dg-svg > svg').elementHandle());
            const font = await figure.locator('.dg-svg > svg').evaluate(svg => Math.min(...[...svg.querySelectorAll('text')].map(text => Number(text.getAttribute('font-size')) * Math.abs(text.getScreenCTM().a))));
            assert.ok(Number.isFinite(font) && font >= 14.9, `readable labels: ${font}px`);
            const node = figure.locator('[data-node="b"]');
            await node.scrollIntoViewIfNeeded();
            if (options.touch) await node.tap(); else await node.click();
            await figure.locator('[data-node="b"][aria-pressed="true"]').waitFor();
            assert.equal(await node.getAttribute('aria-pressed'), 'true');
            for (const id of ['a', 'b', 'c']) assert.match(await figure.locator(`[data-node="${id}"]`).getAttribute('class'), /dg-related/);
            assert.doesNotMatch(await figure.locator('[data-node="d"]').getAttribute('class'), /dg-related/);
            await node.focus(); await page.keyboard.press('Escape');
            assert.equal(await node.getAttribute('aria-pressed'), 'false');
            await page.keyboard.press('Enter');
            assert.equal(await node.getAttribute('aria-pressed'), 'true');
            await page.keyboard.press('ArrowDown');
            assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-node')), 'c');
            await figure.getByRole('button', { name: 'Leggi come testo' }).click();
            assert.ok(await figure.locator('ol').getByText('Ricordo i concetti?', { exact: false }).isVisible());
            assert.ok(await figure.getByText('Ricordo i concetti? — confronta gli appunti → Verificare il risultato', { exact: true }).isVisible());
            await figure.getByRole('button', { name: 'Panoramica', exact: true }).click();
            await page.waitForFunction(element => element.scrollTop === 0 && element.scrollLeft === 0, await figure.locator('[data-diagram-viewport]').elementHandle());
            for (const button of await figure.locator('button:visible').all()) {
                const box = await button.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= options.width && box.height >= 44, 'controls fit and have touch targets');
            }
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('guided steps keep future neighbours hidden and survive fullscreen', async () => {
    const { page, context, control } = await fixture(390, 'intro', { graph: true });
    try {
        const figure = page.locator('figure');
        await figure.locator('.dg-node').first().waitFor();
        await figure.getByRole('button', { name: 'Passo-passo', exact: true }).click();
        await figure.getByText('Passaggio 1 di 4', { exact: true }).waitFor();
        assert.equal(await figure.locator('.dg-node:not(.dg-hidden)').count(), 1);
        await figure.locator('[data-node="a"]').click();
        assert.equal(await figure.locator('[data-node="b"]').evaluate(node => getComputedStyle(node).opacity), '0');
        assert.equal(await figure.locator('[data-node="b"]').getAttribute('tabindex'), '-1');
        await figure.getByRole('button', { name: 'Un passo avanti' }).click();
        await figure.getByRole('status').filter({ hasText: 'Scegliere un obiettivo — orienta → Studiare un argomento' }).waitFor();
        assert.equal(await figure.locator('.dg-node:not(.dg-hidden)').count(), 2);
        await figure.getByRole('button', { name: 'Apri il diagramma a schermo intero' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByText('Passaggio 2 di 4', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Leggi come testo' }).click();
        await dialog.locator('button:visible').last().focus();
        for (let i = 0; i < 15; i++) {
            await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
        }
        await dialog.getByRole('button', { name: 'Chiudi lo schermo intero' }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.ok(await figure.getByText('Passaggio 2 di 4', { exact: true }).isVisible());
        assert.ok(await page.getByRole('button', { name: 'Apri il diagramma a schermo intero' }).evaluate(button => button === document.activeElement));
        await figure.getByRole('button', { name: 'Mostra tutto' }).click();
        assert.equal(await figure.locator('.dg-hidden').count(), 0);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const width of [320, 1440]) {
    test(`diagram toolbar stays in one row and its menu preserves drawing space at ${width}px`, async () => {
        const { page, context, control } = await fixture(width, 'intro', { graph: true, dark: width === 320 });
        try {
            await page.locator('figure .dg-node').first().waitFor();
            await page.getByRole('button', { name: 'Apri il diagramma a schermo intero' }).click();
            const dialog = page.getByRole('dialog');
            const toolbar = dialog.locator('[data-diagram-controls]');
            const viewport = dialog.locator('[data-diagram-viewport]');
            const bar = await toolbar.boundingBox();
            assert.ok(bar.height <= 56, 'the toolbar occupies one compact row');
            const drawing = await viewport.boundingBox();
            assert.ok(drawing.height > 844 * 0.7, 'the drawing gets most of the viewport');
            const menu = dialog.getByRole('button', { name: 'Zoom ed esportazione', exact: true });
            const close = dialog.getByRole('button', { name: 'Chiudi lo schermo intero', exact: true });
            for (const button of [menu, close]) {
                const box = await button.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width);
                assert.ok(Math.abs(box.y - bar.y - 4) < 1, 'controls align in the same row');
            }
            await menu.click();
            const popup = dialog.locator('[popover]:popover-open');
            await popup.waitFor();
            assert.deepEqual(await viewport.boundingBox(), drawing, 'options overlay the drawing without shrinking it');
            const bounds = await popup.boundingBox();
            assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 844);
            await popup.getByRole('button', { name: 'Scarica SVG', exact: true }).focus();
            await page.getByRole('tooltip', { name: 'Scarica SVG', exact: true }).waitFor();
            await page.keyboard.press('Escape');
            await page.keyboard.press('Escape');
            await popup.waitFor({ state: 'hidden' });
            assert.ok(await menu.evaluate(el => el === document.activeElement));
            assert.ok(await dialog.isVisible(), 'Escape closes options before fullscreen');
            await dialog.getByRole('button', { name: 'Passo-passo', exact: true }).click();
            assert.equal((await toolbar.boundingBox()).height, bar.height, 'step controls share the same row');
            await dialog.getByRole('button', { name: 'Un passo avanti', exact: true }).click();
            assert.ok(await dialog.getByText('Passaggio 2 di 4', { exact: true }).isVisible());
            await close.click();
            await dialog.waitFor({ state: 'detached' });
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

test('exports contain the full graph despite partial steps and recover from failure', async () => {
    const { page, context, control } = await fixture(1440, 'intro', { graph: true });
    try {
        const figure = page.locator('figure');
        await figure.locator('.dg-node').first().waitFor();
        await figure.getByRole('button', { name: 'Passo-passo', exact: true }).click();
        await figure.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        control.failExport = true;
        await figure.getByRole('button', { name: 'Scarica SVG' }).click();
        await figure.getByRole('alert').waitFor();
        control.failExport = false;
        for (const format of ['SVG', 'PNG']) {
            const download = page.waitForEvent('download');
            await figure.getByRole('button', { name: `Scarica ${format}` }).click();
            assert.ok((await download).suggestedFilename().endsWith(format.toLowerCase()));
        }
        const requests = control.requests.filter(request => request.path === '/api/diagram/render' && request.body.embed_title);
        assert.ok(requests.every(request => request.body.spec.nodes.length === 4 && request.body.spec.edges.length === 3 && request.body.lang === 'it'));
        assert.equal(await figure.locator('.dg-node:not(.dg-hidden)').count(), 1);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('motion is opt-in and playback continues without animation when motion is reduced', async () => {
    const { page, context, control } = await fixture(390, 'intro', { graph: true, motion: 'no-preference' });
    try {
        const figure = page.locator('figure');
        await figure.locator('.dg-node').first().waitFor();
        assert.ok(await figure.locator('.dg-node').first().evaluate(node => parseFloat(getComputedStyle(node).transitionDuration) <= 0.00001));
        await figure.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        await figure.getByRole('checkbox', { name: 'Animazioni leggere' }).check();
        assert.equal(await figure.locator('.dg-node').first().evaluate(node => getComputedStyle(node).transitionDuration), '0.16s');
        await figure.getByRole('button', { name: 'Passo-passo', exact: true }).click();
        await figure.getByRole('button', { name: 'Riproduci la spiegazione' }).click();
        await figure.getByText('Passaggio 2 di 4', { exact: true }).waitFor({ timeout: 11000 });
        await figure.getByRole('button', { name: 'Pausa', exact: true }).click();
        const count = await figure.locator('.dg-node:not(.dg-hidden)').count();
        await page.waitForTimeout(3300);
        assert.equal(await figure.locator('.dg-node:not(.dg-hidden)').count(), count);
        await figure.getByRole('button', { name: 'Riproduci la spiegazione' }).click();
        await page.evaluate(() => { document.documentElement.dataset.motion = 'reduced'; });
        await figure.getByText('Passaggio 3 di 4', { exact: true }).waitFor({ timeout: 11000 });
        assert.ok(await figure.locator('.dg-node').first().evaluate(node => parseFloat(getComputedStyle(node).transitionDuration) <= 0.00001));
        await figure.getByText('Passaggio 4 di 4', { exact: true }).waitFor({ timeout: 11000 });
        await figure.getByRole('button', { name: 'Riproduci la spiegazione' }).waitFor({ timeout: 11000 });
        assert.equal(await figure.locator('.dg-node:not(.dg-hidden)').count(), 4);
        await figure.getByRole('button', { name: 'Riproduci la spiegazione' }).click();
        await figure.getByText('Passaggio 1 di 4', { exact: true }).waitFor();
        await figure.getByRole('button', { name: 'Pausa', exact: true }).click();
        await figure.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        assert.equal(await figure.getByRole('checkbox').isChecked(), false);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('fullscreen touch zoom and drag preserve selection and can be recentered', async () => {
    const { page, context, control } = await fixture(390, 'intro', { graph: true, touch: true });
    try {
        await page.locator('figure .dg-node').first().waitFor();
        await page.getByRole('button', { name: 'Apri il diagramma a schermo intero' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Lettura', exact: true }).click();
        await dialog.locator('[data-reading="true"]').waitFor();
        const viewport = dialog.locator('[data-diagram-viewport]');
        const box = await viewport.boundingBox();
        const session = await context.newCDPSession(page);
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y }, { x: x + 30, y }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 60, y }, { x: x + 60, y }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await dialog.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        assert.ok(parseInt(await dialog.locator('[data-diagram-zoom]').textContent()) > 150);
        assert.equal(await dialog.locator('.dg-selected').count(), 0);
        await dialog.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        // Let the viewport finish resizing after the tools panel closes.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const panBox = await viewport.boundingBox();
        const panX = panBox.x + panBox.width / 2, panY = panBox.y + panBox.height / 2;
        const topBefore = await viewport.evaluate(element => element.scrollTop);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: panX, y: panY }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: panX, y: panY - 80 }] });
        await page.waitForFunction(({ element, previous }) => element.scrollTop > previous + 60, { element: await viewport.elementHandle(), previous: topBefore });
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        assert.equal(await dialog.locator('.dg-selected').count(), 0);
        await dialog.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        await dialog.getByRole('button', { name: 'Adatta allo spazio' }).click();
        assert.equal(await dialog.locator('[data-diagram-zoom]').textContent(), '100%');
        await page.waitForFunction(element => element.scrollTop === 0 && element.scrollLeft === 0, await viewport.elementHandle());
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('render failure keeps a readable text alternative and supports retry', async () => {
    const { page, context, control } = await fixture(390, 'intro', { graph: true });
    try {
        control.failRender = true;
        await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
        const figure = page.locator('figure');
        await figure.getByRole('button', { name: 'Riprova', exact: true }).waitFor();
        assert.ok(await figure.locator('ol').getByText('Ricordo i concetti?', { exact: false }).isVisible());
        assert.equal(await figure.locator('.dg-node').count(), 0);
        control.failRender = false;
        await figure.getByRole('button', { name: 'Riprova', exact: true }).click();
        await figure.locator('.dg-node').first().waitFor();
        assert.equal(await figure.locator('.dg-node').count(), 4);
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

test('fullscreen retains the reading position and zoom on return to the card', async () => {
    const { page, context, control } = await fixture(390, 'intro', { graph: true });
    try {
        const figure = page.locator('figure');
        await figure.locator('.dg-node').first().waitFor();
        await figure.getByRole('button', { name: 'Lettura', exact: true }).click();
        await figure.getByRole('button', { name: 'Zoom ed esportazione', exact: true }).click();
        await figure.getByRole('button', { name: 'Ingrandisci', exact: true }).click();
        const viewport = figure.locator('[data-diagram-viewport]');
        await viewport.evaluate(element => { element.scrollTop = element.scrollHeight * 0.5; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const position = await viewport.evaluate(element => (element.scrollTop + element.clientHeight / 2) / element.scrollHeight);
        await figure.getByRole('button', { name: 'Apri il diagramma a schermo intero' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.locator('[data-reading="true"]').waitFor();
        await dialog.getByRole('button', { name: 'Chiudi lo schermo intero' }).click();
        await dialog.waitFor({ state: 'detached' });
        await page.waitForFunction(({ element, expected }) => Math.abs((element.scrollTop + element.clientHeight / 2) / element.scrollHeight - expected) < 0.02,
            { element: await viewport.elementHandle(), expected: position });
        assert.equal(await figure.locator('[data-diagram-zoom]').textContent(), '125%');
        assert.deepEqual(control.errors, []);
    } finally { await context.close(); }
});

for (const width of [320, 390]) {
    test(`mobile counselor selection fits and applies to the next diagram at ${width}px`, async () => {
        const { page, context, control } = await fixture(width, 'intro', { touch: true, dark: true });
        try {
            await page.locator('#guided-composer').fill('Conserva questa domanda.');
            await page.locator('button[aria-controls="mobile-menu"]').tap();
            const menu = page.locator('#mobile-menu');
            const trigger = menu.locator('button[aria-controls]').filter({ hasText: 'Counselor di prova' });
            await trigger.tap();
            const options = page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`);
            const menuBox = await menu.boundingBox();
            const box = await options.boundingBox();
            assert.ok(box.x >= menuBox.x && box.x + box.width <= menuBox.x + menuBox.width, 'counselors fit inside the scrollable menu');
            for (const button of await options.getByRole('button').all()) {
                assert.ok((await button.boundingBox()).height >= 44);
            }
            await options.getByRole('button', { name: 'Secondo counselor', exact: true }).tap();
            assert.equal(await page.evaluate(() => localStorage.getItem('counselorbot_selected_counselor')), '2');
            assert.equal(await options.count(), 0);
            const selected = menu.locator('button[aria-controls]').filter({ hasText: 'Secondo counselor' });
            await selected.tap();
            await options.waitFor({ state: 'visible' });
            await page.keyboard.press('Escape');
            assert.equal(await menu.count(), 1, 'Escape closes the counselor list first');
            assert.equal(await selected.getAttribute('aria-expanded'), 'false');
            await page.keyboard.press('Escape');
            assert.equal(await menu.count(), 0);
            assert.equal(await page.locator('#guided-composer').inputValue(), 'Conserva questa domanda.');
            await openMessageDiagram(page);
            await page.locator('form').filter({ has: page.locator('input[maxlength="400"]') }).locator('button[type="submit"]').tap();
            await page.locator('figure svg g.node').first().waitFor();
            assert.equal(control.requests.find(request => request.path === '/api/diagram/from-message').body.counselor_id, 2);
            const nextChat = page.waitForRequest('**/api/chat/stream');
            await page.locator('#guided-composer').press('Enter');
            assert.equal((await nextChat).postDataJSON().counselor_id, 2);
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}

for (const width of [390, 1440]) {
    test(`step playback works with system reduced motion at ${width}px`, async () => {
        const { page, context, control } = await fixture(width, 'intro', { graph: true });
        try {
            const figure = page.locator('figure');
            await figure.locator('.dg-node').first().waitFor();
            await figure.getByRole('button', { name: 'Passo-passo', exact: true }).click();
            assert.ok(await figure.getByRole('button', { name: 'Riproduci la spiegazione' }).isEnabled());
            await figure.getByRole('button', { name: 'Riproduci la spiegazione' }).click();
            for (let step = 2; step <= 4; step++) {
                await figure.getByText(`Passaggio ${step} di 4`, { exact: true }).waitFor({ timeout: 11000 });
                assert.equal(await figure.locator('.dg-node:not(.dg-hidden)').count(), step);
            }
            await figure.getByRole('button', { name: 'Riproduci la spiegazione' }).waitFor({ timeout: 11000 });
            assert.ok(await figure.locator('.dg-node').first().evaluate(node => parseFloat(getComputedStyle(node).transitionDuration) <= 0.00001));
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}


for (const width of [390, 1440]) {
    test(`questions can close, survive resume and reopen at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        const openNotes = async () => {
            const panel = page.locator('#guided-recommendations-panel');
            if (!await panel.isVisible()) {
                await page.getByRole('button', { name: 'Opzioni della conversazione', exact: true }).click();
                await page.getByRole('button', { name: 'Per te', exact: true }).click();
            }
            await panel.getByRole('tab', { name: /Consigli e domande/ }).click();
            return panel;
        };
        try {
            let panel = await openNotes();
            control.failPatch = true;
            await panel.getByRole('button', { name: 'Segna come chiusa', exact: true }).click();
            await panel.getByRole('alert').waitFor();
            assert.equal(await panel.getByText('Domanda aperta', { exact: true }).isVisible(), true);
            control.failPatch = false;
            await panel.getByRole('button', { name: 'Riprova', exact: true }).click();
            await panel.getByText('Domanda chiusa', { exact: true }).waitFor();
            await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
            panel = await openNotes();
            await panel.getByText('Domanda chiusa', { exact: true }).waitFor();
            await panel.getByRole('button', { name: 'Riapri la domanda', exact: true }).click();
            await panel.getByText('Domanda aperta', { exact: true }).waitFor();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            assert.equal(overflow, false);
            await page.screenshot({ path: `/tmp/w4-notes-${width}.png`, fullPage: true });
            assert.deepEqual(control.errors, []);
        } finally { await context.close(); }
    });
}


test('a response opening fills the composer without sending', async () => {
    const { page, context, control } = await fixture(390);
    try {
        await page.locator('summary').filter({ hasText: /Domande/ }).click();
        await page.getByRole('button', { name: 'Mi riconosco soprattutto in…', exact: true }).click();
        assert.equal(await page.locator('#guided-composer').inputValue(), 'Mi riconosco soprattutto in ');
        assert.equal(control.requests.some(request => request.path === '/api/chat/stream'), false);
    } finally { await context.close(); }
});
