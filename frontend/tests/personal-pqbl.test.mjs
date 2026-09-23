import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.ACCOUNT_BASE_URL || 'http://127.0.0.1:3000';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });

const progress = {
    version: 1, language: 'it', phase: 'quiz', size: 10,
    documentInfo: { document_id: 'pdf-test', status: 'ready', filename: 'appunti.pdf', language: 'it', size: 10, n_questions: 1, n_total: 1, chunks_total: 1, chunks_done: 1, skills: ['Comprendere'], onboarding_text: 'Appunti di studio' },
    questions: [{ id: 1, skill: 'Comprendere', position: 0, question: 'Domanda da riprendere', options: [{ key: 'A', text: 'Risposta conservata' }, { key: 'B', text: 'Altra risposta' }] }],
    currentIndex: 0, optionResults: { A: { correct: true, feedback: 'Feedback conservato', first_try: true } },
    lastSelected: 'A', summary: null, sessionId: 'pqbl-test', finalSessionId: '', finalQuestions: [], finalAnswers: {}, finalResult: null,
};

async function fixture(width, locale = 'it', resume = false) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ locale, progress }) => {
        localStorage.setItem('cb_lang', locale);
        if (progress && !localStorage.getItem('counselorbot_pqbl_progress_v1')) localStorage.setItem('counselorbot_pqbl_progress_v1', JSON.stringify(progress));
    }, { locale, progress: resume ? progress : null });
    await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'pqbl-fixture', name: 'Studente', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/counselors') data = [{ id: 1, name: 'Counselor', is_active: true, suitable: true, language: ['it'] }];
        else if (path === '/api/user/learner-profile') data = { id: 1, data: { notes: 'Appunti' }, source: 'manual', created_at: '2026-09-23' };
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

for (const width of [390, 1440]) {
    test(`home, personal area and legacy PDF links preserve resume at ${width}px`, async () => {
        const { page, context, errors } = await fixture(width, 'it', true);
        try {
            await page.goto(`${origin}/?view=home`);
            const personal = page.getByTestId('personal-area-entry');
            const resume = page.getByTestId('home-resume');
            await resume.waitFor();
            assert.equal(await page.getByRole('heading', { name: 'Allenamento', exact: true }).count(), 0);
            const positions = await Promise.all([page.locator('#tools-guided'), personal, page.locator('main details'), resume].map(locator => locator.boundingBox()));
            assert.ok(positions.every((box, i) => i === 0 || box.y >= positions[i - 1].y + positions[i - 1].height));
            await page.screenshot({ path: `/tmp/personal-home-${width}.png`, fullPage: true });
            const resumeLink = resume.getByRole('link', { name: /Studiare da un PDF/ });
            assert.equal(await resumeLink.getAttribute('href'), '/profilo/pqbl');
            await resumeLink.click();
            await page.getByText(/Feedback conservato/).waitFor();
            await page.getByRole('button', { name: 'Area personale', exact: true }).click();
            await page.waitForURL('**/profilo');
            const tools = page.getByRole('navigation', { name: 'Studiare, esplorare e agire', exact: true });
            await tools.waitFor();
            const links = await tools.locator('a').evaluateAll(items => items.map(item => item.getAttribute('href')));
            assert.deepEqual(links.slice(0, 2), ['/profilo/pqbl', '/profilo/flashcard']);
            await page.screenshot({ path: `/tmp/personal-area-${width}.png`, fullPage: true });
            await tools.locator('a[href="/profilo/pqbl"]').click();
            await page.getByRole('heading', { name: 'Domanda da riprendere', exact: true }).waitFor();
            await page.goto(`${origin}/pqbl`);
            await page.waitForURL('**/profilo/pqbl');
            await page.getByText(/Feedback conservato/).waitFor();
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('counselorbot_pqbl_progress_v1')).sessionId), 'pqbl-test');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: `/tmp/personal-pqbl-${width}.png`, fullPage: true });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

for (const [locale, title] of [['it', 'Studiare da un PDF'], ['en', 'Study from a PDF'], ['es', 'Estudiar con un PDF'], ['fr', 'Étudier à partir d’un PDF'], ['de', 'Mit einem PDF lernen'], ['sv', 'Studera med en PDF']]) {
    test(`personal PDF entry and introduction work in ${locale}`, async () => {
        const { page, context, errors } = await fixture(390, locale);
        try {
            await page.goto(`${origin}/?view=intro`);
            const intro = page.getByTestId('intro-screen');
            await intro.waitFor();
            assert.equal(await intro.locator('h2').count(), 3);
            const entry = intro.locator('a[href="/profilo"]');
            await entry.click();
            await page.locator('a[href="/profilo/pqbl"]').click();
            await page.getByRole('heading', { name: title, exact: true }).waitFor();
            assert.equal(await page.locator('input[type="file"]').count(), 1);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.goto(`${origin}/?view=questionnaires`);
            await page.getByTestId('personal-area-entry').waitFor();
            assert.equal(await page.locator('main a[href="/profilo/pqbl"]').count(), 0);
            await page.getByTestId('personal-area-entry').getByRole('link').click();
            await page.waitForURL('**/profilo');
            await page.goto(`${origin}/?view=home`);
            await page.getByTestId('personal-area-entry').waitFor();
            assert.equal(await page.getByTestId('home-resume').count(), 0);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
