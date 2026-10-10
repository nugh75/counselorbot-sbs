import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.TEACHER_AREA_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

async function prepare(page, { lang = 'it', teacher = true, researcher = false } = {}) {
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ lang }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', 'light');
    }, { lang });
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') data = {
            authenticated: true, is_admin: false, is_researcher: false, username: 'teacher.test',
            name: 'Docente di prova', email: 'teacher@example.invalid', groups: teacher ? ['docenti'] : researcher ? ['ricercatori'] : ['studenti'],
        };
        else if (url.pathname === '/api/user/account') data = { setup_complete: true, notebook_completed: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/teacher/assignments') data = [];
        else if (url.pathname === '/api/admin/groups') data = [];
        else if (url.pathname === '/api/user/teacher-notebook') data = null;
        else if (url.pathname === '/api/admin/administration-plans') data = [];
        else if (url.pathname === '/api/admin/research-contacts') data = [];
        else if (url.pathname === '/api/telegram/bot-info') data = {};
        else if (url.pathname === '/api/user/groups') data = [];
        else if (url.pathname === '/api/admin/users-summary') data = [];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    return { errors };
}

// 1. Home illustrata: sezioni, slug e link
{
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Percorso guidato: obiettivi per la mia classe', exact: true }).waitFor();
    // intestazioni di gruppo in ordine; i due taccuini affiancati prima dei gruppi
    const h2 = await page.getByRole('heading', { level: 2 }).allTextContents();
    assert.deepEqual(h2.slice(0, 2), ['Classe e assegnazioni', 'Cataloghi']);
    const notebooks = await Promise.all(['Taccuino del docente', 'Taccuini di prova'].map(name =>
        page.getByRole('link', { name, exact: true }).boundingBox()));
    assert.ok(Math.abs(notebooks[0].y - notebooks[1].y) < 2 && notebooks[1].x > notebooks[0].x, 'notebooks side by side');
    // il percorso guidato apre i cataloghi, prima del catalogo degli obiettivi
    const catalogs = await page.locator('nav[aria-labelledby="teacher-group-catalogs"] a').evaluateAll(rows => rows.map(row => row.getAttribute('href')));
    assert.deepEqual(catalogs.slice(0, 2), ['/?start=OBIETTIVO_DOCENZA', '/docente/catalogo-obiettivi']);
    // link illustrati
    for (const href of ['/docente/classi', '/docente/percorsi', '/docente/assegnazioni', '/docente/catalogo-obiettivi', '/docente/strategie', '/docente/materiali', '/docente/orientamento', '/docente/somministrazioni']) {
        assert.equal(await page.locator(`nav a[href="${href}"]`).count(), 1, `link ${href}`);
    }
    assert.ok(await page.locator('[data-teacher-area-home] img').first().isVisible());
    // S16: the home is an entry point and never mounts the notebook form.
    assert.equal(await page.locator('[data-teacher-notebook]').count(), 0);
    assert.equal(await page.getByLabel('Discipline insegnate').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Taccuino del docente', exact: true }).getAttribute('href'), '/docente/taccuino');
    // percorso guidato verso la chat
    assert.ok(await page.locator('a[href="/?start=OBIETTIVO_DOCENZA"]').count() >= 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    // The first destination also works with pointer activation.
    await page.locator('[data-teacher-area-home] a').first().click();
    await page.waitForURL(`${origin}/docente/taccuino`);
    await page.locator('[data-teacher-notebook]').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
}

// 2. Ogni sottopagina mostra la sua intestazione e il pannello atteso
for (const [slug, h1, marker] of [
    ['classi', 'Gruppi e classi', 'Gruppi e classi che gestisco'],
    ['assegnazioni', 'Assegnazioni', 'Nuova assegnazione'],
    ['percorsi', 'Percorsi di classe', 'Non hai ancora classi: creane una in Gruppi e classi per preparare un percorso.'],
    ['somministrazioni', 'Piani di somministrazione', 'Piani di somministrazione'],
]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    await page.goto(`${origin}/docente/${slug}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: h1, exact: true }).first().waitFor();
    await page.getByText(marker, { exact: true }).first().waitFor();
    // Torna all'Area docenti
    await page.getByRole('link', { name: 'Area docenti' }).first().click();
    await page.getByRole('link', { name: 'Percorso guidato: obiettivi per la mia classe', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
}

// 3. Sottopagine cataloghi
for (const [slug, marker] of [
    ['catalogo-obiettivi', 'Nuova proposta'],
    ['strategie', 'Nuova strategia'],
    ['materiali', 'Nuova voce'],
]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    await page.goto(`${origin}/docente/${slug}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: marker, exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
}

// 4. Uno studente vede la pagina riservata
{
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page, { teacher: false });
    await page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
    await page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
}

// 4b. Un ricercatore entra ma non vede la card Orientamento (solo docenti)
{
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page, { teacher: false, researcher: true });
    await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Percorso guidato: obiettivi per la mia classe', exact: true }).waitFor();
    assert.equal(await page.locator('a[href="/docente/somministrazioni"]').count(), 1);
    assert.equal(await page.locator('a[href="/docente/orientamento"]').count(), 0);
    assert.equal(await page.locator('[data-teacher-area-home] a').first().getAttribute('href'), '/docente/taccuino');
    assert.deepEqual(errors, []);
    await page.close();
}

// 5. Orientamento rimanda a /docente/orientamento
{
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    await page.goto(`${origin}/docente/orientamento`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Orientamento dell’istituto', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('teacher-area smoke OK');
