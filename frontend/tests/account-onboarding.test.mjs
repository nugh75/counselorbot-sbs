import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.ACCOUNT_BASE_URL || 'http://127.0.0.1:3107';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });
const ready = () => ({ counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true });
async function fixture({ prefs = ready(), width = 1440, required = false, incompatible = false, noHistory = false, locale = 'it', dark = false, groups = ['studenti'], admin = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ locale, dark }) => {
        localStorage.setItem('cb_lang', locale);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
    }, { locale, dark });
    const revision = { id: 1, data: { goal: 'Organizzare lo studio' }, created_at: '2026-09-08T10:00:00Z', source: 'intake' };
    const session = { session_id: 'account-fixture', status: 'completed', counselor_id: 2, language: 'it', messages: [{ role: 'assistant', content: 'Possiamo esplorare il QSA.' }], recommendations: [{ id: 'QSA', reason: 'Riflettere sullo studio' }] };
    await page.route('**/api/**', route => {
        const request = route.request(), url = new URL(request.url());
        let data = [];
        if (request.method() !== 'GET') writes.push({ path: url.pathname, body: request.postDataJSON() });
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: admin, username: 'account-fixture', name: 'Test', groups };
        else if (url.pathname === '/api/user/account-preferences') {
            if (request.method() === 'PUT') Object.assign(prefs, { counselor_id: request.postDataJSON().counselor_id ?? prefs.counselor_id, counselor_ready: true, setup_completed: prefs.notebook_ready });
            data = prefs;
        } else if (url.pathname === '/api/counselors') data = [1, 2].map(id => ({ id, name: `Counselor ${id}`, slug: `c${id}`, language: ['it'], is_active: true, suitable: !(incompatible && id === 1 && url.searchParams.has('questionnaire_type')), model_origin: 'local' }));
        else if (url.pathname === '/api/user/learner-profile') {
            if (request.method() === 'POST') { prefs.notebook_ready = true; revision.data = request.postDataJSON(); }
            data = prefs.notebook_ready ? revision : null;
        } else if (url.pathname === '/api/orientation/status') data = { required, completed: !required, latest_session_id: required || noHistory ? null : session.session_id };
        else if (url.pathname === '/api/orientation/sessions') data = { ...session, status: 'in_progress', counselor_id: request.postDataJSON().counselor_id };
        else if (url.pathname.startsWith('/api/orientation/sessions/')) data = session;
        else if (url.pathname === '/api/session/frozen/account-fixture') data = { ...session, questionnaire_type: 'QSA', current_phase: 'intro', experience: 'standard', scores: { C1: 7 }, messages: [{ role: 'user', content: 'Vorrei studiare meglio' }] };
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro', suggested_questions: [] }] };
        return route.fulfill({ json: data });
    });
    return { page, context, prefs, writes, errors };
}
// Real navigation labels are asserted independently of the production dictionaries.
const firstUseCopy = {
    it: { area: 'Area studente', notebook: 'Taccuino', menu: 'Menu', choose: 'Scegli il counselor', next: 'Continua', context: 'Parlaci del luogo dove studi / lavori', save: 'Salva versione', edit: 'Modifica', counselor: 'Potrai cambiare counselor in seguito', reopen: 'Potrai riaprire e modificare il taccuino' },
    en: { area: 'Student area', notebook: 'Notebook', menu: 'Menu', choose: 'Choose your counselor', next: 'Continue', context: 'Tell us about where you study / work', save: 'Save version', edit: 'Edit', counselor: 'You can change your counselor later', reopen: 'You can reopen and edit your notebook' },
    es: { area: 'Área del estudiante', notebook: 'Cuaderno', menu: 'Menú', choose: 'Elige tu counselor', next: 'Continuar', context: 'Cuéntanos dónde estudias / trabajas', save: 'Guardar versión', edit: 'Editar', counselor: 'Puedes cambiar de counselor más adelante', reopen: 'Puedes volver a abrir y editar tu cuaderno' },
    fr: { area: 'Espace élève', notebook: 'Carnet', menu: 'Menu', choose: 'Choisissez votre counselor', next: 'Continuer', context: 'Parle-nous du lieu où tu étudies / travailles', save: 'Enregistrer la version', edit: 'Modifier', counselor: 'Vous pourrez changer de counselor', reopen: 'Vous pourrez rouvrir et modifier votre carnet' },
    de: { area: 'Bereich für Lernende', notebook: 'Notizbuch', menu: 'Menü', choose: 'Wähle deinen Counselor', next: 'Weiter', context: 'Erzähl uns, wo du lernst / arbeitest', save: 'Version speichern', edit: 'Bearbeiten', counselor: 'Du kannst deinen Counselor später ändern', reopen: 'Du kannst dein Notizbuch' },
    sv: { area: 'Elevområde', notebook: 'Anteckningsbok', menu: 'Meny', choose: 'Välj din counselor', next: 'Fortsätt', context: 'Berätta var du studerar / arbetar', save: 'Spara version', edit: 'Redigera', counselor: 'Du kan byta counselor senare', reopen: 'Du kan öppna och redigera din anteckningsbok igen' },
};
const initialPrefs = () => ({ counselor_id: null, counselor_ready: false, notebook_ready: false, setup_completed: false });
const hint = (page, kind) => page.locator(`[data-first-use-hint="${kind}"]`).filter({ visible: true });

async function firstUseAndReopen({ locale = 'it', width = 1440, ...options } = {}) {
    const copy = firstUseCopy[locale];
    const { page, context, prefs, writes, errors } = await fixture({ locale, width, ...options, noHistory: true, prefs: initialPrefs() });
    try {
        await page.goto(`${origin}/bussola`);
        const counselorHint = hint(page, 'counselor');
        await counselorHint.waitFor();
        assert.equal(await counselorHint.count(), 1);
        assert.ok((await counselorHint.innerText()).startsWith(copy.counselor));
        assert.equal((await counselorHint.innerText()).includes(copy.menu), width < 1024);
        assert.equal(await hint(page, 'notebook').count(), 0);
        assert.equal(writes.length, 0);
        const card = page.getByRole('button', { name: /Counselor 1/ });
        assert.ok((await counselorHint.boundingBox()).y < (await card.boundingBox()).y);
        await page.screenshot({ path: `/tmp/first-use-counselor-${locale}-${width}.png`, fullPage: true });
        await card.click();
        assert.equal(writes.length, 0, 'counselor remains a draft until confirmation');
        await page.getByRole('button', { name: copy.next, exact: true }).click();
        const notebookHint = hint(page, 'notebook');
        await notebookHint.waitFor();
        assert.equal(await hint(page, 'counselor').count(), 0);
        const text = await notebookHint.innerText();
        assert.ok(text.startsWith(copy.reopen));
        assert.ok(text.includes(copy.area) && text.includes(copy.notebook));
        assert.equal(text.includes(copy.menu), width < 1024);
        const field = page.getByLabel(copy.context);
        await field.waitFor();
        assert.ok((await notebookHint.boundingBox()).y < (await field.boundingBox()).y);
        assert.equal(writes.filter(w => w.path === '/api/user/learner-profile').length, 0);
        await page.screenshot({ path: `/tmp/first-use-notebook-${locale}-${width}.png`, fullPage: true });
        await field.fill('Studio sintetico primo uso');
        await page.getByRole('button', { name: copy.save, exact: true }).click();
        await page.waitForURL(`${origin}/bussola`);
        assert.deepEqual(prefs, ready());
        assert.equal(writes.filter(w => w.path === '/api/user/learner-profile').length, 1);
        assert.equal(writes.find(w => w.path === '/api/user/learner-profile').body.context, 'Studio sintetico primo uso');
        assert.equal(await page.locator('[data-first-use-hint]').count(), 0);
        // Follow exactly the entry points described by the notes.
        if (width < 1024) await page.locator('button[aria-controls="mobile-menu"]').click();
        // From 1024px accounts with more than one area open the «Area» selector (P4).
        else if (await page.locator('button[aria-controls="area-panel"]').count()) await page.locator('button[aria-controls="area-panel"]').click();
        await page.locator('header').getByRole('link', { name: copy.area, exact: true }).filter({ visible: true }).click();
        await page.locator('[data-personal-area-home]').getByRole('link', { name: copy.notebook, exact: true }).click();
        await page.waitForURL(`${origin}/profilo/taccuino`);
        await page.getByText('Studio sintetico primo uso', { exact: true }).waitFor();
        await page.getByRole('button', { name: copy.edit, exact: true }).click();
        await field.waitFor();
        assert.equal(await field.inputValue(), 'Studio sintetico primo uso');
        assert.equal(await page.locator('[data-first-use-hint]').count(), 0);
        if (width < 1024) await page.locator('button[aria-controls="mobile-menu"]').click();
        const counselorLink = page.locator('header').getByRole('link', { name: copy.choose, exact: true }).filter({ visible: true });
        await counselorLink.getByText('Counselor 1', { exact: true }).waitFor();
        assert.equal(await counselorLink.innerText(), 'Counselor 1');
        await counselorLink.click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: /Counselor 2/ }).click();
        assert.equal(prefs.counselor_id, 1);
        assert.equal(await dialog.locator('[data-first-use-hint]').count(), 0, 'later counselor changes do not repeat first-use hints');
        await dialog.getByRole('button', { name: copy.next, exact: true }).click();
        await field.waitFor();
        assert.equal(prefs.counselor_id, 2);
        assert.equal(await field.inputValue(), 'Studio sintetico primo uso');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
}
for (const locale of Object.keys(firstUseCopy)) {
    for (const width of [390, 1440]) {
        test(`first-use hints and real reopen access in ${locale} at ${width}px`, () => firstUseAndReopen({ locale, width, dark: locale === 'de' }));
    }
}
for (const width of [1023, 1024, 1279, 1280]) {
    test(`first-use hints follow the navbar breakpoint at ${width}px`, () => firstUseAndReopen({ width }));
}
for (const [role, options] of [['teacher', { groups: ['docenti'] }], ['researcher', { groups: ['ricercatori'] }], ['admin', { groups: ['admins'], admin: true }]]) {
    test(`shared personal first-use invitation for ${role}`, () => firstUseAndReopen(options));
}
test('first counselor hint also appears when an existing notebook skips its step', async () => {
    const { page, context } = await fixture({ prefs: { ...initialPrefs(), notebook_ready: true } });
    try {
        await page.goto(`${origin}/bussola`);
        await page.waitForURL(/\/counselor\?/);
        await hint(page, 'counselor').waitFor();
        assert.equal(await hint(page, 'notebook').count(), 0);
    } finally { await context.close(); }
});

for (const width of [390, 1440]) {
    test(`initial setup once and dedicated counselor navigation at ${width}px`, async () => {
        const { page, context, prefs, writes, errors } = await fixture({ width, noHistory: true, prefs: { counselor_id: null, counselor_ready: false, notebook_ready: false, setup_completed: false } });
        try {
            await page.goto(`${origin}/bussola`);
            await page.getByRole('heading', { name: 'Prepara il tuo spazio', exact: true }).waitFor();
            await page.getByRole('button', { name: /Counselor 1/ }).click();
            assert.equal(writes.length, 0, 'selection is a draft until confirmation');
            await page.getByRole('button', { name: 'Continua', exact: true }).click();
            await page.getByLabel('Parlaci del luogo dove studi / lavori').fill('Studio all’università');
            await page.getByRole('button', { name: 'Salva versione', exact: true }).click();
            await page.getByRole('heading', { name: 'Da dove vuoi cominciare?', exact: true }).waitFor();
            assert.deepEqual(prefs, ready());
            await page.getByRole('button', { name: 'Esplora attività e percorsi', exact: true }).click();
            await page.getByRole('button', { name: 'Analizza i risultati', exact: true }).first().click();
            await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: 'È ancora così', exact: true }).count(), 0);
            await page.goto(`${origin}/counselor`);
            await page.getByRole('button', { name: /Counselor 2/ }).click();
            assert.equal(prefs.counselor_id, 1);
            await page.getByRole('button', { name: 'Continua', exact: true }).click();
            await page.waitForURL(`${origin}/`);
            assert.equal(prefs.counselor_id, 2);
            await page.evaluate(() => localStorage.removeItem('counselorbot_selected_counselor'));
            await page.reload();
            await page.waitForFunction(() => localStorage.getItem('counselorbot_selected_counselor') === '2');
            if (width < 1024) await page.locator('button[aria-controls="mobile-menu"]').click();
            await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).filter({ visible: true }).click();
            await page.getByRole('heading', { name: 'Scegli il counselor', exact: true }).waitFor();
            assert.equal(await page.locator('main select').count(), 0);
            assert.equal(await page.locator('#mobile-menu').count(), 0);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(errors, []);
            await page.screenshot({ path: `/tmp/account-counselor-${width}.png`, fullPage: true });
        } finally { await context.close(); }
    });
}
test('new Compass and recommended tools reuse defaults without notebook interruptions', async () => {
    const { page, context, writes } = await fixture();
    try {
        await page.goto(`${origin}/bussola`);
        await page.getByRole('button', { name: 'Inizia un nuovo orientamento', exact: true }).click();
        await page.locator('#bussola-composer').waitFor();
        assert.equal(writes.find(w => w.path === '/api/orientation/sessions').body.counselor_id, 1);
        await page.getByRole('button', { name: 'Esplora questo strumento', exact: true }).click();
        await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
        assert.equal(writes.filter(w => w.path === '/api/user/learner-profile').length, 0);
    } finally { await context.close(); }
});
test('incompatible counselor reopens selection inside the flow and cannot be confirmed', async () => {
    const { page, context, prefs } = await fixture({ incompatible: true });
    try {
        await page.goto(`${origin}/?start=QSA`);
        await page.getByRole('heading', { name: 'Scegli il counselor', exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, '/', 'input stays in the same flow');
        assert.equal(await page.getByRole('button', { name: 'Continua', exact: true }).isDisabled(), true);
        await page.getByRole('button', { name: /Counselor 2/ }).click();
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
        assert.equal(prefs.counselor_id, 2);
    } finally { await context.close(); }
});
test('frozen conversation keeps its own counselor and account defaults stay unchanged', async () => {
    const { page, context, prefs, writes } = await fixture();
    try {
        await page.goto(`${origin}/?frozen=account-fixture`);
        await page.locator('#guided-composer').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('counselorbot_selected_counselor')), '2');
        assert.equal(prefs.counselor_id, 1);
        await page.evaluate(() => {
            localStorage.setItem('counselorbot_selected_counselor', '1');
            window.dispatchEvent(new Event('storage'));
        });
        await page.locator('#guided-composer').fill('Come posso organizzarmi?');
        await page.locator('#guided-composer').press('Enter');
        await page.waitForTimeout(500);
        const turn = writes.find(w => w.body?.message === 'Come posso organizzarmi?');
        assert.equal(turn?.body.counselor_id, 2, 'changing defaults cannot alter the active conversation');
        assert.equal(await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).innerText(), 'Counselor 2');
    } finally { await context.close(); }
});

test('setup load errors offer retry instead of silently opening an instrument', async () => {
    const { page, context } = await fixture();
    try {
        await page.route('**/api/user/account-preferences', route => route.fulfill({ status: 503, json: {} }));
        await page.goto(`${origin}/?start=QSA`);
        await page.getByRole('button', { name: 'Riprova', exact: true }).waitFor();
        assert.equal(await page.getByText('Inserimento Manuale', { exact: true }).count(), 0);
        await page.unroute('**/api/user/account-preferences');
        await page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await page.getByText('Inserimento Manuale', { exact: true }).waitFor();
    } finally { await context.close(); }
});

test('failed counselor save keeps the previous account preference and can be retried', async () => {
    const { page, context, prefs } = await fixture();
    try {
        await page.goto(`${origin}/counselor`);
        await page.getByRole('button', { name: /Counselor 2/ }).click();
        await page.route('**/api/user/account-preferences', route => route.request().method() === 'PUT'
            ? route.fulfill({ status: 503, json: {} }) : route.fallback());
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        await page.getByRole('button', { name: 'Riprova', exact: true }).waitFor();
        assert.equal(prefs.counselor_id, 1);
        await page.unroute('**/api/user/account-preferences');
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        await page.waitForURL(`${origin}/`);
        assert.equal(prefs.counselor_id, 2);
    } finally { await context.close(); }
});

for (const width of [390, 1024, 1440]) {
    test(`navbar counselor returns to the same conversation and draft at ${width}px`, async () => {
        const { page, context, prefs } = await fixture({ width });
        try {
            await page.goto(`${origin}/?frozen=account-fixture`);
            const composer = page.locator('#guided-composer');
            await composer.fill('Una domanda ancora da completare');
            const openCounselor = async () => {
                if (width < 1024) await page.locator('button[aria-controls="mobile-menu"]').click();
                await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).filter({ visible: true }).click();
                await page.getByRole('heading', { name: 'Scegli il counselor', exact: true }).waitFor();
            };
            await openCounselor();
            await page.getByRole('button', { name: /Counselor 2/ }).click();
            await page.getByRole('button', { name: 'Continua', exact: true }).click();
            await composer.waitFor();
            assert.equal(await composer.inputValue(), 'Una domanda ancora da completare');
            assert.equal(prefs.counselor_id, 2);
            await openCounselor();
            await page.getByRole('button', { name: /Counselor 1/ }).click();
            await page.getByRole('dialog').getByRole('button', { name: 'Indietro', exact: true }).click();
            await composer.waitFor();
            assert.equal(await composer.inputValue(), 'Una domanda ancora da completare');
            assert.equal(prefs.counselor_id, 2, 'cancelling does not save the draft selection');
        } finally { await context.close(); }
    });
}

test('counselor selection preserves the Compass draft and closes with Escape', async () => {
    const { page, context } = await fixture();
    try {
        await page.goto(`${origin}/bussola`);
        await page.getByRole('button', { name: 'Inizia un nuovo orientamento', exact: true }).click();
        const composer = page.locator('#bussola-composer');
        await composer.fill('Vorrei parlare delle mie scelte');
        await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).click();
        await page.getByRole('dialog', { name: 'Scegli il counselor', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await composer.waitFor();
        assert.equal(await composer.inputValue(), 'Vorrei parlare delle mie scelte');
        assert.equal(new URL(page.url()).pathname, '/bussola');
        await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Continua', exact: true }).click();
        await composer.waitFor();
        assert.equal(await composer.inputValue(), 'Vorrei parlare delle mie scelte');
    } finally { await context.close(); }
});

test('counselor selection preserves manual score entry before a session exists', async () => {
    const { page, context } = await fixture();
    try {
        await page.goto(`${origin}/?start=QSA`);
        await page.getByText('Inserimento Manuale', { exact: true }).click();
        await page.getByRole('button', { name: 'Continua', exact: true }).click();
        const score = page.locator('main input[inputmode="numeric"]').first();
        await score.fill('7');
        await page.getByRole('link', { name: 'Scegli il counselor', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Continua', exact: true }).click();
        await score.waitFor();
        assert.equal(await score.inputValue(), '7');
    } finally { await context.close(); }
});

for (const width of [390, 1440]) {
    test(`compact illustrated introduction and optional details at ${width}px`, async () => {
        const { page, context, errors } = await fixture({ width, noHistory: true, prefs: { counselor_id: null, counselor_ready: false, notebook_ready: false, setup_completed: false } });
        try {
            await page.goto(`${origin}/`);
            const start = page.getByRole('button', { name: 'Apri Bussola', exact: true });
            await start.waitFor();
            assert.equal(await start.count(), 1);
            const tools = page.getByRole('button', { name: 'Vedi tutte le attività e i percorsi', exact: true });
            await tools.waitFor();
            assert.equal(await tools.count(), 1);
            const intro = page.getByTestId('intro-screen');
            assert.deepEqual(await intro.locator('article h3').allTextContents(), ['Bussola', 'Analisi questionari', 'Percorsi guidati', 'Area studente e strumenti']);
            const images = intro.locator('img');
            assert.equal(await images.count(), 5);
            // Satisfaction questionnaire (moved from the navbar): the control right after the catalogue link.
            const feedback = intro.getByRole('link', { name: 'Dicci com’è andata Questionario di gradimento: aiutaci a migliorare CounselorBot.', exact: true });
            assert.equal(await feedback.getAttribute('href'), '/questionario');
            assert.equal(await tools.evaluate(el => el.parentElement.nextElementSibling?.getAttribute('href')), '/questionario');
            await feedback.scrollIntoViewIfNeeded(); // below the fold on phones: lazy image
            await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="intro-screen"] img')].every(img => img.complete && img.naturalWidth > 0));
            assert.equal(await intro.getByRole('link', { name: 'Apri Area studente', exact: true }).getAttribute('href'), '/profilo');
            assert.equal(await intro.locator('details[open]').count(), 0);
            assert.equal(await intro.locator('details').count(), 3);
            assert.equal(await intro.locator('details[data-section=start]').count(), 0);
            assert.equal(await intro.getByRole('link', { name: 'Guida all’uso', exact: true }).getAttribute('href'), '/guide');
            const cards = await intro.locator('article').evaluateAll(items => items.map(item => {
                const { x, y } = item.getBoundingClientRect();
                return { x, y };
            }));
            if (width >= 640) {
                assert.equal(cards[0].y, cards[1].y);
                assert.equal(cards[2].y, cards[3].y);
                assert.ok(cards[1].x > cards[0].x && cards[2].y > cards[0].y);
            } else {
                assert.ok(cards.every((card, i) => i === 0 || card.y > cards[i - 1].y));
            }
            const support = intro.locator('details[data-section=personal]');
            await support.locator('summary').focus();
            await page.keyboard.press('Enter');
            assert.equal(await support.getAttribute('open'), '');
            assert.equal(await support.getByText(/Nell’Area studente/).isVisible(), true);
            assert.match(await support.innerText(), /Portfolio/);
            assert.match(await support.innerText(), /Tavolo/);
            await page.keyboard.press('Enter');
            const questionnaires = intro.locator('details[data-section=questionnaires]');
            await questionnaires.locator('summary').click();
            assert.equal(await questionnaires.getByRole('link', { name: 'competenzestrategiche.it' }).getAttribute('href'), 'https://www.competenzestrategiche.it/');
            await questionnaires.locator('summary').click();
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `/tmp/intro-illustrated-${width}.png`, fullPage: true });
            await start.click();
            await page.getByRole('heading', { name: 'Prepara il tuo spazio', exact: true }).waitFor();
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

for (const width of [390, 1440]) {
    test(`back from incompatible counselor selection returns to tools at ${width}px`, async () => {
        const { page, context, prefs } = await fixture({ width, incompatible: true });
        try {
            await page.goto(`${origin}/?view=questionnaires`);
            await page.getByRole('heading', { name: 'QSA', exact: true }).click();
            await page.getByRole('button', { name: 'Continua', exact: true }).click();
            await page.getByRole('heading', { name: 'Scegli il counselor', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Indietro', exact: true }).click();
            await page.getByRole('button', { name: /^QSA\s/ }).waitFor();
            assert.equal(prefs.counselor_id, 1);
            assert.equal(await page.getByRole('heading', { name: 'Scegli il counselor', exact: true }).count(), 0);
        } finally { await context.close(); }
    });
}

test('instrument details return to the actual catalog rather than the home screen', async () => {
    const { page, context } = await fixture();
    try {
        await page.goto(`${origin}/?view=questionnaires`);
        await page.locator('a[href="/strumenti/QSA"]').click();
        await page.waitForURL(/\/strumenti\//);
        await page.getByRole('button', { name: 'Indietro', exact: true }).click();
        await page.getByRole('heading', { name: 'QSA', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Continua', exact: true }).count(), 1);
    } finally { await context.close(); }
});

for (const [locale, width, dark, title] of [['de', 320, true, 'Fragebogenanalyse'], ['sv', 768, false, 'Analys av frågeformulär']]) {
    test(`illustrated introduction remains readable in ${locale} at ${width}px, dark=${dark}`, async () => {
        const { page, context, errors } = await fixture({ width, locale, dark, noHistory: true, prefs: { counselor_id: null, counselor_ready: false, notebook_ready: false, setup_completed: false } });
        try {
            await page.goto(`${origin}/`);
            const intro = page.getByTestId('intro-screen');
            await intro.getByRole('heading', { name: title, exact: true }).waitFor();
            assert.equal(await intro.locator('article').count(), 4);
            assert.equal(await intro.locator('details[open]').count(), 0);
            assert.equal((await intro.innerText()).includes('app.intro.'), false);
            assert.ok(await intro.evaluate(el => [...el.querySelectorAll('article, a[href="/questionario"]')].every(card => card.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1)), 'long translated titles stay within the page');
            await intro.locator('a[href="/questionario"]').scrollIntoViewIfNeeded(); // lazy image below the fold
            await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="intro-screen"] img')].every(img => img.complete && img.naturalWidth > 0));
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.waitForFunction(() => {
                let element = document.querySelector('[data-testid="intro-screen"]');
                while (element) {
                    if (Number(getComputedStyle(element).opacity) < 0.99) return false;
                    element = element.parentElement;
                }
                return true;
            });
            await page.screenshot({ path: `/tmp/intro-illustrated-${locale}-${width}.png`, fullPage: true });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}


test('data and privacy explains conditional protection and returns to the introduction for returning users', async () => {
    const { page, context, errors, writes } = await fixture();
    try {
        await page.goto(`${origin}/?view=intro`);
        await page.getByTestId('intro-screen').waitFor();
        await page.getByRole('link', { name: 'Dati e riservatezza', exact: true }).click();
        await page.getByRole('heading', { name: 'Dati e riservatezza', exact: true }).waitFor();
        assert.match(await page.locator('main').innerText(), /non garantisce l’anonimato/);
        assert.match(await page.locator('main').innerText(), /revocabili/);
        await page.getByRole('link', { name: 'Torna alla presentazione', exact: true }).click();
        await page.getByTestId('intro-screen').waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Analisi questionari', exact: true }).isVisible(), true);
        assert.deepEqual(writes, []);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

for (const remember of [false, true]) {
    test(`input method is remembered only by choice: ${remember}`, async () => {
        const { page, context } = await fixture();
        try {
            await page.goto(`${origin}/?start=QSA`);
            const checkbox = page.getByRole('checkbox', { name: 'Ricorda questa scelta per i prossimi questionari', exact: true });
            await checkbox.waitFor();
            assert.equal(await checkbox.isChecked(), false);
            await checkbox.setChecked(remember);
            await page.getByRole('button', { name: /^Inserimento Manuale/ }).dblclick();
            assert.equal(await page.evaluate(() => localStorage.getItem('counselorbot_input_method')), remember ? 'manual' : null);
            await page.getByRole('button', { name: 'Indietro', exact: true }).click();
            await checkbox.waitFor();
            assert.equal(await checkbox.isChecked(), remember);
            await checkbox.uncheck();
            await page.getByRole('button', { name: /^Inserimento Manuale/ }).click();
            await page.getByRole('button', { name: 'Continua', exact: true }).click();
            assert.equal(await page.evaluate(() => localStorage.getItem('counselorbot_input_method')), null);
        } finally { await context.close(); }
    });
    test(`chat mode is remembered only by choice: ${remember}`, async () => {
        const { page, context } = await fixture();
        try {
            await page.goto(`${origin}/?start=SAVICKAS`);
            const checkbox = page.getByRole('checkbox', { name: 'Ricorda questa modalità per le prossime attività', exact: true });
            await checkbox.waitFor();
            assert.equal(await checkbox.isChecked(), false);
            await checkbox.setChecked(remember);
            await page.getByRole('button', { name: 'Chat Guidata', exact: true }).click();
            assert.equal(await page.evaluate(() => localStorage.getItem('counselorbot_experience')), remember ? 'standard' : null);
        } finally { await context.close(); }
    });
}

for (const width of [390, 1440]) {
    test(`introduction entries reach their category or the complete catalog at ${width}px`, async () => {
        const { page, context, errors } = await fixture({ width });
        try {
            await page.emulateMedia({ reducedMotion: width >= 640 ? 'no-preference' : 'reduce' });
            for (const [label, target] of [['Esplora le analisi', 'tools-assessment'], ['Esplora i percorsi', 'tools-guided']]) {
                await page.goto(`${origin}/?view=intro`);
                await page.getByTestId('intro-screen').getByRole('button', { name: label, exact: true }).click();
                await page.getByRole('heading', { name: 'Attività e percorsi', exact: true }).waitFor();
                await page.waitForFunction(id => {
                    const box = document.getElementById(id)?.getBoundingClientRect();
                    return box && box.top >= 0 && box.top < innerHeight / 2;
                }, target);
                await page.getByRole('button', { name: 'Torna alla presentazione', exact: true }).click();
                await page.getByTestId('intro-screen').waitFor();
            }
            await page.getByTestId('intro-screen').getByRole('button', { name: 'Vedi tutte le attività e i percorsi', exact: true }).click();
            await page.getByRole('heading', { name: 'Attività e percorsi', exact: true }).waitFor();
            assert.equal(await page.locator('main article').count(), 11);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
