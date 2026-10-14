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
    await page.locator('[data-testid="didactic-design-cta"]').waitFor();
    // intestazioni di gruppo in ordine: Didattica, Le mie classi, Classe e assegnazioni, Palestra, Profilo docente, Cataloghi
    const h2 = await page.getByRole('heading', { level: 2 }).allTextContents();
    assert.deepEqual(h2.slice(0, 6), [
        'Progettazione didattica',
        'Le mie classi',
        'Classe e assegnazioni',
        'Palestra di prova e simulazione',
        'Profilo professionale del docente',
        'Cataloghi',
    ]);
    // Sezione Le mie classi (zero-state con mock vuoto)
    await page.locator('[data-testid="teacher-my-classes-section"]').waitFor();
    const manageLink = page.locator('[data-testid="my-classes-manage-all-link"]');
    assert.equal(await manageLink.getAttribute('href'), '/docente/classi');
    const manageBox = await manageLink.boundingBox();
    assert.ok(manageBox && manageBox.height >= 44, 'my classes manage link meets 44px touch target');

    await page.locator('[data-testid="my-classes-zero-state"]').waitFor();
    const createFirstCta = page.locator('[data-testid="my-classes-create-first-cta"]');
    assert.equal(await createFirstCta.getAttribute('href'), '/docente/classi');
    const createFirstBox = await createFirstCta.boundingBox();
    assert.ok(createFirstBox && createFirstBox.height >= 44, 'create first class CTA meets 44px touch target');

    // Sezione Palestra di prova e simulazione (sandbox protetto con CTA >= 44px)
    await page.locator('[data-testid="teacher-practice-gym-section"]').waitFor();
    const gymCard = page.locator('[data-testid="practice-gym-card"]');
    assert.ok(await gymCard.isVisible());
    const practiceCta = page.locator('[data-testid="practice-gym-cta"]');
    assert.equal(await practiceCta.getAttribute('href'), '/docente/taccuini-prova');
    const practiceCtaBox = await practiceCta.boundingBox();
    assert.ok(practiceCtaBox && practiceCtaBox.height >= 44, 'practice gym CTA meets 44px touch target');
    assert.ok((await gymCard.textContent()).includes('Simulazione protetta'));
    assert.ok((await gymCard.textContent()).includes('Nessun impatto sulle classi reali'));

    // Sezione Profilo professionale del docente (Taccuino separato dalla palestra e collocato nel terzo pilastro)
    await page.locator('[data-testid="teacher-profile-notebook-section"]').waitFor();
    const notebookLink = page.getByRole('link', { name: 'Taccuino del docente', exact: true });
    assert.equal(await notebookLink.getAttribute('href'), '/docente/taccuino');
    const gymBox = await page.locator('[data-testid="teacher-practice-gym-section"]').boundingBox();
    const notebookBox = await notebookLink.boundingBox();
    assert.ok(gymBox && notebookBox && notebookBox.y > gymBox.y, 'teacher notebook is separated and placed in professional profile below practice gym');

    // La hero di progettazione didattica include l'azione primaria e i link al catalogo e ai percorsi
    assert.equal(await page.locator('[data-testid="teacher-didactic-design-section"] a[href="/?start=OBIETTIVO_DOCENZA"]').count(), 1);
    assert.equal(await page.locator('[data-testid="teacher-didactic-design-section"] a[href="/docente/catalogo-obiettivi"]').count(), 1);
    assert.equal(await page.locator('[data-testid="teacher-didactic-design-section"] a[href="/docente/percorsi"]').count(), 1);
    const ctaBox = await page.locator('[data-testid="didactic-design-cta"]').boundingBox();
    assert.ok(ctaBox && ctaBox.height >= 44, 'didactic design CTA meets 44px touch target');
    // Sezione Libreria e risorse didattiche accorpata
    await page.locator('[data-testid="teacher-resources-library-section"]').waitFor();
    const resourcesLink = page.locator('[data-testid="teacher-resources-main-link"]');
    assert.equal(await resourcesLink.getAttribute('href'), '/docente/risorse');
    assert.equal(await page.locator('[data-testid="teacher-resources-strategies-link"]').getAttribute('href'), '/docente/strategie');
    assert.equal(await page.locator('[data-testid="teacher-resources-materials-link"]').getAttribute('href'), '/docente/materiali');

    // link illustrati dei gruppi e del flusso didattico
    for (const href of ['/docente/classi', '/docente/percorsi', '/docente/incontri', '/docente/assegnazioni', '/docente/catalogo-obiettivi', '/docente/risorse', '/docente/strategie', '/docente/materiali', '/docente/orientamento', '/docente/somministrazioni']) {
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

// 1b. Sezione Le mie classi: rendering card attive, metadati e link all'Hub
{
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    await page.route('**/api/admin/groups', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([
            { id: 101, name: '3A Informatica', code: 'GR-INFO3A', school: 'IIS Volta', is_active: true, members_count: 22 },
            { id: 102, name: '4B Liceo Scientifico', code: 'GR-LS4B', institution_name: 'Liceo Da Vinci', is_active: true, members_count: 1 },
            { id: 103, name: 'Classe Inattiva', code: 'GR-INACT', is_active: false, members_count: 15 },
        ]),
    }));
    await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="teacher-my-classes-section"]').waitFor();
    assert.equal(await page.locator('[data-testid="my-class-card-101"]').count(), 1);
    assert.equal(await page.locator('[data-testid="my-class-card-102"]').count(), 1);
    assert.equal(await page.locator('[data-testid="my-class-card-103"]').count(), 0);

    const card1 = page.locator('[data-testid="my-class-card-101"]');
    assert.ok((await card1.textContent()).includes('3A Informatica'));
    assert.ok((await card1.textContent()).includes('22'));
    assert.ok((await card1.textContent()).includes('GR-INFO3A'));
    assert.ok((await card1.textContent()).includes('IIS Volta'));

    const hubLink = page.locator('[data-testid="my-class-hub-link-101"]');
    assert.equal(await hubLink.getAttribute('href'), '/docente/classi/101');
    const hubBox = await hubLink.boundingBox();
    assert.ok(hubBox && hubBox.height >= 44, 'class hub link meets 44px touch target');

    const card2 = page.locator('[data-testid="my-class-card-102"]');
    assert.ok((await card2.textContent()).includes('1 studente'));
    assert.ok((await card2.textContent()).includes('Liceo Da Vinci'));

    assert.deepEqual(errors, []);
    await page.close();
}

// 1c. Sezione Le mie classi: gestione errori e retry
{
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const { errors } = await prepare(page);
    let attempts = 0;
    await page.route('**/api/admin/groups', route => {
        attempts++;
        if (attempts === 1) {
            return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'fail' }) });
        }
        return route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify([
                { id: 201, name: 'Classe Recuperata', code: 'GR-REC01', is_active: true, members_count: 12 },
            ]),
        });
    });
    await page.goto(`${origin}/docente`, { waitUntil: 'networkidle' });
    await page.locator('[role="alert"]').waitFor();
    assert.ok((await page.locator('[role="alert"]').textContent()).includes('Impossibile caricare'));
    await page.getByRole('button', { name: 'Riprova' }).click();
    await page.locator('[data-testid="my-class-card-201"]').waitFor();
    assert.equal(await page.locator('[data-testid="my-class-card-201"]').count(), 1);
    await page.close();
}

// 2. Ogni sottopagina mostra la sua intestazione e il pannello atteso
for (const [slug, h1, marker] of [
    ['classi', 'Gruppi e classi', 'Gruppi e classi che gestisco'],
    ['assegnazioni', 'Assegnazioni', 'Nuova assegnazione'],
    ['percorsi', 'Percorsi di classe', 'Non hai ancora classi: creane una in Gruppi e classi per preparare un percorso.'],
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
    await page.locator('[data-testid="didactic-design-cta"]').waitFor();
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
    await page.locator('[data-testid="didactic-design-cta"]').waitFor();
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
