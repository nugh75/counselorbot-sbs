import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.DESIGN_BASE_URL || 'http://127.0.0.1:3000').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({ width = 390, height = 844, touch = true, locale = 'it', admin = false, dark = false, motion = 'reduce', experience = 'standard' } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion: motion, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ locale, dark }) => {
        localStorage.setItem('cb_lang', locale);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
        localStorage.setItem('counselorbot_selected_counselor', '1');
    }, { locale, dark });
    const snapshot = {
        session_id: 'design-fixture', questionnaire_type: 'QSA', current_phase: 'intro', counselor_id: 1,
        locale, response_length: 'medium', experience, scores: { C1: 7, C2: 5 },
        messages: [{ role: 'system', content: '--- Introduzione ---' }, ...Array.from({ length: 16 }, (_, i) => ({
            role: i % 2 ? 'assistant' : 'user',
            content: i % 2 ? 'Possiamo partire da una situazione concreta. Pensa all’ultima volta che hai studiato: che cosa ti ha aiutato a iniziare e che cosa ti ha fatto interrompere?' : 'Vorrei organizzare meglio lo studio.',
        }))],
    };
    // Every API request is local to this fixture, including automatic freezing.
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: admin, username: 'design-fixture', name: 'Studente con un nome molto lungo per la prova', groups: [admin ? 'admins' : 'studenti'] };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, name: 'Counselor di prova con nome lungo', slug: 'fixture', language: ['it'], questionnaire_types: ['QSA', 'SAVICKAS'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/user/learner-profile') data = { created_at: '2026-09-05T08:00:00Z', profile: {} };
        else if (url.pathname === '/api/orientation/status') data = { required: false };
        else if (url.pathname === '/api/session/frozen') data = [{ ...snapshot, label: 'QSA · Organizzare lo studio' }];
        else if (url.pathname === '/api/session/frozen/design-fixture') data = snapshot;
        else if (url.pathname === '/api/opencode/workspace') data = { key: 'design-fixture', api_available: true, session_id: 'opencode-fixture', needs_seed: false, history: snapshot.messages.filter(message => message.role !== 'system') };
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro', suggested_questions: ['Come funziona questo percorso?'] }] };
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    return { page, context, errors };
}

async function settled(page) {
    await page.evaluate(() => document.fonts.ready);
    // Allow the theme's 150 ms colour transition and viewport measurement to settle.
    await page.waitForTimeout(200);
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 720], [1440, 1000]]) {
    test(`long chat keeps the composer visible at ${width}x${height}`, async () => {
        const { page, context, errors } = await fixture({ width, height, touch: width < 1024 });
        try {
            await page.goto(`${origin}/?frozen=design-fixture`, { waitUntil: 'networkidle' });
            const composer = page.locator('#guided-composer');
            await composer.waitFor();
            await settled(page);
            assert.equal(await page.locator('.console-header').isVisible(), false);
            assert.equal(await page.locator('main > .page-wide > ol').count(), 0);
            assert.equal(await page.getByRole('button', { name: 'Come funziona questo percorso?', exact: true }).count(), 0);
            assert.equal(await page.locator('section[aria-labelledby="guided-chat-title"] header button').count(), 1);
            const box = await composer.boundingBox();
            assert.ok(box.y >= 60 && box.y + box.height <= height, `composer fits: ${JSON.stringify(box)}`);
            const log = await page.locator('[role="log"]').evaluate(el => ({ visible: el.clientHeight, total: el.scrollHeight }));
            assert.ok(log.visible >= height * 0.5 && log.total > log.visible, `messages scroll inside the chat: ${JSON.stringify(log)}`);
            const next = await page.getByRole('button', { name: 'Prossimo Step', exact: true }).boundingBox();
            assert.ok(next.y >= 60 && next.y + next.height <= height, 'step navigation remains visible');
            const size = await page.locator('.chat-message p').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
            assert.ok(size >= 15, `message reading size: ${size}`);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

for (const [width, height] of [[320, 568], [1280, 720]]) {
    test(`OpenCode keeps writing visible at ${width}x${height}`, async () => {
        const { page, context, errors } = await fixture({ width, height, experience: 'opencode' });
        try {
            await page.goto(`${origin}/?frozen=design-fixture`, { waitUntil: 'networkidle' });
            await page.locator('#opencode-composer').waitFor();
            await settled(page);
            const box = await page.locator('#opencode-composer').boundingBox();
            assert.ok(box.y >= 60 && box.y + box.height <= height, `composer fits: ${JSON.stringify(box)}`);
            const log = await page.locator('.min-h-chat > .overflow-y-auto').evaluate(el => ({ visible: el.clientHeight, total: el.scrollHeight }));
            assert.ok(log.visible >= 110 && log.total > log.visible, `messages scroll internally: ${JSON.stringify(log)}`);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('chat follows viewport resize with a draft in the composer', async () => {
    const { page, context } = await fixture();
    try {
        await page.goto(`${origin}/?frozen=design-fixture`, { waitUntil: 'networkidle' });
        await page.locator('#guided-composer').fill('Una domanda che voglio conservare.');
        await page.setViewportSize({ width: 390, height: 568 });
        await settled(page);
        const box = await page.locator('#guided-composer').boundingBox();
        assert.ok(box.y + box.height <= 568);
        assert.equal(await page.locator('#guided-composer').inputValue(), 'Una domanda che voglio conservare.');
    } finally { await context.close(); }
});

for (const width of [768, 1024, 1280, 1440]) {
    test(`header controls outside chat do not overlap at ${width}px with a long admin name`, async () => {
        const { page, context } = await fixture({ width, height: 1024, admin: true, locale: 'de' });
        try {
            await page.goto(origin, { waitUntil: 'networkidle' });
            await page.locator('.console-header').waitFor();
            await settled(page);
            const collisions = await page.locator('.console-header').evaluate(header => {
                const boxes = [...header.querySelectorAll('a,button')].filter(e => e.getClientRects().length).map(e => ({ name: e.getAttribute('aria-label') || e.textContent, rect: e.getBoundingClientRect() }));
                return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 2 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 2).map(b => [a.name, b.name]));
            });
            assert.deepEqual(collisions, []);
            const outside = await page.locator('.console-header a:visible, .console-header button:visible').evaluateAll(els => els.filter(el => {
                const box = el.getBoundingClientRect();
                return box.x < 0 || box.right > innerWidth;
            }).map(el => el.getAttribute('aria-label') || el.textContent));
            assert.deepEqual(outside, []);
        } finally { await context.close(); }
    });
}

test('returning home exposes resume and the complete catalog before optional preferences', async () => {
    const { page, context } = await fixture();
    try {
        await page.goto(origin, { waitUntil: 'networkidle' });
        const resume = await page.getByRole('link', { name: 'QSA · Organizzare lo studio' }).boundingBox();
        const catalog = await page.getByRole('heading', { name: 'Strumenti', exact: true }).boundingBox();
        assert.ok(resume.y < catalog.y && catalog.y < 600);
        assert.equal(await page.locator('main article').count(), 9);
        await page.locator('summary').click();
        await page.getByRole('button', { name: 'Cambia counselor predefinito' }).click();
        await page.getByRole('button', { name: 'Indietro', exact: true }).click();
        await page.getByRole('heading', { name: 'Il tuo percorso', exact: true }).waitFor();
        await page.locator('summary').click();
        await page.getByRole('button', { name: 'Rivedi la presentazione iniziale' }).click();
        await page.getByRole('heading', { name: 'CounselorBot', exact: true }).waitFor();
    } finally { await context.close(); }
});

test('selecting a tool at the bottom keeps its name and Continue visible', async () => {
    const { page, context } = await fixture();
    try {
        await page.goto(`${origin}/?view=questionnaires`, { waitUntil: 'networkidle' });
        assert.equal(await page.getByRole('button', { name: /^Idea/ }).getByText('Chat libera', { exact: true }).count(), 1);
        await page.getByRole('button', { name: /^SAVICKAS/ }).click();
        const button = page.getByRole('button', { name: 'Continua', exact: true });
        const box = await button.boundingBox();
        assert.ok(box.y >= 60 && box.y + box.height < 844);
        assert.equal(await button.isEnabled(), true);
        assert.ok(await button.locator('..').getByText('SAVICKAS', { exact: true }).isVisible());
        await button.click();
        await page.getByText('Il tuo taccuino è ancora aggiornato?', { exact: true }).waitFor();
    } finally { await context.close(); }
});

test('mobile menu targets reach 44px and dark surfaces retain readable colours', async () => {
    const { page, context } = await fixture({ dark: true });
    try {
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.locator('button[aria-controls="mobile-menu"]').click();
        const heights = await page.locator('#mobile-menu a, #mobile-menu button').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
        assert.ok(heights.length > 5 && heights.every(height => height >= 44));
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#mobile-menu').count(), 0);
        await settled(page);
        const colours = await page.locator('main article').first().evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, text: getComputedStyle(el.querySelector('h4')).color }));
        assert.deepEqual(colours, { bg: 'rgb(30, 41, 59)', text: 'rgb(203, 213, 225)' });
    } finally { await context.close(); }
});


test('leaving chat restores the header with counselor selection and motion settings', async () => {
    const { page, context } = await fixture({ width: 768, height: 1024, motion: 'no-preference' });
    try {
        await page.goto(`${origin}/?frozen=design-fixture`, { waitUntil: 'networkidle' });
        await page.locator('#guided-composer').waitFor();
        assert.equal(await page.locator('.console-header').isVisible(), false);
        await page.getByRole('button', { name: 'Indietro', exact: true }).click();
        await page.locator('.console-header').waitFor({ state: 'visible' });
        await page.locator('button[aria-controls="mobile-menu"]').click();
        const menu = page.locator('#mobile-menu');
        assert.ok(await menu.getByText('QSA', { exact: true }).isVisible());
        const counselor = menu.getByRole('button', { name: /Counselor di prova con nome lungo/ });
        // Opening the menu mounts its counselor control and loads its labels.
        await counselor.waitFor({ state: 'visible' });
        await counselor.click();
        await menu.getByRole('button', { name: /Counselor di prova con nome lungo/ }).last().click();
        await menu.getByRole('button', { name: 'Riduci il movimento', exact: true }).click();
        assert.equal(await page.locator('html').getAttribute('data-motion'), 'reduced');
    } finally { await context.close(); }
});

for (const width of [320, 1440]) {
    test(`conversation options stay secondary and keep the draft at ${width}px`, async () => {
        const { page, context } = await fixture({ width, height: 844, dark: width === 320 });
        try {
            await page.goto(`${origin}/?frozen=design-fixture`, { waitUntil: 'networkidle' });
            const composer = page.locator('#guided-composer');
            await composer.fill('Conservo la mia domanda.');
            const options = page.locator('.chat-options');
            assert.equal(await options.getAttribute('open'), null);
            await options.locator('summary').click();
            await page.getByRole('radio', { name: 'Lunghezza risposta: Breve', exact: true }).click();
            assert.equal(await page.getByRole('radio', { name: 'Lunghezza risposta: Breve', exact: true }).getAttribute('aria-checked'), 'true');
            const freeze = await options.getByRole('button', { name: 'Congela sessione', exact: true }).boundingBox();
            assert.ok(freeze.x >= 0 && freeze.y >= 0 && freeze.x + freeze.width <= width);
            await page.keyboard.press('Escape');
            assert.equal(await options.getAttribute('open'), null);
            assert.equal(await composer.inputValue(), 'Conservo la mia domanda.');
        } finally { await context.close(); }
    });
}
