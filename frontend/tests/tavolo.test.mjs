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

// La cattura del tavolo e' un PNG dentro un form multipart: per provare che
// l'icona ci e' finita davvero (non solo sullo schermo) serve il file, non
// solo la sua dimensione. Playwright non lo scompone da solo.
function multipartFilePart(request) {
    const contentType = request.headers()['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    const body = request.postDataBuffer();
    if (!boundaryMatch || !body) return null;
    const boundary = Buffer.from(`--${boundaryMatch[1]}`);
    const headerEnd = Buffer.from('\r\n\r\n');
    let start = body.indexOf(boundary);
    while (start !== -1) {
        const nextStart = body.indexOf(boundary, start + boundary.length);
        const headersEnd = body.indexOf(headerEnd, start);
        if (headersEnd === -1 || nextStart === -1) return null;
        const headers = body.slice(start, headersEnd).toString('latin1');
        if (/filename=/.test(headers)) {
            // Il contenuto finisce appena prima del CRLF che precede il prossimo boundary.
            return body.slice(headersEnd + headerEnd.length, nextStart - 2);
        }
        start = nextStart;
    }
    return null;
}

async function fixture({ composeOpen = true, width = 1440, dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    let current = structuredClone(view);
    const calls = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await page.addInitScript((dark) => { localStorage.setItem('cb_lang', 'it'); if (dark) localStorage.setItem('cb_theme', 'dark'); }, dark);
    await page.route('**/*', (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) {
            return request.method() === 'GET' ? route.continue() : route.abort();
        }
        // Il corpo della cattura e' un PNG: delle multipart si registra anche
        // il file estratto (`png`), non solo la dimensione, cosi' un test puo'
        // guardare dentro l'immagine invece di fidarsi solo dello schermo.
        const multipart = (request.headers()['content-type'] || '').includes('multipart');
        calls.push({
            path: url.pathname, method: request.method(),
            body: multipart ? { bytes: request.postDataBuffer()?.length ?? 0 } : request.postDataJSON(),
            png: multipart ? multipartFilePart(request) : undefined,
        });
        // Il difetto di serie e' una lista: il guscio dell'app itera su parecchie
        // di queste risposte, e un oggetto vuoto lo fa cadere prima della pagina.
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: false, username: 'prova', name: 'Prova', groups: ['studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, slug: 'f', name: 'Counselor di prova', language: ['it'], model_origin: 'local', suitable: true }, { id: 29, slug: 'omar', name: 'Omar', language: ['it'], model_origin: 'local', suitable: true }];
        else if (url.pathname === '/api/tavolo/capabilities') data = { available: true, fallback_origin: null };
        else if (url.pathname === '/api/tavolo') {
            if (request.method() === 'POST') data = current;
            else data = [{ id: ID, title: current.title || 'Tavolo di prova', saved_at: '2026-09-14', has_capture: false }];
        }
        else if (url.pathname === '/api/tavolo/presets') data = { presets: [{ id: 'causal', rels: ['causes', 'hinders', 'feeds-back'], forms: ['concept', 'outcome'], rankdir: 'TB', edge_label_required: false, prompts: ['i fattori del QSA', 'perche rimando'], examples: [{ id: 'qsa-influences', title: 'Come i fattori del QSA si influenzano' }] }] };
        else if (url.pathname === '/api/diagram-icons') data = { icons: [{ id: 'distress', meaning: 'distress', label: 'Disagio' }] };
        else if (url.pathname === `/api/tavolo/${ID}`) {
            if (request.method() === 'PUT') {
                const body = request.postDataJSON();
                if (body.base_index !== current.index) return route.fulfill({ status: 409, json: { detail: 'stale' } });
                current = { ...current, graph: body.graph, index: current.index + 1 };
            } else if (request.method() === 'PATCH') current.title = request.postDataJSON().title;
            data = request.method() === 'DELETE' ? { ok: true } : current;
        }
        else if (url.pathname.endsWith('/settle')) {
            const body = request.postDataJSON();
            if (body.base_index !== current.index) return route.fulfill({ status: 409, json: { detail: 'stale' } });
            const state = body.action === 'accept' ? 'live' : 'dropped';
            current = { ...current, index: current.index + 1, graph: { ...current.graph,
                nodes: current.graph.nodes.map(node => body.ids.includes(node.id) ? { ...node, state } : node),
                edges: current.graph.edges.map(edge => body.ids.includes(`${edge.from}->${edge.to}`) ? { ...edge, state } : edge),
            } };
            data = current;
        }
        else if (url.pathname.endsWith('/save')) { current = { ...current, title: request.postDataJSON().title, saved: true, rendition: 'resa' }; data = current; }
        else if (url.pathname.endsWith('/help')) data = { reply: 'Scegli due pezzi e descrivi il loro legame.' };
        else if (url.pathname.endsWith('/suggest')) data = { ...current, note: 'Prova a spiegare questo legame.' };
        else if (url.pathname.endsWith('/capture')) data = { has_capture: true };
        // Un genere composto porta un pezzo e un arco in piu', entrambi
        // `pending`: senza questo ramo il generico `[]` qui sotto lascia la
        // pagina sulla schermata "non trovato", e il test del compose non
        // proverebbe mai che la risposta arriva davvero sulla tela.
        else if (url.pathname.endsWith('/compose')) data = {
            ...view,
            index: view.index + 1,
            graph: {
                title: graph.title,
                nodes: [...graph.nodes, { id: 'e', label: 'Uso di strategie', form: 'concept', by: 'model', state: 'pending', x: 520, y: 0 }],
                edges: [...graph.edges, { from: 'd', to: 'e', rel: 'causes', strength: 2, hypothesis: false, by: 'model', state: 'pending' }],
            },
            note: null,
        };
        if (url.pathname.endsWith('/compose')) current = data;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    // L'SVG non e' JSON: una rotta a parte, registrata dopo quella generica
    // cosi' vince su di lei per gli id che la riguardano. Il colore e' un
    // magenta puro che non compare altrove nella palette dell'app (indigo,
    // ocra, ardesia, rosa): un test puo' cercarlo nel PNG catturato senza
    // rischiare di trovarlo per caso in un bordo o in uno sfondo.
    await page.route('**/api/diagram-icons/*.svg', (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="9" fill="#ff00ff"/></svg>',
    }));
    await page.goto(`${origin}/tavolo/${ID}`, { waitUntil: 'networkidle' });
    if (width >= 1024) {
        await page.waitForSelector('.react-flow__node', { timeout: 20000 });
        if (composeOpen) await page.locator('details > summary').filter({ hasText: 'Scrivi uno schema' }).click();
    }
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
    const words = await page.locator('.react-flow__edgelabel-renderer button').allInnerTexts();
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
    let words = await page.locator('.react-flow__edgelabel-renderer button').allInnerTexts();
    assert.ok(words.includes('mi blocca'), 'la parola scritta prende il posto del verbo');
    // Svuotare non lascia un arco muto: torna il verbo del vocabolario.
    await input.fill('');
    await page.waitForTimeout(300);
    words = await page.locator('.react-flow__edgelabel-renderer button').allInnerTexts();
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

test('a directly opened table offers a safe return to its list', async () => {
    const { page, context } = await fixture({ composeOpen: false });
    await page.locator('main header').getByRole('button', { name: 'Indietro', exact: true }).click();
    await page.waitForURL(`${origin}/tavolo`);
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
    const before = await page.locator('.react-flow__node > div.border-dashed').count();
    await page.getByLabel('Scrivi uno schema').fill('i fattori del QSA');
    const composed = page.waitForResponse((response) => response.url().includes('/compose'));
    await page.getByRole('button', { name: 'Componi' }).click();
    await composed;
    // `calls` registra `path` e `body` gia' scomposto (vedi `fixture()`), non
    // `url` ne' una stringa da ri-parsare: e' la stessa forma delle altre
    // prove che leggono `calls` in questo file.
    const body = calls.find((call) => call.path.endsWith('/compose'))?.body;
    assert.equal(body?.base_index, 4);
    assert.equal(body?.prompt, 'i fattori del QSA');
    // Non basta che la richiesta sia partita bene: il pezzo che la risposta
    // porta deve arrivare sulla tela, tratteggiato come ogni proposta.
    await page.waitForFunction(
        (previous) => document.querySelectorAll('.react-flow__node > div.border-dashed').length > previous,
        before,
    );
    const after = await page.locator('.react-flow__node > div.border-dashed').count();
    assert.ok(after > before, `i pezzi tratteggiati crescono dopo compose (${before} -> ${after})`);
    await context.close();
});

test('the icon of a piece is drawn on the canvas', async () => {
    const { page, context, calls } = await fixture();
    const icon = page.locator('.react-flow__node img').first();
    await icon.waitFor({ state: 'visible' });
    const box = await icon.boundingBox();
    assert.ok(box.width >= 16, `icona troppo piccola: ${box.width}`);

    // Sullo schermo non basta: la spec chiede che l'icona sia dentro il PNG
    // catturato, perche' e' quel file che mostrano la vista da mobile e il
    // PDF. `html-to-image` deve inlineare l'<img> same-origin; lo si prova
    // decodificando davvero il file caricato, cercandoci il magenta
    // dell'icona pixel per pixel, non fidandosi che lo schermo basti.
    page.on('dialog', (dialog) => dialog.accept('Tavolo di prova'));
    await page.getByRole('button', { name: 'Salva il tavolo' }).click();
    await page.waitForTimeout(4000);
    const capture = calls.find((call) => call.path.endsWith('/capture'));
    assert.ok(capture?.png, 'il PNG catturato si legge');
    const base64 = capture.png.toString('base64');
    const hasMarkerColor = await page.evaluate(async (data) => {
        const image = new Image();
        const loaded = new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });
        image.src = `data:image/png;base64,${data}`;
        await loaded;
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context2d = canvas.getContext('2d');
        context2d.drawImage(image, 0, 0);
        const { data: pixels } = context2d.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 200 && pixels[i + 1] < 60 && pixels[i + 2] > 200) return true;
        }
        return false;
    }, base64);
    assert.ok(hasMarkerColor, "il magenta dell'icona e' nei pixel del PNG catturato, non solo sullo schermo");
    await context.close();
});

const responseFor = (page, method, suffix) => page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname.endsWith(suffix));

test('new pieces save immediately and survive reload without the extra plus workaround', async () => {
    const { page, context, calls } = await fixture({ composeOpen: false });
    await page.getByRole('button', { name: 'Aggiungi un pezzo', exact: true }).click();
    await page.getByLabel('Rinomina', { exact: true }).fill('Il mio nuovo pezzo');
    const written = responseFor(page, 'PUT', `/${ID}`);
    await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click();
    await written;
    await page.reload();
    await page.getByText('Il mio nuovo pezzo', { exact: true }).waitFor();
    assert.equal(await page.locator('.react-flow__node').count(), 5);
    assert.equal(calls.filter(call => call.method === 'PUT').at(-1).body.graph.nodes.at(-1).label, 'Il mio nuovo pezzo');
    await context.close();
});

test('save drains both edits when a second edit is made during a slow write', async () => {
    const { page, context, calls } = await fixture({ composeOpen: false });
    let release, started;
    const blocked = new Promise(resolve => { release = resolve; });
    const reached = new Promise(resolve => { started = resolve; });
    let delay = true;
    await page.route(`**/api/tavolo/${ID}`, async route => {
        if (route.request().method() === 'PUT' && delay) { delay = false; started(); await blocked; }
        return route.fallback();
    });
    await page.locator('.react-flow__node[data-id="a"]').click();
    await page.getByLabel('Rinomina', { exact: true }).fill('Prima modifica');
    await reached;
    await page.getByLabel('Rinomina', { exact: true }).fill('Ultime parole');
    page.once('dialog', dialog => dialog.accept('Salvataggio immediato'));
    const saved = responseFor(page, 'POST', '/save');
    await page.getByRole('button', { name: 'Salva il tavolo', exact: true }).click();
    release(); await saved;
    const writes = calls.filter(call => call.method === 'PUT');
    assert.deepEqual(writes.map(call => call.body.base_index), [4, 5]);
    assert.equal(writes.at(-1).body.graph.nodes[0].label, 'Ultime parole');
    assert.ok(calls.findIndex(call => call.path.endsWith('/save')) > calls.findLastIndex(call => call.method === 'PUT'));
    await page.reload();
    await page.locator('.react-flow__node[data-id="a"]').getByText('Ultime parole').waitFor();
    await context.close();
});

test('failed writes keep the edit for retry and block a false save', async () => {
    const { page, context, calls } = await fixture({ composeOpen: false });
    await page.route(`**/api/tavolo/${ID}`, route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, json: { detail: 'offline' } }) : route.fallback());
    await page.locator('.react-flow__node[data-id="a"]').click();
    await page.getByLabel('Rinomina', { exact: true }).fill('Conserva queste parole');
    await page.getByText(/^Modifiche non salvate\. Riprova prima di uscire\./).waitFor();
    page.once('dialog', dialog => dialog.accept('Non ancora'));
    await page.getByRole('button', { name: 'Salva il tavolo', exact: true }).click();
    await page.getByText('Non sono riuscito a salvare il tavolo. Riprova.', { exact: true }).waitFor();
    assert.equal(calls.filter(call => call.path.endsWith('/save')).length, 0);
    await page.unroute(`**/api/tavolo/${ID}`);
    const written = responseFor(page, 'PUT', `/${ID}`);
    await page.getByRole('button', { name: 'Riprova', exact: true }).click();
    await written; await page.reload();
    await page.getByText('Conserva queste parole', { exact: true }).waitFor();
    await context.close();
});

test('connect pieces offers linking words and clicking the words reopens their editor', async () => {
    const { page, context } = await fixture({ composeOpen: false });
    await page.getByRole('button', { name: 'Collega pezzi', exact: true }).click();
    await page.getByLabel('Da quale pezzo', { exact: true }).selectOption('a');
    await page.getByLabel('A quale pezzo', { exact: true }).selectOption('c');
    await page.getByLabel('Parole-legame', { exact: true }).fill('mi fa rimandare');
    await page.locator('aside form').getByRole('button', { name: 'Collega pezzi', exact: true }).click();
    const arrow = page.locator('.react-flow__edgelabel-renderer').getByRole('button', { name: 'mi fa rimandare', exact: true });
    await arrow.waitFor();
    await page.getByRole('button', { name: 'Allarga il tavolo', exact: true }).click();
    await arrow.click();
    assert.equal(await page.getByLabel('Parole-legame', { exact: true }).inputValue(), 'mi fa rimandare');
    await page.getByLabel('Parole-legame', { exact: true }).fill('contribuisce a');
    await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click();
    await page.getByText('Modifiche salvate', { exact: true }).waitFor();
    await page.reload();
    await page.locator('.react-flow__edgelabel-renderer').getByRole('button', { name: 'contribuisce a', exact: true }).waitFor();
    await context.close();
});

test('review shows proposals before accepting a connection with its required piece', async () => {
    const { page, context, calls } = await fixture({ composeOpen: false });
    await page.getByRole('button', { name: 'Visualizza proposte', exact: true }).click();
    const review = page.getByRole('region', { name: 'Visualizza proposte', exact: true });
    const connection = review.getByRole('listitem').filter({ hasText: 'Rimando → viene prima di → Meno tempo' });
    await connection.getByRole('button', { name: /Rimando/ }).click();
    assert.equal(calls.filter(call => call.path.endsWith('/settle')).length, 0);
    const response = responseFor(page, 'POST', '/settle');
    await connection.getByRole('button', { name: 'Accetta', exact: true }).click(); await response;
    assert.deepEqual(calls.find(call => call.path.endsWith('/settle')).body.ids.sort(), ['c->d', 'd']);
    await context.close();
});

test('questions use the chosen local counselor and the answer survives closing help', async () => {
    const { page, context, calls } = await fixture({ composeOpen: false });
    await page.getByLabel('Counselor del tavolo', { exact: true }).selectOption('29');
    await page.getByRole('button', { name: 'Chiedi al counselor', exact: true }).click();
    await page.getByLabel('Scrivi una domanda sul tavolo').fill('Come collego i pezzi?');
    await page.getByRole('button', { name: 'Invia domanda', exact: true }).click();
    await page.getByText('Scegli due pezzi e descrivi il loro legame.', { exact: true }).waitFor();
    assert.equal(calls.find(call => call.path.endsWith('/help')).body.counselor_id, 29);
    assert.equal(calls.filter(call => call.path.endsWith('/compose') || call.path.endsWith('/settle')).length, 0);
    await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
    await page.getByRole('button', { name: 'Chiedi al counselor', exact: true }).click();
    await page.getByText('Scegli due pezzi e descrivi il loro legame.', { exact: true }).waitFor();
    await context.close();
});

test('unconfigured AI is explained before composing and another counselor can be chosen', async () => {
    const { page, context } = await fixture({ composeOpen: false });
    await page.route('**/api/tavolo/capabilities*', route => route.fulfill({ json: { available: false, fallback_origin: null } }));
    await page.getByLabel('Counselor del tavolo', { exact: true }).selectOption('29');
    await page.getByText('La generazione AI non è configurata per questa scelta. Scegli un altro counselor; puoi comunque lavorare a mano.', { exact: true }).waitFor();
    await page.locator('details > summary').filter({ hasText: 'Scrivi uno schema' }).click();
    await page.getByLabel('Scrivi uno schema', { exact: true }).fill('Una mappa');
    assert.equal(await page.getByRole('button', { name: 'Componi', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Aggiungi un pezzo', exact: true }).isEnabled(), true);
    await page.unroute('**/api/tavolo/capabilities*');
    await page.getByLabel('Counselor del tavolo', { exact: true }).selectOption('1');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Componi' && !button.disabled));
    await context.close();
});

test('table names can be changed and deletion requires confirmation', async () => {
    const { page, context, calls } = await fixture({ composeOpen: false });
    await page.goto(`${origin}/tavolo`);
    page.once('dialog', dialog => dialog.accept('Nome corretto'));
    await page.getByRole('button', { name: 'Rinomina tavolo: Tavolo di prova', exact: true }).click();
    await page.getByRole('button', { name: 'Elimina tavolo: Nome corretto', exact: true }).waitFor();
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Elimina tavolo: Nome corretto', exact: true }).click();
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 0);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Elimina tavolo: Nome corretto', exact: true }).click();
    await page.getByText('Non hai ancora salvato nessun tavolo.', { exact: true }).waitFor();
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 1);
    await context.close();
});

for (const width of [390, 1440]) {
    test(`back returns to the visited tools list at ${width}px`, async () => {
        const { page, context } = await fixture({ composeOpen: false });
        await page.goto(`${origin}/profilo/tavolo`);
        await page.setViewportSize({ width, height: 900 });
        await page.getByRole('link').filter({ hasText: 'Tavolo di prova' }).click();
        await page.waitForURL(new RegExp(`/tavolo/${ID}`));
        await page.getByRole('button', { name: 'Indietro', exact: true }).last().click();
        await page.waitForURL(`${origin}/profilo/tavolo`);
        await page.getByRole('link').filter({ hasText: 'Tavolo di prova' }).waitFor();
        await context.close();
    });
}

test('light and dark table controls fit the desktop viewport', async () => {
    for (const dark of [false, true]) {
        const { page, context } = await fixture({ composeOpen: false, dark });
        await page.getByRole('button', { name: 'Visualizza proposte', exact: true }).click();
        const box = await page.locator('[data-tavolo-canvas]').boundingBox();
        assert.ok(box.height >= 180 && box.y + box.height <= 910, JSON.stringify(box));
        await page.screenshot({ path: `/tmp/tavolo-feedback-${dark ? 'dark' : 'light'}.png` });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        await context.close();
    }
});

for (const width of [390, 1440]) {
test(`embedded table returns to the same tools panel with browser and screen Back at ${width}px`, async () => {
    const { page, context } = await fixture({ composeOpen: false, width });
    await page.route('**/api/user/timeline*', route => route.fulfill({ json: {
        revision: 1, workspace: { actions: [], cards: [], comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' }, timeline: { title: '', events: [] } },
    } }));
    await page.route('**/api/orientation-directory*', route => route.fulfill({ json: { institution: null, events: [], referrals: [] } }));
    await page.goto(`${origin}/profilo/timeline`);
    const tools = page.getByRole('dialog');
    await tools.locator('summary').click();
    await tools.getByRole('tab', { name: 'Tavolo di lavoro', exact: true }).click();
    for (const method of ['screen', 'browser', 'escape']) {
        await page.getByRole('dialog').getByRole('link').filter({ hasText: 'Tavolo di prova' }).click();
        await page.getByRole('dialog').getByRole('heading', { level: 1 }).waitFor();
        assert.equal(new URL(page.url()).pathname, '/profilo/timeline');
        if (method === 'screen') await page.getByRole('dialog').getByRole('button', { name: 'Indietro', exact: true }).click();
        else if (method === 'browser') await page.goBack();
        else await page.keyboard.press('Escape');
        const returned = page.getByRole('dialog');
        await returned.getByRole('link').filter({ hasText: 'Tavolo di prova' }).waitFor();
        assert.equal(await returned.getByRole('tab', { name: 'Tavolo di lavoro', exact: true }).getAttribute('aria-selected'), 'true');
    }
    await context.close();
});

}

test('guide opened from a table returns to that table', async () => {
    const { page, context } = await fixture({ composeOpen: false });
    try {
        await page.goto(`${origin}/tavolo/${ID}`);
        await page.locator('a[href="/guide#guide-section-4"]').click();
        await page.waitForURL(/\/guide/);
        await page.getByRole('button', { name: 'Indietro', exact: true }).click();
        await page.waitForURL(new RegExp(`/tavolo/${ID}`));
        await page.locator('.react-flow__node').first().waitFor();
        assert.equal(new URL(page.url()).pathname, `/tavolo/${ID}`);
    } finally { await context.close(); }
});
