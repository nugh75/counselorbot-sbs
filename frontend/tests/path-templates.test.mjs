// Path templates in /docente/percorsi (#172), with synthetic APIs only:
// create a template, apply it to a class, see its pending steps in the class
// editor and save the class path back as a template.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.PATH_TEMPLATES_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

const groups = [
    { id: 11, code: 'GR-3B', name: '3B Liceo', school: null, school_level: null, institution_id: 5, institution_name: 'Liceo Sintetico',
      description: null, methodologies: null, context_visible_to_students: false, owner_username: 'teacher.test', is_active: true, members_count: 2, created_at: null },
    { id: 12, code: 'GR-TUT', name: 'Tutor Roma Tre', school: null, school_level: null, institution_id: null,
      description: null, methodologies: null, context_visible_to_students: false, owner_username: 'teacher.test', is_active: true, members_count: 3, created_at: null },
];
const settings = id => ({ group_id: id, revision: 1, disabled_tool_keys: [], tools: [
    { key: 'tavolo', kind: 'personal', category: 'personal', label_key: 'tavolo', label_i18n: {}, admin_enabled: true, enabled: true, always_on: false },
] });

function fakeServer() {
    const state = { templates: [], paths: { 11: [], 12: [] }, requests: [] };
    const template = body => ({ id: 70 + state.templates.length, owner_username: 'teacher.test', owner_name: 'Docente', is_owner: true,
        shared: false, revision: 1, description: null, mode: 'recommended', ...body,
        steps: body.steps.map((step, index) => ({ ...step, id: 900 + index, position: index + 1 })) });
    const pendingPath = (groupId, tpl) => ({ id: 300 + groupId, group_id: groupId, title: tpl.title, description: null, mode: 'recommended',
        status: 'draft', revision: 1, created_by: 'teacher.test', template_id: tpl.id, steps_count: 3, steps: [
            { id: 1, position: 1, step_type: 'tool', tool_key: 'tavolo', auto_detect: true, pending_config: null },
            { id: 2, position: 2, step_type: 'pending', tool_key: null, auto_detect: true, availability_reason: 'pending_preparation',
              pending_config: { kind: 'questionnaire_administration', instrument_code: 'QSA', locale: 'it', plan_title: 'Avvio' } },
            { id: 3, position: 3, step_type: 'pending', tool_key: null, auto_detect: true, availability_reason: 'pending_preparation',
              pending_config: { kind: 'forum', title: 'Com’è andata?', body: 'Racconta' } },
        ] });
    return async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = request.method();
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        state.requests.push({ method, path: url.pathname, body });
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        const path = url.pathname;
        if (path === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: 'teacher.test', name: 'Docente',
            email: 'teacher@example.invalid', groups: ['docenti'] });
        if (path === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (path === '/api/orientation/status') return json({ required: false, completed: true });
        if (path === '/api/admin/groups') return json(groups);
        if (path === '/api/teacher/goal-catalog') return json([{ id: 40, status: 'published', group_id: null, data: { title: 'Pianificare la settimana' } }]);
        if (path === '/api/teacher/path-templates' && method === 'GET') return json({ mine: state.templates, shared: [] });
        if (path === '/api/teacher/path-templates' && method === 'POST') {
            const created = template(body);
            state.templates.push(created);
            return json(created, 201);
        }
        const apply = path.match(/^\/api\/teacher\/path-templates\/(\d+)\/apply$/);
        if (apply) {
            const tpl = state.templates.find(row => row.id === Number(apply[1]));
            const created = body.group_ids.map(id => pendingPath(id, tpl));
            created.forEach(row => state.paths[row.group_id].push(row));
            return json(created, 201);
        }
        const groupPaths = path.match(/^\/api\/teacher\/groups\/(\d+)\/paths$/);
        if (groupPaths) return json(state.paths[Number(groupPaths[1])] ?? []);
        const groupSettings = path.match(/^\/api\/teacher\/groups\/(\d+)\/settings$/);
        if (groupSettings) return json(settings(Number(groupSettings[1])));
        const saveAs = path.match(/^\/api\/teacher\/paths\/(\d+)\/save-as-template$/);
        if (saveAs) return json(template({ title: 'Copia', steps: [] }), 201);
        const templateUpdate = path.match(/^\/api\/teacher\/paths\/(\d+)\/template-update$/);
        if (templateUpdate && method === 'GET') return json({ template_id: 70, template_title: 'Inizio anno', template_revision: 2,
            path_template_revision: 1, changes: [
                { change: 'added', step_type: 'tool', tool_key: 'tavolo', title: 'Ripasso', status: 'apply' },
                { change: 'changed', step_type: 'forum', tool_key: null, title: null, status: 'created' },
            ] });
        if (templateUpdate) {
            const current = state.paths[11][0];
            current.revision += 1;
            current.template_revision = body.template_revision;
            current.steps.push({ id: 4, position: 4, step_type: 'tool', tool_key: 'tavolo', title: 'Ripasso', auto_detect: true, pending_config: null });
            return json({ path: current, skipped: [] });
        }
        if (path.startsWith('/api/groups/') && path.endsWith('/forum/topics')) return json({ topics: [] });
        return json([]);
    };
}

async function prepare(page) {
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
    const handler = fakeServer();
    await page.route('**/*', handler);
    return errors;
}

{
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = await prepare(page);
    const requests = [];
    page.on('request', request => { if (request.url().includes('/api/teacher/')) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    await page.goto(`${origin}/docente/percorsi`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'I miei modelli' }).waitFor();
    await page.getByText('Non hai ancora modelli.').waitFor();

    // Create a template with a tool, a questionnaire and a results chat.
    await page.getByRole('button', { name: 'Nuovo modello' }).click();
    const editor = page.locator('[data-testid="path-template-editor"]');
    await editor.getByRole('textbox', { name: 'Titolo', exact: true }).fill('Inizio anno');
    await editor.getByRole('combobox', { name: /^Tipo di passo/ }).selectOption('tool');
    await editor.getByRole('button', { name: 'Aggiungi passo' }).click();
    await editor.getByRole('combobox', { name: /^Strumento/ }).selectOption('tavolo');
    await editor.getByRole('combobox', { name: /^Tipo di passo/ }).selectOption('guided_results_chat');
    await editor.getByRole('button', { name: 'Aggiungi passo' }).click();
    // A results chat without an earlier questionnaire cannot be saved.
    assert.equal(await editor.getByRole('button', { name: 'Salva modello' }).isDisabled(), true);
    await editor.getByRole('combobox', { name: /^Tipo di passo/ }).selectOption('questionnaire_administration');
    await editor.getByRole('button', { name: 'Aggiungi passo' }).click();
    await editor.getByRole('button', { name: 'Sposta su #3' }).click();
    await editor.getByRole('combobox', { name: /^Sui risultati del passo/ }).selectOption('2');
    await editor.getByRole('button', { name: 'Salva modello' }).click();
    await page.getByText('Modello salvato.').waitFor();
    await page.getByText('Inizio anno').waitFor();

    // Apply it to the class: the class editor lists the draft with pending steps.
    await page.getByRole('button', { name: 'Applica a…' }).click();
    await page.getByRole('checkbox', { name: '3B Liceo · Liceo Sintetico' }).check();
    await page.getByRole('group', { name: /Applica a classi o gruppi/ }).getByRole('button', { name: 'Applica a…' }).click();
    await page.getByText('Applicato: trovi la bozza nella classe o nel gruppo.').waitFor();
    await page.getByRole('button', { name: 'Apri' }).click();
    const cards = page.locator('[data-testid="path-step-card"]');
    await cards.nth(1).getByText('Da preparare · Somministrazione del questionario · QSA IT').waitFor();
    await cards.nth(2).getByText(/Da preparare · .*Com’è andata\?/).waitFor();
    assert.equal(await page.getByText('Verrà creato quando pubblichi il percorso; fino ad allora gli studenti non vedono nulla.').count(), 2);
    await page.getByRole('button', { name: 'Salva come modello' }).click();
    await page.getByText('Salvato tra i tuoi modelli.').waitFor();

    // Update from template: the differences come first, then only untouched steps change.
    await page.getByRole('button', { name: 'Aggiorna da modello' }).click();
    const update = page.locator('[aria-label="Aggiorna da modello"]');
    await update.getByText('Nuovo · Strumento · Tavolo').waitFor();
    await update.getByText('già creato nella classe: modificalo nel percorso').waitFor();
    await update.getByRole('button', { name: 'Applica aggiornamento' }).click();
    await page.getByText('Percorso aggiornato dal modello.').waitFor();
    assert.equal(await cards.count(), 4);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.ok(requests.includes('POST /api/teacher/paths/311/template-update'));

    const created = requests.filter(row => row === 'POST /api/teacher/path-templates');
    assert.equal(created.length, 1);
    await page.close();
}

{
    // Phone width: the templates panel and the apply form stay inside the viewport.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = await prepare(page);
    await page.goto(`${origin}/docente/percorsi`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Preset condivisi' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('path templates OK');
