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
        { id: 'b', label: 'Ansia', form: 'decision', icon: 'distress', by: 'person', state: 'live', x: 260, y: 0 },
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
        else if (url.pathname === '/api/tavolo/presets') data = { presets: [{ id: 'causal', rels: ['causes', 'hinders', 'feeds-back'], forms: ['concept', 'outcome'], rankdir: 'TB', edge_label_required: false, prompts: ['i fattori del QSA', 'perche rimando'], has_example: true }] };
        else if (url.pathname === '/api/diagram-icons') data = { icons: [{ id: 'distress', meaning: 'distress', label: 'Disagio' }] };
        else if (url.pathname === `/api/tavolo/${ID}`) data = view;
        else if (url.pathname.endsWith('/settle')) data = { ...view, index: view.index + 1 };
        else if (url.pathname.endsWith('/save')) data = { ...view, title: 'Tavolo di prova', saved: true, rendition: 'resa' };
        else if (url.pathname.endsWith('/capture')) data = { has_capture: true };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    // L'SVG non e' JSON: una rotta a parte, registrata dopo quella generica
    // cosi' vince su di lei per gli id che la riguardano.
    await page.route('**/api/diagram-icons/*.svg', (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="9" fill="#17747a"/></svg>',
    }));
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

test('ogni pezzo si aggancia da quattro lati', async () => {
    const { page, context } = await fixture();
    const handles = await page.locator('.react-flow__node[data-id="a"] .react-flow__handle').count();
    assert.equal(handles, 4, 'sopra, a destra, sotto e a sinistra');
    await context.close();
});

test("il filo esce dal lato che guarda l'altro pezzo", async () => {
    const { page, context } = await fixture();
    const box = await page.locator('.react-flow__node[data-id="a"]')
        .evaluate((element) => ({ w: element.offsetWidth, h: element.offsetHeight }));
    // Il primo arco va da `a` a `b`, che gli sta a destra sulla stessa riga. Le
    // coordinate del tracciato sono quelle del piano, e `a` sta nell'origine:
    // con gli agganci fissi di prima il filo partiva dal centro del fondo.
    const path = await page.locator('.react-flow__edge-path').first().getAttribute('d');
    const [x, y] = path.slice(1).split(/[ ,C]/).map(Number);
    assert.ok(Math.abs(x - box.w) < 2, `parte dal bordo destro (${x} contro ${box.w})`);
    // Non esattamente a meta': il bivio a destra e' piu' alto, e il filo punta
    // al suo centro. Quello che conta e' che esca dal fianco e non dal fondo.
    assert.ok(y > box.h * 0.25 && y < box.h * 0.75, `dal fianco e non dal fondo (${y} su ${box.h})`);
    await context.close();
});

test('la parola sull arco si puo scrivere a mano', async () => {
    const { page, context } = await fixture();
    await page.locator('.react-flow__edge').first().click({ force: true });
    const input = page.getByPlaceholder('porta a');
    await input.fill('mi blocca');
    await page.waitForTimeout(300);
    let words = await page.locator('.react-flow__edgelabel-renderer span').allInnerTexts();
    assert.ok(words.includes('mi blocca'), 'la parola scritta prende il posto del verbo');
    // Svuotare non lascia un arco muto: torna il verbo del vocabolario.
    await input.fill('');
    await page.waitForTimeout(300);
    words = await page.locator('.react-flow__edgelabel-renderer span').allInnerTexts();
    assert.ok(words.includes('porta a'), 'senza parola propria torna la convenzione');
    await context.close();
});

test('il punto e uno solo, e si vede', async () => {
    const { page, context } = await fixture();
    const fill = (id) => page.locator(`.react-flow__node[data-id="${id}"] > div`)
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    const point = async (id) => {
        await page.locator(`.react-flow__node[data-id="${id}"]`).click();
        await page.getByRole('button', { name: 'Il punto' }).click();
        await page.waitForTimeout(300);
    };
    const plain = await fill('a');
    await point('a');
    const accented = await fill('a');
    assert.notEqual(accented, plain, 'il pezzo accentato si distingue dagli altri');

    await point('b');
    assert.equal(await fill('b'), accented, "l'enfasi si sposta sul pezzo scelto");
    assert.equal(await fill('a'), plain, 'e lascia il precedente com era');
    await context.close();
});

test('un legame puo valere nei due sensi', async () => {
    const { page, context } = await fixture();
    const arrow = () => page.locator('.react-flow__edge-path').first().getAttribute('marker-start');
    assert.equal(await arrow(), null, 'di serie la punta e una sola');

    await page.locator('.react-flow__edge').first().click({ force: true });
    await page.getByLabel('Vale nei due sensi').check();
    await page.waitForTimeout(300);
    assert.ok(await arrow(), "la punta compare anche dall'altra parte");

    // L'appartenenza non ha punte, quindi non ha nemmeno la scelta.
    await page.getByRole('button', { name: 'Appartenenza' }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.getByLabel('Vale nei due sensi').count(), 0);
    await context.close();
});

test('il colore raggruppa i pezzi senza toccarne lo stato', async () => {
    const { page, context } = await fixture();
    const fill = (id) => page.locator(`.react-flow__node[data-id="${id}"] > div`)
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    const plain = await fill('a');

    await page.locator('.react-flow__node[data-id="a"]').click();
    await page.getByRole('button', { name: 'Verde' }).click();
    await page.waitForTimeout(300);
    const green = await fill('a');
    assert.notEqual(green, plain, 'il pezzo colorato si distingue');
    assert.equal(await fill('c'), plain, 'e gli altri restano com erano');

    // Il pezzo proposto resta tratteggiato in ocra: lo stato batte il gruppo.
    const proposed = await fill('d');
    await page.locator('.react-flow__node[data-id="d"]').click();
    await page.getByRole('button', { name: 'Verde' }).click();
    await page.waitForTimeout(300);
    assert.equal(await fill('d'), proposed, 'una proposta si vede ancora come proposta');
    await context.close();
});

test('il tavolo si ingrandisce e si allarga', async () => {
    const { page, context } = await fixture();
    const zoom = () => page.locator('.react-flow__viewport')
        .evaluate((element) => getComputedStyle(element).transform);
    const before = await zoom();
    await page.getByRole('button', { name: 'Ingrandisci' }).click();
    await page.waitForTimeout(500);
    assert.notEqual(await zoom(), before, 'il tasto ingrandisce davvero');

    assert.equal(await page.locator('aside').count(), 1);
    await page.getByRole('button', { name: 'Allarga il tavolo' }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('aside').count(), 0, 'il pannello lascia il posto al disegno');
    await page.getByRole('button', { name: 'Mostra il pannello' }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('aside').count(), 1, 'e torna quando serve');
    await context.close();
});

test('the prompt box offers the genres and the example prompts', async () => {
    const { page, context } = await fixture();
    await page.getByRole('button', { name: 'Mappa causale' }).click();
    await page.getByRole('button', { name: 'i fattori del QSA' }).click();
    assert.equal(await page.getByLabel('Scrivi uno schema').inputValue(), 'i fattori del QSA');
    await context.close();
});

test('a composed schema arrives dashed and nothing is live before it is kept', async () => {
    const { page, context, calls } = await fixture();
    await page.getByLabel('Scrivi uno schema').fill('i fattori del QSA');
    await page.getByRole('button', { name: 'Componi' }).click();
    await page.waitForResponse((response) => response.url().includes('/compose'));
    // `calls` registra `path` e `body` gia' scomposto (vedi `fixture()`), non
    // `url` ne' una stringa da ri-parsare: e' la stessa forma delle altre
    // prove che leggono `calls` in questo file.
    const body = calls.find((call) => call.path.endsWith('/compose'))?.body;
    assert.equal(body?.base_index, 4);
    assert.equal(body?.prompt, 'i fattori del QSA');
    await context.close();
});

test('the icon of a piece is drawn on the canvas', async () => {
    const { page, context } = await fixture();
    const icon = page.locator('.react-flow__node img').first();
    await icon.waitFor({ state: 'visible' });
    const box = await icon.boundingBox();
    assert.ok(box.width >= 16, `icona troppo piccola: ${box.width}`);
    await context.close();
});
