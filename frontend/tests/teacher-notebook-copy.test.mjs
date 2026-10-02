import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

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
const linkNames = {
    it: ['Gestisci gruppi e classi', 'Per la mia crescita: Obiettivi personali', 'Per una tappa: Linea del tempo', 'Per un lavoro: Portfolio'],
    en: ['Manage groups and classes', 'For my development: Personal goals', 'For a milestone: Timeline', 'For a piece of work: Portfolio'],
    es: ['Gestionar grupos y clases', 'Para mi desarrollo: Objetivos personales', 'Para una etapa: Línea del tiempo', 'Para un trabajo: Portafolio'],
    fr: ['Gérer les groupes et classes', 'Pour mon développement : Objectifs personnels', 'Pour une étape : Ligne du temps', 'Pour un travail : Portfolio'],
    de: ['Gruppen und Klassen verwalten', 'Für meine Entwicklung: Persönliche Ziele', 'Für einen Meilenstein: Zeitleiste', 'Für eine Arbeit: Portfolio'],
    sv: ['Hantera grupper och klasser', 'För min utveckling: Personliga mål', 'För en milstolpe: Tidslinje', 'För ett arbete: Portfolio'],
};
const groupNames = {
    it: ['Il mio ruolo', 'La mia pratica e i miei contesti', 'La mia crescita e altre informazioni'],
    en: ['My role', 'My practice and settings', 'My development and other information'],
    es: ['Mi rol', 'Mi práctica y mis contextos', 'Mi desarrollo y otra información'],
    fr: ['Mon rôle', 'Ma pratique et mes contextes', 'Mon développement et autres informations'],
    de: ['Meine Rolle', 'Meine Praxis und meine Kontexte', 'Meine Entwicklung und weitere Angaben'],
    sv: ['Min roll', 'Min undervisning och mina sammanhang', 'Min utveckling och övrig information'],
};
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

for (const [lang, names] of Object.entries(labels)) {
    for (const scale of [1, 2, 4]) test(`${lang}: open groups, hints, keyboard and explicit payload at ${scale === 1 ? '320px' : `${scale * 100}% zoom equivalent`}`, async () => {
        // A 1280px display at 200/400% browser zoom has a 640/320px CSS viewport.
        // CSS zoom alone does not adapt media queries, so use viewport + pixel scale.
        const context = await browser.newContext({ viewport: { width: scale === 2 ? 640 : 320, height: 900 }, deviceScaleFactor: scale });
        const page = await context.newPage(); page.setDefaultTimeout(15000);
        const writes = []; const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
        await page.route('**/*', route => {
            const request = route.request(); const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            // Keep this notebook regression at the form/HTTP seam. The existing
            // event illustration's 4x image-optimizer request can hang standalone;
            // serve its real bytes without changing application image behavior.
            if (url.pathname === '/_next/image' && url.searchParams.get('url') === '/images/platform/eventi.png') {
                return route.fulfill({ contentType: 'image/png', body: readFileSync(new URL('../public/images/platform/eventi.png', import.meta.url)) });
            }
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
            assert.equal(await notebook.getByRole('group').count(), 3);
            assert.deepEqual(await notebook.getByRole('heading', { level: 3 }).allTextContents(), groupNames[lang]);
            for (const [index, name] of groupNames[lang].entries()) {
                const group = notebook.getByRole('group', { name, exact: true });
                assert.equal(await group.isVisible(), true);
                assert.deepEqual(await group.getByRole('textbox').evaluateAll(elements => elements.map(e => e.id)), [
                    ['teacher-notebook-subjects', 'teacher-notebook-experience'],
                    ['teacher-notebook-methodologies', 'teacher-notebook-classes_overview'],
                    ['teacher-notebook-formation_interests', 'teacher-notebook-notes'],
                ][index]);
            }
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
                    if (index === 3 || index === 4) {
                        assert.equal(await notebook.locator('a').nth(index - 3).evaluate(e => e === document.activeElement), true);
                        await page.keyboard.press('Tab');
                    }
                    assert.equal(await fields.nth(index + 1).evaluate(e => e === document.activeElement), true);
                }
                await field.fill(`  ${keys[index]} demo  `);
            }
            assert.deepEqual(writes, []); // typing never saves or transfers data
            assert.equal(await notebook.locator('a').count(), 4); // contextual navigation only
            assert.deepEqual(await notebook.locator('a').allTextContents(), linkNames[lang]);
            assert.deepEqual(await notebook.locator('a').evaluateAll(links => links.map(l => l.getAttribute('href'))), ['/docente/classi', '/profilo/obiettivi', '/profilo/timeline', '/profilo/portfolio']);
            for (const name of linkNames[lang]) {
                const link = notebook.getByRole('link', { name, exact: true });
                assert.ok(await link.isVisible());
                assert.ok((await link.boundingBox()).height >= 44);
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            if (process.env.NOTEBOOK_SCREENSHOT_DIR && lang === 'de' && scale === 1) {
                mkdirSync(process.env.NOTEBOOK_SCREENSHOT_DIR, { recursive: true });
                await page.screenshot({ path: `${process.env.NOTEBOOK_SCREENSHOT_DIR}/teacher-notebook-de-320.png`, fullPage: true });
            }
            await fields.last().focus();
            for (const link of (await notebook.locator('a').all()).slice(2)) {
                await page.keyboard.press('Tab');
                assert.equal(await link.evaluate(e => e === document.activeElement), true);
            }
            await page.keyboard.press('Tab');
            const save = notebook.getByRole('button').first();
            assert.equal(await save.evaluate(e => e === document.activeElement), true);
            await page.keyboard.press('Enter');
            await save.filter({ hasText: /salvato|saved|guardado|enregistré|gespeichert|sparad/i }).waitFor();
            assert.deepEqual(writes, [{ path: '/api/user/teacher-notebook', body: Object.fromEntries(keys.map(k => [k, `${k} demo`])) }]);
            for (const field of await fields.all()) await field.fill('');
            await save.click();
            assert.deepEqual(writes[1], { path: '/api/user/teacher-notebook', body: Object.fromEntries(keys.map(k => [k, null])) });
            // The same open groups fit mobile and desktop, including a reduced CSS viewport.
            for (const width of [1440, 720, 320]) {
                await page.setViewportSize({ width, height: 900 });
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                for (const field of await fields.all()) assert.equal(await field.isVisible(), true);
                for (const group of await notebook.getByRole('group').all()) assert.equal(await group.isVisible(), true);
            }
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
