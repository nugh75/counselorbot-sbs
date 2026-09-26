import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Lotto 1B (audit Area personale): gli errori di caricamento sono distinguibili
// dal vuoto, con Riprova; l'uscita dal gruppo è confermata; il pQBL promette
// solo ciò che il backend accetta.
const origin = process.env.PERSONAL_1B_BASE_URL || 'http://127.0.0.1:3108';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const identity = { authenticated: true, username: 'student-1b', name: 'Studente 1B', is_admin: false, groups: ['studenti'] };

// Dopo il primo 503 il riprova deve incontrare dati validi, non il backend reale:
// questi payload statici rappresentano il secondo tentativo riuscito.
const OK_DATA = {
    '/user/learner-profile': null,
    '/user/questionnaire-results': [],
    '/user/portfolio': [],
    '/user/portfolio/categories': [],
    '/user/groups': [],
};

const failOnce = (path, state) => async route => {
    if (route.request().method() === 'GET' && !state.failed) {
        state.failed = true;
        return route.fulfill({ status: 503, body: '{}' });
    }
    return route.fulfill({ json: OK_DATA[path] });
};

async function fixture(width, handlers) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        const path = url.pathname.slice(4);
        const handler = handlers[path] || handlers[path.split('/').slice(0, 3).join('/')] || handlers[path.split('/').slice(0, 2).join('/')];
        if (handler) return handler(route, path, url);
        let data = [];
        if (path === '/auth/me') data = identity;
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        else if (path === '/orientation-directory') data = { institution: null, events: [] };
        else if (path === '/telegram/bot-info') data = { bot_username: 'CounselorBotDemoBot' };
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

for (const [label, path, ready, errorText] of [
    ['Taccuino', '/profilo/taccuino', page => page.getByRole('button', { name: 'Modifica', exact: true }).waitFor(), 'Impossibile caricare il taccuino'],
    ['Compilazioni', '/profilo/compilazioni', page => page.getByRole('heading', { name: 'Le mie compilazioni', exact: false }).first().waitFor(), 'Impossibile caricare le compilazioni'],
    ['Portfolio', '/profilo/portfolio', page => page.getByRole('button', { name: 'Nuovo lavoro', exact: true }).waitFor(), 'Impossibile caricare il Portfolio'],
    ['Classi', '/profilo/classi', page => page.getByText('Codice di invito', { exact: false }).first().waitFor(), 'Impossibile caricare i gruppi'],
]) {
    test(`${label}: a 503 is an error with retry, never an empty state`, async () => {
        const state = { failed: false, recovered: false };
        const failUntilRecovered = path => async route => {
            if (!state.recovered) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ json: OK_DATA[path] });
        };
        const { page, context, errors } = await fixture(390, {
            '/user/learner-profile': failUntilRecovered('/user/learner-profile'),
            '/user/questionnaire-results': failUntilRecovered('/user/questionnaire-results'),
            '/user/portfolio': failUntilRecovered('/user/portfolio'),
            '/user/portfolio/categories': failUntilRecovered('/user/portfolio/categories'),
            '/user/groups': failUntilRecovered('/user/groups'),
        });
        try {
            await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
            await ready(page).catch(() => {});
            const alert = page.getByRole('alert').filter({ hasText: errorText });
            await alert.waitFor({ timeout: 15000 });
            // Il riprova funziona: il secondo tentativo non è in 503.
            state.recovered = true;
            await alert.getByRole('button', { name: 'Riprova' }).click();
            await page.waitForTimeout(1500);
            assert.equal(await page.getByRole('alert').filter({ hasText: errorText }).count(), 0, 'retry clears the error');
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('Telegram: a 503 is not "not linked"', async () => {
    const state = { recovered: false };
    const { page, context, errors } = await fixture(390, {
        '/telegram/link-status': async route => {
            if (!state.recovered) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ json: { linked: true, telegram_username: 'demo' } });
        },
    });
    try {
        await page.goto(`${origin}/profilo/telegram`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('alert').filter({ hasText: 'Impossibile verificare lo stato' }).waitFor({ timeout: 15000 });
        assert.equal(await page.getByText('Telegram not linked').count(), 0, 'the failure is not shown as unlinked');
        state.recovered = true;
        await page.getByRole('button', { name: 'Riprova' }).click();
        await page.getByText('Telegram collegato', { exact: false }).first().waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('leaving a group asks first and names the group', async () => {
    let deleted = false;
    const groups = [{ membership_id: 3, group_id: 91, name: 'Classe 3B', code: 'GR-ABC123', joined_via: 'web', joined_at: '2026-09-01T00:00:00Z' }];
    const { page, context, errors } = await fixture(390, {
        '/user/groups': async (route, p) => {
            if (p === '/user/groups' && route.request().method() === 'GET') return route.fulfill({ json: deleted ? [] : groups });
            if (route.request().method() === 'DELETE') { deleted = true; return route.fulfill({ json: { ok: true } }); }
            return route.fulfill({ json: [] });
        },
    });
    try {
        await page.goto(`${origin}/profilo/classi`, { waitUntil: 'domcontentloaded' });
        const leave = page.getByRole('button', { name: 'Lascia il gruppo: Classe 3B' });
        await leave.waitFor();
        await leave.click();
        // La conferma nomina il gruppo e cancella non perde nulla.
        const question = page.getByText('Lasciare «Classe 3B»?');
        await question.waitFor();
        await page.getByRole('group').getByRole('button', { name: 'No', exact: false }).click();
        assert.equal(deleted, false, 'cancel sends no DELETE');
        await leave.click();
        await page.getByRole('group').getByRole('button', { name: 'Sì', exact: false }).first().click();
        await page.waitForTimeout(800);
        assert.equal(deleted, true, 'confirm sends the DELETE');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('the pQBL uploader promises only PDFs', async () => {
    const { page, context } = await fixture(390, {});
    try {
        await page.goto(`${origin}/profilo/pqbl`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        const main = await page.locator('main').innerText();
        assert.doesNotMatch(main, /PDF o Immagine/);
        assert.doesNotMatch(main, /JPG/);
        assert.match(main, /100 MB/);
    } finally { await context.close(); }
});
