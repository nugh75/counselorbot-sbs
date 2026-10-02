import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// Anonymous HTTP fixtures, following PR31: no backend, database or external traffic.
const origin = new URL(process.env.TEACHER_ERRORS_BASE_URL || 'http://127.0.0.1:3124').origin;
const keys = ['subjects', 'experience', 'methodologies', 'classes_overview', 'formation_interests', 'notes'];
const labels = {
    it: ['Discipline insegnate', 'Esperienza di insegnamento', 'Come insegno di solito', 'Panoramica dei miei incarichi', 'Interessi per la mia crescita', 'Altre informazioni sul mio ruolo'],
    en: ['Subjects taught', 'Teaching experience', 'How I usually teach', 'Overview of my teaching roles', 'Interests for my own development', 'Other information about my role'],
    es: ['Disciplinas que enseñas', 'Experiencia docente', 'Cómo enseño habitualmente', 'Panorama de mis cargos docentes', 'Intereses para mi propio desarrollo', 'Otra información sobre mi rol'],
    fr: ['Disciplines enseignées', 'Expérience d’enseignement', 'Comment j’enseigne habituellement', 'Aperçu de mes fonctions', 'Intérêts pour mon développement', 'Autres informations sur mon rôle'],
    de: ['Unterrichtete Fächer', 'Unterrichtserfahrung', 'Wie ich gewöhnlich unterrichte', 'Überblick über meine Lehraufgaben', 'Interessen für meine Entwicklung', 'Weitere Angaben zu meiner Rolle'],
    sv: ['Ämnen du undervisar i', 'Undervisningserfarenhet', 'Hur jag brukar undervisa', 'Översikt över mina läraruppdrag', 'Intressen för min egen utveckling', 'Övrig information om min roll'],
};
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

for (const [lang, names] of Object.entries(labels)) {
    test(`${lang}: visible associated hints, optional fields, keyboard and unchanged explicit payload on mobile`, async () => {
        const context = await browser.newContext({ viewport: { width: lang === 'de' ? 320 : 390, height: 900 } });
        const page = await context.newPage(); page.setDefaultTimeout(15000);
        const writes = []; const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
        await page.route('**/*', route => {
            const request = route.request(); const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
            if (request.method() !== 'GET') {
                writes.push({ path: url.pathname, body: request.postDataJSON() });
                return route.fulfill({ json: {} });
            }
            let data = [];
            if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'teacher.fixture', name: 'Teacher Demo', groups: ['docenti'], is_admin: false };
            else if (url.pathname === '/api/user/teacher-notebook') data = null;
            else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
            else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
            else if (url.pathname === '/api/telegram/bot-info') data = {};
            return route.fulfill({ json: data });
        });
        try {
            await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'empty notebook fits mobile');
            const fields = page.locator('textarea[id^="teacher-notebook-"]');
            assert.equal(await fields.count(), 6);
            assert.deepEqual(await fields.evaluateAll(elements => elements.map(e => e.id.replace('teacher-notebook-', ''))), keys);
            const notebook = fields.first().locator('xpath=ancestor::div[h2]');
            for (const [index, name] of names.entries()) {
                const field = page.getByRole('textbox', { name, exact: true });
                await field.waitFor(); assert.equal(await field.isEnabled(), true);
                assert.equal(await field.getAttribute('maxlength'), '600');
                assert.equal(await field.getAttribute('required'), null);
                const hintId = `teacher-notebook-${keys[index]}-hint`;
                assert.equal(await field.getAttribute('aria-describedby'), hintId);
                const hint = page.locator(`#${hintId}`);
                assert.ok((await hint.innerText()).length > 30);
                assert.equal(await hint.isVisible(), true);
                await field.evaluate(e => e.labels[0].click());
                assert.equal(await field.evaluate(e => e === document.activeElement), true);
                if (index < 5) {
                    await page.keyboard.press('Tab');
                    assert.equal(await fields.nth(index + 1).evaluate(e => e === document.activeElement), true);
                }
                await field.fill(`  ${keys[index]} demo  `);
            }
            assert.deepEqual(writes, []); // typing never saves or transfers data
            assert.equal(await notebook.locator('a').count(), 0); // no block B links
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            if (process.env.NOTEBOOK_SCREENSHOT_DIR && lang === 'de') {
                mkdirSync(process.env.NOTEBOOK_SCREENSHOT_DIR, { recursive: true });
                await page.screenshot({ path: `${process.env.NOTEBOOK_SCREENSHOT_DIR}/teacher-notebook-de-320.png`, fullPage: true });
            }
            await fields.last().focus(); await page.keyboard.press('Tab');
            const save = notebook.getByRole('button').first();
            assert.equal(await save.evaluate(e => e === document.activeElement), true);
            await page.keyboard.press('Enter');
            await save.filter({ hasText: /salvato|saved|guardado|enregistré|gespeichert|sparad/i }).waitFor();
            assert.deepEqual(writes, [{ path: '/api/user/teacher-notebook', body: Object.fromEntries(keys.map(k => [k, `${k} demo`])) }]);
            for (const field of await fields.all()) await field.fill('');
            await save.click();
            assert.deepEqual(writes[1], { path: '/api/user/teacher-notebook', body: Object.fromEntries(keys.map(k => [k, null])) });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
