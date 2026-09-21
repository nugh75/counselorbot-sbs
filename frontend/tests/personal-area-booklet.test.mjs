import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.PERSONAL_AREA_BASE_URL || 'http://127.0.0.1:3000';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const state = { writes: [], errors: [] };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') {
            data = { authenticated: true, username: 'booklet-test', name: 'Studente', email: 'student@example.test', groups: ['studenti'], is_admin: false };
        } else if (path === '/api/user/questionnaire-results') {
            data = [];
        } else if (path === '/api/user/student-booklets/instrument/QSA/list') {
            data = [{
                id: 7, username: 'booklet-test', session_id: null, questionnaire_type: 'QSA',
                data: { title: 'Il mio percorso', bio_date: '2026-09-20', bio_context: 'Laboratorio', bio_discovery: 'So collaborare', bio_keywords: 'gruppo' },
                created_at: '2026-09-20T10:00:00Z', updated_at: null,
            }];
        } else if (path === '/api/user/student-booklets/id/7' && request.method() === 'PUT') {
            const body = request.postDataJSON();
            state.writes.push(body.data);
            data = { id: 7, username: 'booklet-test', session_id: null, questionnaire_type: 'QSA', data: body.data, created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-21T10:00:00Z' };
        }
        return route.fulfill({ json: data });
    });
    return { page, context, state };
}

for (const width of [390, 1280]) {
    test(`booklet adds biography events with a left-hand back button at ${width}px`, async () => {
        const { page, context, state } = await fixture(width);
        try {
            await page.goto(`${origin}/profilo/libretto`, { waitUntil: 'networkidle' });
            const heading = page.getByRole('heading', { name: 'Libretto dello studente', exact: true }).first();
            const back = page.getByRole('button', { name: 'Indietro', exact: true }).first();
            await heading.waitFor();
            const [headingBox, backBox] = await Promise.all([heading.boundingBox(), back.boundingBox()]);
            assert.ok(backBox.x < headingBox.x, 'back button is to the left of the page title');
            assert.ok(backBox.height >= 44, 'back button keeps a touch-sized target');

            assert.equal(await page.getByRole('heading', { name: 'Evento 1', exact: true }).count(), 1);
            await page.getByRole('button', { name: 'Aggiungi evento', exact: true }).click();
            const second = page.locator('section[aria-labelledby^="biography-event-"]').nth(1);
            await second.getByLabel('Data', { exact: true }).fill('2026-09-21');
            await second.getByLabel('In occasione di', { exact: true }).fill('Tirocinio');
            await second.getByLabel('Ho scoperto che', { exact: true }).fill('So osservare');
            await second.getByLabel('Parole chiave', { exact: true }).fill('ascolto');
            await page.getByRole('button', { name: 'Salva', exact: true }).click();
            await page.getByText('Scheda salvata.', { exact: true }).waitFor();

            assert.equal(state.writes.length, 1);
            assert.equal(state.writes[0].bio_events.length, 2);
            assert.equal(state.writes[0].bio_events[1].context, 'Tirocinio');
            assert.equal(state.writes[0].bio_context, 'Laboratorio');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(state.errors, []);
            await page.screenshot({ path: `/tmp/personal-area-booklet-${width}.png`, fullPage: true });
        } finally {
            await context.close();
        }
    });
}
