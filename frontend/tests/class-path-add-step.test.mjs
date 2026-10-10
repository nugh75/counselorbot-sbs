// «+ Aggiungi passo» (#173) in /docente/percorsi, with synthetic APIs only: one
// flow with six step types, a tool menu of personal tools only and older
// questionnaire tool steps labelled as collecting no administration data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.CLASS_PATH_ADD_STEP_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

const group = { id: 11, code: 'GR-3B', name: '3B Liceo', school: null, school_level: null, institution_id: 5, institution_name: 'Liceo Sintetico',
    description: null, methodologies: null, context_visible_to_students: false, owner_username: 'teacher.test', is_active: true, members_count: 2, created_at: null };
const tool = (key, kind, category, extra = {}) => ({ key, kind, category, label_key: key, label_i18n: {}, admin_enabled: true,
    enabled: true, always_on: false, ...extra });
const settings = { group_id: 11, revision: 1, disabled_tool_keys: [], tools: [
    tool('QSA', 'instrument', 'guided', { label_i18n: { it: 'Questionario strategie' } }),
    tool('SAVICKAS', 'instrument', 'guided', { label_i18n: { it: 'Intervista Savickas' } }),
    tool('tavolo', 'personal', 'personal'),
    tool('timeline', 'personal', 'personal'),
    tool('bussola', 'personal', 'support'),
    tool('forum', 'personal', 'forum'),
    tool('notebook', 'personal', 'always_on', { always_on: true }),
] };
const path = { id: 301, group_id: 11, title: 'Metodo di studio', description: null, mode: 'recommended', status: 'draft', revision: 1,
    created_by: 'teacher.test', template_id: null, steps_count: 2, steps: [
        { id: 1, position: 1, step_type: 'tool', tool_key: 'QSA', auto_detect: true, pending_config: null },
        { id: 2, position: 2, step_type: 'questionnaire_administration', tool_key: null, administration_plan_id: 5, auto_detect: true,
          target_summary: { code: 'AB12', instrument_code: 'QSA', locale: 'it', title: 'Avvio' } },
    ] };

async function prepare(page) {
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        const p = url.pathname;
        if (p === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: 'teacher.test', name: 'Docente',
            email: 'teacher@example.invalid', groups: ['docenti'] });
        if (p === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (p === '/api/orientation/status') return json({ required: false, completed: true });
        if (p === '/api/admin/groups') return json([group]);
        if (p === '/api/teacher/path-templates') return json({ mine: [], shared: [] });
        if (p === '/api/teacher/groups/11/paths') return json([path]);
        if (p === '/api/teacher/groups/11/settings') return json(settings);
        if (p === '/api/teacher/groups/11/administrations') return json([{ id: 5, title: 'Avvio', code: 'AB12', locale: 'it', instrument_code: 'QSA' },
            { id: 6, title: 'Seconda', code: 'CD34', locale: 'it', instrument_code: 'QSA' }]);
        if (p === '/api/instruments') return json([{ code: 'QSA', available_locales: ['it'] }]);
        if (p === '/api/teacher/groups/11/path-assignments') return json([{ id: 40, snapshot: { title: 'Piano della settimana' }, attachments: [] }]);
        if (p === '/api/groups/11/forum/topics') return json({ forum_enabled: true, group: { id: 11, name: '3B Liceo', is_active: true },
            can_open_topic: true, can_moderate: true, has_more: false, topics: [] });
        return json([]);
    });
    return errors;
}

async function openEditor(page) {
    await page.goto(`${origin}/docente/percorsi`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Apri' }).click();
    await page.locator('[data-testid="path-step-card"]').first().waitFor();
}

{
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = await prepare(page);
    await openEditor(page);
    const cards = page.locator('[data-testid="path-step-card"]');
    // An older questionnaire inserted as a tool still works, with an explanation.
    await cards.nth(0).getByText('Inserito come strumento: non raccoglie dati di somministrazione.').waitFor();
    assert.equal(await page.getByText('Inserito come strumento: non raccoglie dati di somministrazione.').count(), 1);

    const add = page.locator('[data-testid="add-step"]');
    const open = async kind => {
        await add.getByRole('button', { name: '+ Aggiungi passo' }).click();
        await add.getByRole('group', { name: 'Cosa fa lo studente in questo passo?' }).waitFor();
        await add.getByRole('radio', { name: kind }).check();
    };

    // Six choices; meetings are listed but not yet available.
    await add.getByRole('button', { name: '+ Aggiungi passo' }).click();
    assert.equal(await add.getByRole('radio').count(), 6);
    assert.equal(await add.getByRole('radio', { name: /Partecipa a un incontro/ }).isDisabled(), true);
    await add.getByText(/arrivano in un prossimo aggiornamento/).waitFor();
    // Only the chosen type shows its form.
    await add.getByRole('radio', { name: 'Usa uno strumento' }).check();
    assert.equal(await add.getByText('Il passo è completato quando i dati entrano nella chat guidata.', { exact: false }).count(), 0);
    const tools = await add.getByRole('combobox', { name: 'Scegli uno strumento abilitato…' }).locator('option').allTextContents();
    assert.deepEqual(tools.slice(1).sort(), ['Bussola', 'Linea del tempo', 'Tavolo'].sort(), tools.join(', '));
    await add.getByRole('combobox', { name: 'Scegli uno strumento abilitato…' }).selectOption('tavolo');
    await add.getByRole('button', { name: 'Aggiungi passo', exact: true }).click();
    assert.equal(await cards.count(), 3);
    assert.equal(await add.getByRole('radio').count(), 0);

    // Guided chat: on the results of a questionnaire step, or standalone.
    await open('Fa una chat guidata');
    await add.getByText('Sui risultati di un questionario del percorso').waitFor();
    const chats = await add.getByRole('combobox', { name: /^Chat guidata autonoma/ }).locator('option').allTextContents();
    assert.deepEqual(chats.slice(1), ['Intervista Savickas']);
    await add.getByRole('combobox', { name: /^Chat guidata autonoma/ }).selectOption('SAVICKAS');
    await add.getByRole('button', { name: 'Aggiungi passo', exact: true }).nth(1).click();
    assert.equal(await cards.count(), 4);
    await cards.nth(3).getByText('Intervista Savickas').waitFor();

    // Activity: a whole-class assignment.
    await open('Svolge un’attività');
    await add.getByRole('option', { name: 'Piano della settimana' }).waitFor({ state: 'attached' });
    await add.getByText(/Obiettivo del catalogo con strategie/).waitFor();
    await add.getByRole('button', { name: 'Chiudi' }).click();

    // Questionnaire: only through an administration.
    await open('Compila un questionario');
    await add.getByRole('option', { name: 'CD34 · Seconda · IT' }).waitFor({ state: 'attached' });
    await add.getByRole('button', { name: 'Chiudi' }).click();

    // Discussion: a published discussion of the class.
    await open('Partecipa a una discussione');
    await add.getByText(/Una discussione pubblicata di questa classe/).waitFor();
    await add.getByRole('button', { name: 'Chiudi' }).click();

    // Keyboard: the opener and the radios are reachable and operable.
    await add.getByRole('button', { name: '+ Aggiungi passo' }).focus();
    await page.keyboard.press('Enter');
    await add.getByRole('radio', { name: 'Compila un questionario' }).focus();
    await page.keyboard.press('Space');
    assert.equal(await add.getByRole('radio', { name: 'Compila un questionario' }).isChecked(), true);

    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

{
    // Phone width: the form opens under the step list and stays inside the viewport.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = await prepare(page);
    await openEditor(page);
    const add = page.locator('[data-testid="add-step"]');
    await add.getByRole('button', { name: '+ Aggiungi passo' }).click();
    await add.getByRole('radio', { name: 'Compila un questionario' }).check();
    await add.getByRole('option', { name: 'AB12 · Avvio · IT' }).waitFor({ state: 'attached' });
    const list = await page.locator('[data-testid="path-step-card"]').last().boundingBox();
    const form = await add.boundingBox();
    assert.ok(form.y > list.y, 'the form follows the step list');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('class path add step OK');
