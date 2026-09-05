import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.ARTIFACTS_BASE_URL || 'http://127.0.0.1:3000').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const reply = 'Scegli un obiettivo, studia e verifica quello che ricordi.';
const spec = { type: 'flow', title: 'Piano di studio e verifica dei risultati', nodes: [{ id: 'a', label: 'Obiettivo' }, { id: 'b', label: 'Verifica' }], edges: [{ from: 'a', to: 'b' }] };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180"><g class="node"><title>a</title><text x="40" y="40">Obiettivo</text></g><g class="edge"><title>a-&gt;b</title><path d="M60 50V100" stroke="#17747a"/></g><g class="node"><title>b</title><text x="40" y="130">Verifica</text></g></svg>';

async function fixture(width, phase = 'intro') {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const control = { failDiagram: false, failPatch: false, saved: [], requests: [], errors: [] };
    const catalog = {
        reading: [{ slug: 'test-book', title: 'Libro per la prova', why: 'Collegato al metodo di studio.', synopsis: 'SINOSSI COMPLETA DEL LIBRO', where: 'https://example.invalid/libro', languages: ['it', 'en'], warning: 'AVVERTENZA DEL LIBRO', status: 'proposed' }],
        strategy: [{ slug: 'test-strategy', name: 'Recupero attivo', description: 'Chiudi il testo e scrivi tre concetti.', recommended_when: 'Quando vuoi verificare cosa ricordi.', status: 'proposed' }],
    };
    page.on('pageerror', error => control.errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('counselorbot_selected_counselor', '1'); });
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        control.requests.push({ path: url.pathname, search: url.search, method: request.method(), body: request.postDataJSON() });
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'fixture', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'fixture', name: 'Counselor di prova', language: ['it'], suitable: true }];
        else if (url.pathname === '/api/session/frozen/fixture') data = { session_id: 'fixture', questionnaire_type: 'QSA', current_phase: phase, counselor_id: 1, experience: 'standard', scores: { C1: 7 }, messages: [{ role: 'system', content: phase === 'intro' ? '--- Introduzione ---' : 'FINE PERCORSO' }, { role: 'user', content: 'Vorrei organizzarmi.' }, { role: 'assistant', content: reply }] };
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
        } else if (url.pathname === '/api/diagram/render') return route.fulfill({ contentType: 'image/svg+xml', body: svg });
        else if (url.pathname.endsWith('/summary')) data = { summary: '## Scelta finale\nProverò il recupero attivo per una settimana.', status: 'ready' };
        else if (url.pathname.endsWith('/pdf')) return route.fulfill({ contentType: 'application/pdf', headers: { 'X-Summary-Status': 'ready' }, body: '%PDF-1.4\n%%EOF' });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/?frozen=fixture`, { waitUntil: 'networkidle' });
    return { page, context, control };
}

for (const width of [320, 390, 1440]) {
    test(`message diagrams persist and controls fit at ${width}px`, async () => {
        const { page, context, control } = await fixture(width);
        try {
            await page.getByRole('button', { name: 'Diagramma', exact: true }).click();
            const send = page.locator('form').filter({ has: page.locator('input[maxlength="400"]') }).locator('button[type="submit"]');
            await send.click();
            await page.locator('figure svg g.node').first().waitFor();
            const buttons = page.locator('figcaption button');
            for (const button of await buttons.all()) {
                const box = await button.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width, 'diagram control fits viewport');
            }
            await page.getByRole('button', { name: 'Apri il diagramma a schermo intero' }).click();
            const dialog = page.getByRole('dialog');
            await dialog.waitFor();
            for (const button of await dialog.locator('button').all()) {
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
        await page.locator('form button[aria-controls="guided-recommendations-panel"]').click();
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
