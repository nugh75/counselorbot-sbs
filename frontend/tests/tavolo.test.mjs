// La tela del tavolo nel browser vero. Le risposte del server sono finte:
// quello che si prova qui e' il disegno, che nessun test di logica raggiunge.
//
// Esiste per un difetto preciso. React Flow tiene la propria copia dei nodi e ci
// attacca la misura presa dal DOM; ricostruire gli oggetti a ogni render gliela
// toglieva, e un nodo senza misura resta `visibility: hidden`. La tela si
// montava, i nodi stavano nel DOM, e non si vedeva niente. Nessuna prova di
// logica poteva accorgersene.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.ARTIFACTS_BASE_URL || 'http://127.0.0.1:3000').origin;
const ID = 'prova-tavolo';

const graph = {
    title: 'Perche rimando',
    nodes: [
        { id: 'a', label: 'Compito difficile', form: 'concept', by: 'person', state: 'live', x: 0, y: 0 },
        { id: 'b', label: 'Ansia', form: 'decision', by: 'person', state: 'live', x: 260, y: 0 },
        { id: 'c', label: 'Rimando', form: 'action', by: 'person', state: 'live', x: 0, y: 160 },
        { id: 'd', label: 'Meno tempo', form: 'outcome', by: 'model', state: 'pending', x: 260, y: 160 },
    ],
    edges: [
        { from: 'a', to: 'b', rel: 'causes', strength: 3, hypothesis: false, by: 'person', state: 'live' },
        { from: 'b', to: 'c', rel: 'supports', strength: 1, hypothesis: true, by: 'person', state: 'live' },
        { from: 'c', to: 'd', rel: 'then', strength: 2, hypothesis: false, by: 'model', state: 'pending' },
    ],
};
const view = {
    id: ID, title: null, saved: false, origin_session_id: null, origin_instrument: 'IDEA',
    index: 4, graph, rendition: null, has_capture: false,
};

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const calls = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/*', (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) {
            return request.method() === 'GET' ? route.continue() : route.abort();
        }
        // Il corpo della cattura e' un PNG: delle multipart si registra la
        // dimensione, non il contenuto.
        const multipart = (request.headers()['content-type'] || '').includes('multipart');
        calls.push({
            path: url.pathname, method: request.method(),
            body: multipart ? { bytes: request.postDataBuffer()?.length ?? 0 } : request.postDataJSON(),
        });
        // Il difetto di serie e' una lista: il guscio dell'app itera su parecchie
        // di queste risposte, e un oggetto vuoto lo fa cadere prima della pagina.
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'prova', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'f', name: 'Counselor di prova', language: ['it'], suitable: true }];
        else if (url.pathname === `/api/tavolo/${ID}`) data = view;
        else if (url.pathname.endsWith('/settle')) data = { ...view, index: view.index + 1 };
        else if (url.pathname.endsWith('/save')) data = { ...view, title: 'Tavolo di prova', saved: true, rendition: 'resa' };
        else if (url.pathname.endsWith('/capture')) data = { has_capture: true };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/tavolo/${ID}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.react-flow__node', { timeout: 20000 });
    return { page, context, calls, errors };
}

test('i pezzi si vedono, non solo esistono nel DOM', async () => {
    const { page, context } = await fixture();
    const labels = await page.locator('.react-flow__node').allInnerTexts();
    assert.equal(labels.length, 4, 'i tre pezzi vivi piu quello proposto');
    // `toBeVisible` e non `count`: e' esattamente la differenza che il difetto
    // di misura nascondeva.
    for (const id of ['a', 'b', 'c', 'd']) {
        assert.ok(await page.locator(`.react-flow__node[data-id="${id}"]`).isVisible(), `il pezzo ${id} si vede`);
    }
    await context.close();
});

test('le quattro forme restano quattro forme distinte', async () => {
    const { page, context } = await fixture();
    const shapes = await page.locator('.react-flow__node > div').evaluateAll((elements) =>
        elements.map((element) => {
            const style = getComputedStyle(element);
            return `${style.borderRadius}|${style.clipPath}`;
        }));
    assert.equal(new Set(shapes).size, 4, 'concetto, azione, bivio ed esito si distinguono');
    await context.close();
});

test('gli archi dicono la convenzione nella lingua di chi guarda', async () => {
    const { page, context } = await fixture();
    const words = await page.locator('.react-flow__edgelabel-renderer span').allInnerTexts();
    assert.deepEqual(words.sort(), ['porta a', 'sostiene', 'viene prima di'].sort());
    await context.close();
});

test('colore per famiglia, spessore per forza, tratteggio per ipotesi', async () => {
    const { page, context } = await fixture();
    const strokes = await page.locator('.react-flow__edge-path').evaluateAll((elements) =>
        elements.map((element) => {
            const style = getComputedStyle(element);
            return { stroke: style.stroke, width: style.strokeWidth, dash: style.strokeDasharray };
        }));
    assert.notEqual(strokes[0].stroke, strokes[1].stroke, 'causa e argomento hanno colori diversi');
    assert.equal(strokes[0].width, '3px', 'forza 3 disegna il tratto piu spesso');
    assert.equal(strokes[1].width, '1px', 'forza 1 disegna il tratto piu sottile');
    assert.notEqual(strokes[1].dash, 'none', "un'ipotesi e tratteggiata");
    assert.equal(strokes[0].dash, 'none', 'un legame dichiarato non lo e');
    await context.close();
});

test('il pannello sceglie prima la famiglia, poi il verbo', async () => {
    const { page, context } = await fixture();
    await page.locator('.react-flow__node[data-id="a"]').click();
    assert.equal(await page.locator('aside input').first().inputValue(), 'Compito difficile');
    assert.equal(await page.getByRole('button', { name: 'Bivio' }).count(), 1);

    await page.locator('.react-flow__edge').first().click({ force: true });
    const panel = await page.locator('aside').innerText();
    for (const family of ['Argomento', 'Causa', 'Tempo', 'Appartenenza']) {
        assert.ok(panel.includes(family), `la famiglia ${family} e proponibile`);
    }
    // I verbi mostrati sono quelli della famiglia in corso, non tutti e dodici.
    assert.ok(panel.includes('ostacola'), 'i verbi della causa');
    assert.ok(!panel.includes('fa parte di'), "non i verbi dell'appartenenza");
    await context.close();
});

test('accetta tutto manda solo i sospesi, contro la revisione letta', async () => {
    const { page, context, calls } = await fixture();
    await page.getByRole('button', { name: 'Accetta tutto' }).click();
    await page.waitForTimeout(800);
    const settle = calls.find((call) => call.path.endsWith('/settle'));
    assert.deepEqual(settle?.body?.ids?.slice().sort(), ['c->d', 'd']);
    assert.equal(settle?.body?.action, 'accept');
    assert.equal(settle?.body?.base_index, 4);
    await context.close();
});

test('il salvataggio porta con se la cattura del tavolo', async () => {
    const { page, context, calls, errors } = await fixture();
    page.on('dialog', (dialog) => dialog.accept('Tavolo di prova'));
    await page.getByRole('button', { name: 'Salva il tavolo' }).click();
    await page.waitForTimeout(4000);
    assert.equal(calls.find((call) => call.path.endsWith('/save'))?.body?.title, 'Tavolo di prova');
    const capture = calls.find((call) => call.path.endsWith('/capture'));
    assert.ok(capture, 'il PNG del tavolo viene caricato');
    assert.ok(capture.body.bytes > 1000, 'e non e un file vuoto');
    assert.deepEqual(errors, [], 'nessun errore in pagina');
    await context.close();
});
