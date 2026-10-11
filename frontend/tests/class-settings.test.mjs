import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.CLASS_SETTINGS_BASE_URL || 'http://127.0.0.1:3107').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const group = { id: 88, name: 'Synthetic class', code: 'GR-C1TEST', school: 'Test school', owner_username: 'fixture', members_count: 3, is_active: true };
const tool = (key, category, enabled = true, admin_enabled = true, always_on = false) => ({
    key, kind: key === 'QSA' || key === 'DYNAMIC' || key === 'OFF' ? 'instrument' : 'personal',
    category, label_i18n: { en: key, it: key, es: key, fr: key, de: key, sv: key },
    enabled, admin_enabled, always_on,
});
const initial = { group_id: 88, revision: 1, disabled_tool_keys: [], disabled_counselor_ids: [], default_counselor_id: null,
    forum: { students_can_open: false, premoderation: false }, counselors: [], tools: [
        tool('QSA', 'assessment'), tool('OFF', 'assessment', false, false), tool('DYNAMIC', 'guided'),
        tool('tavolo', 'personal'), tool('bussola', 'support'),
        ...['notebook', 'results', 'classes', 'assignments'].map(key => tool(key, 'always_on', true, true, true)),
    ] };

const counselor = (id, name, approach_categories, admin_enabled = true) => ({ id, name, avatar_url: null, approach_categories, admin_enabled, enabled: admin_enabled });
const counselors = [counselor(1, 'Clio', ['tutor']), counselor(2, 'Giulio', ['filosofo']), counselor(3, 'Iride', ['tutor']), counselor(4, 'Retired', ['tutor'], false)];

async function fixture({ lang = 'en', width = 390, settingsFailure = null, role = 'docenti', settings = initial } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); }, lang);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const state = { settings: structuredClone(settings), writes: [], failure: null, readFailure: settingsFailure, held: null, errors: [], lockWrites: [], lockFailure: null, sources: null, routingWrites: [], share: null, shareWrites: [] };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'fixture', name: 'Fixture', groups: [role], is_admin: role === 'admins' };
        else if (url.pathname === '/api/admin/groups') data = [group];
        else if (url.pathname.endsWith('/settings/lock') || url.pathname.endsWith('/settings/unlock')) {
            const body = request.postDataJSON(); state.lockWrites.push(body);
            if (state.lockFailure) return route.fulfill({ status: state.lockFailure, json: { detail: 'PRIVATE DETAIL' } });
            const locked = url.pathname.endsWith('/lock');
            state.settings.revision += 1;
            state.settings.tools = state.settings.tools.map(row => row.key !== body.target_id ? row : {
                ...row, locked, locked_enabled: locked ? body.state : null, locked_by: locked ? 'admin' : null,
                locked_at: locked ? '2026-10-09T09:00:00Z' : null, changed_by_admin: true, enabled: locked ? body.state : row.enabled,
            });
            if (locked) state.settings.disabled_tool_keys = body.state ? state.settings.disabled_tool_keys.filter(key => key !== body.target_id)
                : [...new Set([...state.settings.disabled_tool_keys, body.target_id])];
            data = { status: locked ? 'locked' : 'unlocked' };
        }
        else if (url.pathname.endsWith('/settings')) {
            if (request.method() === 'PUT') {
                const body = request.postDataJSON(); state.writes.push(body);
                if (state.held) await state.held;
                if (state.failure) return route.fulfill({ status: state.failure, json: { detail: 'PRIVATE DETAIL' } });
                state.settings = { ...state.settings, disabled_tool_keys: body.disabled_tool_keys, revision: state.settings.revision + 1,
                    disabled_counselor_ids: body.disabled_counselor_ids ?? state.settings.disabled_counselor_ids,
                    default_counselor_id: body.default_counselor_id ?? null,
                    students_personal_ai: body.students_personal_ai ?? state.settings.students_personal_ai,
                    tools: state.settings.tools.map(row => ({ ...row, enabled: row.admin_enabled && !body.disabled_tool_keys.includes(row.key) })) };
            } else if (state.readFailure) return route.fulfill({ status: state.readFailure, json: {} });
            data = state.settings;
        } else if (url.pathname.endsWith('/api-share') && state.share) {
            if (request.method() === 'PUT') { const body = request.postDataJSON(); state.shareWrites.push(body);
                const c = state.share.connections.find(row => row.id === body.connection_id);
                state.share.share = { owner_username: 'fixture', connection_id: c.id, mine: true, reasoning: body.reasoning, last_error: null, name: c.name, provider: c.provider, model: c.model }; }
            else if (request.method() === 'DELETE') { state.shareWrites.push('DELETE'); state.share.share = null; }
            data = state.share;
        } else if (url.pathname === '/api/user/api-connections') data = state.sources ?? { available: false };
        else if (url.pathname === '/api/user/api-routing') {
            const body = request.postDataJSON(); state.routingWrites.push(body);
            Object.assign(state.sources, body); data = state.sources;
        } else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false };
        return route.fulfill({ json: data });
    });
    await page.goto(`${origin}/docente/classi/88`, { waitUntil: 'networkidle' });
    return { context, page, state };
}

test('Tools tab has accessible toggles and saves only on explicit Save', async () => {
    const f = await fixture();
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const qsa = f.page.getByRole('checkbox', { name: 'QSA', exact: true });
        await qsa.focus(); await f.page.keyboard.press('Space');
        assert.equal(await qsa.isChecked(), false);
        assert.equal(await f.page.getByRole('checkbox', { name: /OFF/ }).isDisabled(), true);
        // Five tools, the two F3 forum options and the students' own APIs option (#217).
        assert.equal(await f.page.getByRole('checkbox').count(), 8);
        assert.deepEqual(f.state.writes, []);
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByText('Settings saved', { exact: true }).waitFor();
        assert.deepEqual(f.state.writes, [{ revision: 1, disabled_tool_keys: ['QSA'], disabled_counselor_ids: [], default_counselor_id: null, forum: { students_can_open: false, premoderation: false }, students_personal_ai: true }]);
        await f.page.reload({ waitUntil: 'networkidle' });
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        assert.equal(await f.page.getByRole('checkbox', { name: 'QSA', exact: true }).isChecked(), false);
        assert.deepEqual(f.state.errors, []);
    } catch (error) {
        console.error({ errors: f.state.errors, headings: await f.page.locator('h1').allTextContents(), url: f.page.url() });
        throw error;
    } finally { await f.context.close(); }
});

test('409 preserves the draft; reload needs discard confirmation and adopts the latest revision', async () => {
    const f = await fixture();
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const qsa = f.page.getByRole('checkbox', { name: 'QSA', exact: true });
        await qsa.uncheck();
        f.state.failure = 409;
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Settings changed elsewhere' }).waitFor();
        assert.equal(await qsa.isChecked(), false);
        assert.equal(await f.page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
        assert.equal(await f.page.getByText('PRIVATE DETAIL').count(), 0);
        f.page.once('dialog', dialog => dialog.dismiss());
        await f.page.getByRole('button', { name: 'Reload', exact: true }).click();
        assert.equal(await qsa.isChecked(), false);
        f.state.settings.revision = 2;
        f.page.once('dialog', dialog => dialog.accept());
        await f.page.getByRole('button', { name: 'Reload', exact: true }).click();
        await f.page.getByText('(r2)', { exact: true }).waitFor();
        assert.equal(await qsa.isChecked(), true);
        assert.equal(f.state.writes.length, 1);
    } finally { await f.context.close(); }
});

test('category actions affect only editable rows; tabs retain the draft and support arrow keys', async () => {
    const f = await fixture();
    try {
        const overview = f.page.getByRole('tab', { name: 'Overview', exact: true });
        await overview.focus(); await f.page.keyboard.press('ArrowRight');
        assert.equal(await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).getAttribute('aria-selected'), 'true');
        const category = f.page.locator('details').filter({ has: f.page.locator('summary').filter({ hasText: /^Questionnaires$/ }) });
        await category.getByRole('button', { name: 'Disable all', exact: true }).click();
        assert.equal(await f.page.getByRole('checkbox', { name: 'QSA', exact: true }).isChecked(), false);
        await overview.click();
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        assert.equal(await f.page.getByRole('checkbox', { name: 'QSA', exact: true }).isChecked(), false);
        await category.getByRole('button', { name: 'Enable all', exact: true }).click();
        assert.equal(await f.page.getByRole('checkbox', { name: 'QSA', exact: true }).isChecked(), true);
        assert.equal(await f.page.getByRole('checkbox', { name: 'OFF', exact: true }).isChecked(), false);
        assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

test('failed saves preserve changes and retry; a pending save cannot be submitted twice', async () => {
    const f = await fixture(); let release;
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const qsa = f.page.getByRole('checkbox', { name: 'QSA', exact: true });
        await qsa.uncheck(); f.state.failure = 500;
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
        assert.equal(await qsa.isChecked(), false);
        f.state.failure = null; f.state.held = new Promise(resolve => { release = resolve; });
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByRole('button', { name: 'Saving', exact: true }).waitFor();
        assert.equal(await qsa.isDisabled(), true);
        assert.equal(await f.page.getByRole('button', { name: 'Saving', exact: true }).isDisabled(), true);
        await f.page.keyboard.press('Enter');
        assert.equal(f.state.writes.length, 2);
        release(); f.state.held = null;
        await f.page.getByText('Settings saved', { exact: true }).waitFor();
        assert.equal(f.state.writes.length, 2);
    } finally { release?.(); await f.context.close(); }
});

test('failed reads expose retry without editable defaults; access denial exposes no toggles', async () => {
    const f = await fixture({ settingsFailure: 500 });
    try {
        await f.page.getByRole('alert').filter({ hasText: 'Could not load' }).waitFor();
        assert.equal(await f.page.getByRole('checkbox').count(), 0);
        f.state.readFailure = null;
        await f.page.getByRole('button', { name: 'Reload', exact: true }).click();
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).waitFor();
    } finally { await f.context.close(); }
    for (const options of [{ settingsFailure: 403 }, { role: 'studenti' }]) {
        const denied = await fixture(options);
        try { assert.equal(await denied.page.getByRole('checkbox').count(), 0); }
        finally { await denied.context.close(); }
    }
});

for (const [lang, tab, save] of [
    ['it', 'Strumenti e counselor', 'Salva'], ['en', 'Tools & counselors', 'Save'],
    ['es', 'Herramientas y counselors', 'Guardar'], ['fr', 'Outils et counselors', 'Enregistrer'],
    ['de', 'Werkzeuge und Counselors', 'Speichern'], ['sv', 'Verktyg och counselors', 'Spara'],
]) test(`six-language controls and mobile layout: ${lang}`, async () => {
    const f = await fixture({ lang, width: 320 });
    try {
        await f.page.getByRole('tab', { name: tab, exact: true }).click();
        assert.equal(await f.page.getByRole('button', { name: save, exact: true }).count(), 1);
        const rows = f.page.locator('#class-panel-toolsTab details label');
        const columns = await rows.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().left)));
        assert.equal(new Set(columns).size, 1);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await f.page.getByRole('checkbox', { name: 'QSA', exact: true }).uncheck();
        await f.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const button = f.page.getByRole('button', { name: save, exact: true });
        const box = await button.boundingBox(); assert.ok(box.y + box.height <= 850);
        assert.deepEqual(f.state.errors, []);
        await f.page.getByRole('checkbox', { name: 'QSA', exact: true }).check();
        await f.page.goto(`${origin}/guide?audience=teacher`, { waitUntil: 'networkidle' });
        await f.page.getByRole('heading', { name: tab, exact: true }).waitFor();
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('class list offers Open class', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
        // Tools & counselors has its own link, separate from Open class and Paths.
        const tools = f.page.getByRole('link', { name: 'Tools & counselors', exact: true });
        assert.equal(await tools.getAttribute('href'), '/docente/classi/88?tab=tools');
        const boxes = await Promise.all(['Open class', 'Tools & counselors'].map(name => f.page.getByRole('link', { name, exact: true }).boundingBox()));
        assert.ok(boxes[1].x >= boxes[0].x + boxes[0].width + 8);
        await tools.click();
        assert.equal(await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).getAttribute('aria-selected'), 'true');
        await f.page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
        const link = f.page.getByRole('link', { name: 'Open class', exact: true });
        assert.equal(await link.getAttribute('href'), '/docente/classi/88');
        await link.click();
        await f.page.getByRole('tab', { name: 'Overview', exact: true }).waitFor();
    } finally { await f.context.close(); }
});

test('Counselors: toggles, filters and one optional class default saved together', async () => {
    const f = await fixture({ settings: { ...initial, counselors, default_counselor_id: 4 } });
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const section = f.page.getByRole('region', { name: 'Counselors' });
        await section.getByText('Enabled 3 / 4').waitFor();
        // A platform-disabled stored default is not offered as current choice.
        assert.equal(await section.getByRole('radio', { name: 'No class default' }).isChecked(), true);
        assert.equal(await section.getByRole('checkbox', { name: 'Retired' }).isDisabled(), true);
        assert.equal(await section.getByRole('radio', { name: 'Class default: Retired' }).isDisabled(), true);
        await section.getByRole('radio', { name: 'Class default: Giulio' }).check();
        await section.getByRole('checkbox', { name: 'Giulio' }).uncheck();
        assert.equal(await section.getByRole('radio', { name: 'No class default' }).isChecked(), true, 'disabling the default clears it');
        assert.equal(await section.getByRole('radio', { name: 'Class default: Giulio' }).isDisabled(), true);
        await section.getByRole('radio', { name: 'Class default: Clio' }).check();
        await section.getByLabel('Category').selectOption('tutor');
        assert.equal(await section.getByRole('checkbox', { name: 'Giulio' }).count(), 0);
        await section.getByLabel('Search counselors').fill('iri');
        assert.equal(await section.getByRole('checkbox').count(), 1);
        await section.getByLabel('Search counselors').fill('zzz');
        await section.getByText('No counselor matches the filters.').waitFor();
        assert.deepEqual(f.state.writes, []);
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByText('Settings saved', { exact: true }).waitFor();
        assert.deepEqual(f.state.writes, [{ revision: 1, disabled_tool_keys: [], disabled_counselor_ids: [2], default_counselor_id: 1, forum: { students_can_open: false, premoderation: false }, students_personal_ai: true }]);
        await f.page.reload({ waitUntil: 'networkidle' });
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        assert.equal(await f.page.getByRole('radio', { name: 'Class default: Clio' }).isChecked(), true);
        assert.equal(await f.page.getByRole('checkbox', { name: 'Giulio' }).isChecked(), false);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('Counselors section fits a 320px screen without horizontal scroll', async () => {
    const f = await fixture({ width: 320, lang: 'de', settings: { ...initial, counselors } });
    try {
        await f.page.getByRole('tab', { name: 'Werkzeuge und Counselors', exact: true }).click();
        await f.page.getByRole('region', { name: 'Counselors' }).waitFor();
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await f.context.close(); }
});

test('teacher sees lock badges, cannot toggle locks and category actions preserve them', async () => {
    const settings = structuredClone(initial);
    settings.tools[0] = { ...settings.tools[0], locked: true, locked_enabled: true, locked_by: 'admin', locked_at: '2026-10-09T09:00:00Z' };
    const f = await fixture({ settings });
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const qsa = f.page.getByRole('checkbox', { name: 'QSA', exact: true });
        assert.equal(await qsa.isDisabled(), true);
        await f.page.getByText('Locked by administrator · Enabled', { exact: true }).waitFor();
        const category = f.page.locator('details').filter({ has: f.page.locator('summary').filter({ hasText: /^Questionnaires$/ }) });
        assert.equal(await category.getByRole('button', { name: 'Disable all', exact: true }).isDisabled(), true);
        assert.equal(await qsa.isChecked(), true);
        assert.equal(await f.page.getByRole('button', { name: 'Lock OFF', exact: true }).count(), 0);
        await f.page.getByRole('tab', { name: 'Change history', exact: true }).click();
        await f.page.getByText('No changes recorded', { exact: true }).waitFor();
        assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

test('admin locks require clean drafts; failed writes retain state and reason; unlock is explicit', async () => {
    const f = await fixture({ role: 'admins' });
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const qsa = f.page.getByRole('checkbox', { name: 'QSA', exact: true });
        const controls = f.page.getByRole('group', { name: 'Settings & locks: QSA', exact: true });
        await qsa.uncheck();
        assert.equal(await controls.getByRole('button', { name: 'Lock OFF', exact: true }).isDisabled(), true);
        await qsa.check();
        await f.page.getByLabel('Reason (optional)', { exact: true }).fill('Synthetic policy');
        f.state.lockFailure = 500;
        await controls.getByRole('button', { name: 'Lock OFF', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
        assert.equal(await qsa.isChecked(), true);
        assert.equal(await f.page.getByLabel('Reason (optional)', { exact: true }).inputValue(), 'Synthetic policy');
        assert.equal(await f.page.getByText('PRIVATE DETAIL').count(), 0);
        f.state.lockFailure = null;
        await controls.getByRole('button', { name: 'Lock OFF', exact: true }).click();
        await f.page.getByText('Locked by administrator · Disabled', { exact: true }).waitFor();
        assert.equal(await qsa.isDisabled(), true);
        assert.equal(await qsa.isChecked(), false);
        assert.deepEqual(f.state.lockWrites.at(-1), { target_kind: 'tool', target_id: 'QSA', state: false, reason: 'Synthetic policy' });
        await controls.getByRole('button', { name: 'Unlock', exact: true }).click();
        await f.page.getByText('Changed by administrator', { exact: true }).waitFor();
        assert.equal(await qsa.isDisabled(), false);
        assert.equal(await qsa.isChecked(), false);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('admin counselor names retain a readable row at 320px beside lock controls', async () => {
    const f = await fixture({ role: 'admins', width: 320, settings: { ...initial, counselors } });
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const label = f.page.getByRole('checkbox', { name: 'Clio', exact: true }).locator('..');
        const box = await label.boundingBox();
        const row = await label.locator('..').boundingBox();
        // The name takes its own full line instead of shrinking beside the lock buttons.
        assert.ok(box.width >= row.width - 20, `Counselor label collapsed to ${box.width}px of ${row.width}px`);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await f.context.close(); }
});

test('#205: counselor details show description, institution model and the teacher\'s own source', async () => {
    const described = { ...counselor(1, 'Clio', ['tutor']), description: 'Ti aiuta a riflettere.', description_i18n: { en: 'Helps you reflect.' },
        model: { name: 'Reflective', provider: 'openrouter', model: 'qwen/test' } };
    const f = await fixture({ width: 390, settings: { ...initial, counselors: [described, counselor(2, 'Giulio', ['filosofo'])] } });
    f.state.sources = { available: true, api_enabled: true, chatgpt_enabled: true, enabled: false, providers: ['openai'],
        default_connection_id: null, default_chatgpt_model: null, default_reasoning: null, bindings: [], counselors: [],
        connections: [{ id: 'a'.repeat(32), name: 'School key', provider: 'openrouter', model: 'qwen/own' }],
        chatgpt_models: [{ slug: 'gpt-x', display_name: 'GPT X', reasoning_levels: ['low', 'high'] }] };
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        await f.page.getByRole('button', { name: 'Details: Clio', exact: true }).click();
        const dialog = f.page.getByRole('dialog', { name: 'Clio' });
        await dialog.getByText('Helps you reflect.', { exact: true }).waitFor();
        assert.equal(await dialog.getByTestId('counselor-institution-model').textContent(), 'Reflective · openrouter · qwen/test');
        assert.equal(await dialog.getByTestId('counselor-answers').textContent(), 'Reflective · openrouter · qwen/test');
        await dialog.locator('#counselor-details-source').selectOption('chatgpt:gpt-x');
        assert.deepEqual(await dialog.locator('#counselor-details-reasoning option').evaluateAll(o => o.map(x => x.value)), ['', 'low', 'high']);
        await dialog.locator('#counselor-details-reasoning').selectOption('high');
        await dialog.getByRole('button', { name: 'Save choice', exact: true }).click();
        await dialog.getByRole('status').filter({ hasText: 'Choice saved.' }).waitFor();
        assert.deepEqual(f.state.routingWrites[0].bindings, [{ counselor_id: 1, connection_id: null, chatgpt_model: 'gpt-x', reasoning: 'high' }]);
        assert.equal(f.state.routingWrites[0].enabled, true);
        assert.equal(await dialog.getByTestId('counselor-answers').textContent(), 'ChatGPT · GPT X');
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await f.page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        // Class settings were not touched; without personal sources only description and model are shown.
        assert.deepEqual(f.state.writes, []);
        f.state.sources = null;
        await f.page.getByRole('button', { name: 'Details: Giulio', exact: true }).click();
        const plain = f.page.getByRole('dialog', { name: 'Giulio' });
        await plain.getByText('No description available.', { exact: true }).waitFor();
        assert.equal(await plain.getByTestId('counselor-institution-model').textContent(), 'Installation default model');
        assert.equal(await plain.locator('#counselor-details-source').count(), 0);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('#217: the teacher decides whether students may use their own APIs and ChatGPT', async () => {
    const f = await fixture({ width: 390, settings: { ...initial, students_personal_ai: true } });
    try {
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const toggle = f.page.getByRole('checkbox', { name: 'Students may use their own APIs and ChatGPT', exact: true });
        assert.equal(await toggle.isChecked(), true);
        await toggle.uncheck();
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByRole('status').filter({ hasText: /./ }).first().waitFor();
        assert.equal(f.state.writes.at(-1).students_personal_ai, false);
        assert.equal(await toggle.isChecked(), false);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('#201: the teacher shares one of their API connections with the class', async () => {
    const f = await fixture({ width: 390, settings: { ...initial, counselors } });
    f.state.share = { available: true, share: { owner_username: 'other', connection_id: 'b'.repeat(32), mine: false, reasoning: null, last_error: null,
        name: null, provider: 'anthropic', model: 'claude-x' }, usage: { requests: 3, cost_usd: 0.1234 },
        connections: [{ id: 'a'.repeat(32), name: 'School key', provider: 'openrouter', model: 'qwen/own' }] };
    try {
        await f.page.reload({ waitUntil: 'networkidle' });
        await f.page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        const section = f.page.getByTestId('class-api-share');
        await section.getByText('Another teacher shares their connection (anthropic · claude-x). Sharing yours replaces it.', { exact: true }).waitFor();
        await section.getByText('This month: 3 requests, 0.12 USD recorded.', { exact: true }).waitFor();
        await section.getByText('Your ChatGPT subscription is personal and cannot be shared with the class.', { exact: true }).waitFor();
        await section.locator('#class-api-share-connection').selectOption('a'.repeat(32));
        await section.locator('#class-api-share-reasoning').selectOption('low');
        await section.getByRole('button', { name: 'Share with the class', exact: true }).click();
        await section.getByText('Shared: School key · qwen/own', { exact: true }).waitFor();
        assert.deepEqual(f.state.shareWrites[0], { connection_id: 'a'.repeat(32), reasoning: 'low' });
        await section.getByRole('button', { name: 'Stop sharing', exact: true }).click();
        await section.getByRole('button', { name: 'Stop sharing', exact: true }).waitFor({ state: 'detached' });
        assert.equal(f.state.shareWrites[1], 'DELETE');
        assert.deepEqual(f.state.writes, []);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});
