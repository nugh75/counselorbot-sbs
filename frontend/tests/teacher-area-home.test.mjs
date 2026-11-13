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
    await page.getByRole('heading', { level: 2, name: 'Progettazione didattica' }).waitFor();
    await page.locator('[data-testid="teacher-didactic-design-section"]').waitFor();
    // intestazioni di gruppo in ordine: Didattica, Le mie classi, Classe e assegnazioni, Palestra, Prova gli strumenti, Profilo docente, Cataloghi
    const h2 = await page.getByRole('heading', { level: 2 }).allTextContents();
    assert.deepEqual(h2.slice(0, 7), [
        'Progettazione didattica',
        'Le mie classi',
        'Classe e assegnazioni',
        'Palestra di prova e simulazione',
        'Prova gli strumenti',
        'Profilo professionale del docente',
        'Cataloghi',
    ]);
    // Prova gli strumenti: ogni voce apre /?start=<id>, incluso OBIETTIVO_DOCENZA
    const tryTools = page.locator('[data-testid="teacher-try-tools-section"]');
    await tryTools.waitFor();
    assert.equal(await tryTools.locator('a[href="/?start=QSA"]').getAttribute('href'), '/?start=QSA');
    assert.equal(await tryTools.locator('a[href="/?start=OBIETTIVO_DOCENZA"]').getAttribute('href'), '/?start=OBIETTIVO_DOCENZA');
    // Sezione Le mie classi (zero-state con mock vuoto)
    await page.locator('[data-testid="teacher-my-classes-section"]').waitFor();
    // «Le mie classi» è una sola voce verso /docente/classi, senza schede né zero-state
    const classesLink = page.locator('[data-testid="teacher-my-classes-section"] a');
    assert.equal(await classesLink.count(), 1);
    assert.equal(await classesLink.getAttribute('href'), '/docente/classi');
    assert.equal(await page.locator('[data-testid="my-classes-zero-state"]').count(), 0);

    // Sezione Palestra di prova e simulazione (sandbox protetto con CTA >= 44px)
    await page.locator('[data-testid="teacher-practice-gym-section"]').waitFor();
    const gym = page.locator('[data-testid="teacher-practice-gym-section"]');
    assert.equal(await gym.locator('a').count(), 1);
    assert.equal(await gym.locator('a').getAttribute('href'), '/docente/taccuini-prova');
    assert.ok((await gym.textContent()).includes('Simulazione protetta'));
    assert.ok((await gym.textContent()).includes('Nessun impatto sulle classi reali'));

    // Sezione Profilo professionale del docente (Taccuino separato dalla palestra e collocato nel terzo pilastro)
    await page.locator('[data-testid="teacher-profile-notebook-section"]').waitFor();
    const notebookLink = page.getByRole('link', { name: 'Taccuino del docente', exact: true });
    assert.equal(await notebookLink.getAttribute('href'), '/docente/taccuino');
    const gymBox = await page.locator('[data-testid="teacher-practice-gym-section"]').boundingBox();
    const notebookBox = await notebookLink.boundingBox();
    assert.ok(gymBox && notebookBox && notebookBox.y > gymBox.y, 'teacher notebook is separated and placed in professional profile below practice gym');

    // Progettazione didattica: una sola voce, OBIETTIVO_DOCENZA
    assert.equal(await page.locator('[data-testid="teacher-didactic-design-section"] a').count(), 1);
    assert.equal(await page.locator('[data-testid="teacher-didactic-design-section"] a[href="/?start=OBIETTIVO_DOCENZA"]').count(), 1);
    // Sezione Libreria e risorse didattiche accorpata
    await page.locator('[data-testid="teacher-resources-library-section"]').waitFor();
    for (const href of ['/docente/catalogo-obiettivi', '/docente/risorse', '/docente/strategie', '/docente/materiali']) {
        assert.equal(await page.locator(`[data-testid="teacher-resources-library-section"] a[href="${href}"]`).count(), 1, href);
    }
    // niente riquadri: nessun elemento con ombra o bordo di scheda nella home
    assert.equal(await page.locator('[data-teacher-area-home] .shadow-card').count(), 0);

    // link illustrati dei gruppi e del flusso didattico
    for (const href of ['/docente/classi', '/docente/piani-operativi', '/docente/incontri', '/docente/assegnazioni', '/docente/catalogo-obiettivi', '/docente/risorse', '/docente/strategie', '/docente/materiali', '/docente/orientamento', '/docente/somministrazioni']) {
        assert.ok(await page.locator(`a[href="${href}"]`).count() >= 1, `link ${href}`);
    }
    assert.ok(await page.locator('[data-teacher-area-home] img').first().isVisible());
    // S16: the home is an entry point and never mounts the notebook form.
    assert.equal(await page.locator('[data-teacher-notebook]').count(), 0);
    assert.equal(await page.getByLabel('Discipline insegnate').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Taccuino del docente', exact: true }).getAttribute('href'), '/docente/taccuino');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    // Attivazione con click del link del Taccuino del docente
    await page.locator('[data-testid="teacher-profile-notebook-section"] a').first().click();
    await page.waitForURL(`${origin}/docente/taccuino`);
    await page.locator('[data-teacher-notebook]').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
}

// 2. Ogni sottopagina mostra la sua intestazione e il pannello atteso
for (const [slug, h1, marker] of [
    ['classi', 'Gruppi e classi', 'Gruppi e classi che gestisco'],
    ['assegnazioni', 'Assegnazioni', 'Nuova assegnazione'],
    ['piani-operativi', 'Piani operativi', 'Non hai ancora classi: creane una in Gruppi e classi per preparare un piano operativo.'],
    ['incontri', 'Incontri', 'Non hai ancora classi o gruppi: creane uno in Gruppi e classi per organizzare un incontro.'],
    ['somministrazioni', 'Piani di somministrazione', 'Piani di somministrazione'],
]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    await page.goto(`${origin}/docente/${slug}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: h1, exact: true }).first().waitFor();
    await page.getByText(marker, { exact: true }).first().waitFor();
    // Torna all'Area docenti
    await page.getByRole('link', { name: 'Area docenti' }).first().click();
    await page.locator('[data-testid="teacher-didactic-design-section"]').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
}

// 3. Sottopagine e Hub risorse
for (const [slug, marker] of [
    ['catalogo-obiettivi', 'Nuova proposta'],
    ['strategie', 'Nuova strategia'],
    ['materiali', 'Nuova voce'],
    ['risorse', 'Nuova strategia'],
]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    await page.goto(`${origin}/docente/${slug}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: marker, exact: true }).waitFor();
    if (slug === 'risorse') {
        // Verifica switch del tab a materiali
        await page.locator('[data-testid="tab-materiali"]').click();
        await page.getByRole('button', { name: 'Nuova voce', exact: true }).waitFor();
    }
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
    await page.locator('[data-testid="teacher-didactic-design-section"]').waitFor();
    assert.equal(await page.locator('a[href="/docente/somministrazioni"]').count(), 1);
    assert.equal(await page.locator('a[href="/docente/orientamento"]').count(), 0);
    assert.equal(await page.locator('[data-testid="teacher-profile-notebook-section"] a').first().getAttribute('href'), '/docente/taccuino');
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
