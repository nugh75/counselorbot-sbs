import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.INSTITUTES_BASE_URL || 'http://127.0.0.1:3148').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({ lang = 'en', width = 390, role = 'docenti' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const state = { username: 'first', schools: [], memberships: {}, groups: [], writes: [], errors: [], failure: 0 };
    page.on('pageerror', error => state.errors.push(error.message));
    const publicRow = school => ({ ...school, member_count: (state.memberships[school.id] || []).length });
    await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname;
        if (url.origin !== origin) return route.abort();
        if (!path.startsWith('/api/')) return route.continue();
        if (req.method() !== 'GET') {
            const body = req.postData() ? req.postDataJSON() : null;
            state.writes.push({ path, method: req.method(), body });
            if (state.failure) return route.fulfill({ status: state.failure, json: { detail: 'PRIVATE ERROR' } });
            if (path.endsWith('/join')) {
                const id = Number(path.split('/').at(-2));
                state.memberships[id] ||= [];
                if (!state.memberships[id].includes(state.username)) state.memberships[id].push(state.username);
                return route.fulfill({ json: publicRow(state.schools.find(row => row.id === id)) });
            }
            if (path === '/api/teacher/institutions') {
                const row = { id: 51, slug: 'synthetic', revision: 1, credentials_configured: false, is_active: true, ...body };
                state.schools.push(row); state.memberships[row.id] = [state.username];
                return route.fulfill({ status: 201, json: publicRow(row) });
            }
            if (path.startsWith('/api/teacher/institutions/')) {
                const id = Number(path.split('/').at(-1));
                state.schools = state.schools.map(row => row.id === id ? { ...row, ...body, revision: row.revision + 1 } : row);
                return route.fulfill({ json: publicRow(state.schools.find(row => row.id === id)) });
            }
            if (path === '/api/admin/groups') {
                const group = { id: 91, code: 'GR-DEMO91', owner_username: state.username, is_active: true, members_count: 0, ...body };
                state.groups.push(group); return route.fulfill({ json: group });
            }
            if (path.startsWith('/api/admin/groups/')) {
                const id = Number(path.split('/').at(-1));
                state.groups = state.groups.map(row => row.id === id ? { ...row, ...body } : row);
                return route.fulfill({ json: state.groups.find(row => row.id === id) });
            }
            throw new Error(`Unexpected write ${path}`);
        }
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: state.username, name: 'Synthetic teacher', groups: [role], is_admin: role === 'admins' };
        else if (path === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/teacher/institutions/directory') data = state.schools.map(row => ({ ...row, joined: (state.memberships[row.id] || []).includes(state.username), can_join: !(state.memberships[row.id] || []).includes(state.username) && (state.memberships[row.id] || []).length < 2 }));
        else if (path === '/api/teacher/institutions') data = state.schools.filter(row => (state.memberships[row.id] || []).includes(state.username)).map(publicRow);
        else if (path.startsWith('/api/teacher/institutions/')) data = publicRow(state.schools.find(row => row.id === Number(path.split('/').at(-1))));
        else if (path === '/api/admin/groups') data = state.groups.filter(row => row.owner_username === state.username);
        else if (path === '/api/telegram/bot-info') data = { enabled: false };
        return route.fulfill({ json: data });
    });
    return { context, page, state };
}

test('first teacher creates an institute with explicit save and reloads its class context', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/docente/istituti`);
        await f.page.getByRole('button', { name: 'Create institute', exact: true }).click();
        await f.page.getByLabel('Institute name', { exact: true }).fill('Synthetic school');
        assert.equal(f.state.writes.length, 0);
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByRole('link', { name: 'Synthetic school', exact: true }).click();
        await f.page.getByRole('button', { name: 'New group or class', exact: true }).click();
        await f.page.getByPlaceholder('Name (e.g. 3B, university students, adult learning)').fill('Synthetic class');
        await f.page.getByRole('button', { name: 'Create', exact: true }).click();
        await f.page.getByRole('heading', { name: 'Synthetic class', exact: true }).waitFor();
        assert.equal(f.state.groups[0].institution_id, 51);
        await f.page.reload();
        await f.page.getByRole('heading', { name: 'Synthetic class', exact: true }).waitFor();
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

// The browser intercepts every API; fixtures never contact the live database.
const translations = {
    it: ['Istituti', 'Crea istituto', 'Nome istituto', 'Salva', 'Istituti esistenti', 'Aderisci all’istituto selezionato'],
    en: ['Institutes', 'Create institute', 'Institute name', 'Save', 'Existing institutes', 'Join selected institute'],
    es: ['Institutos', 'Crear instituto', 'Nombre del instituto', 'Guardar', 'Institutos existentes', 'Unirse al instituto seleccionado'],
    fr: ['Établissements', 'Créer un établissement', 'Nom de l’établissement', 'Enregistrer', 'Établissements existants', 'Rejoindre l’établissement sélectionné'],
    de: ['Einrichtungen', 'Einrichtung erstellen', 'Name der Einrichtung', 'Speichern', 'Bestehende Einrichtungen', 'Ausgewählter Einrichtung beitreten'],
    sv: ['Lärosäten', 'Skapa lärosäte', 'Lärosätets namn', 'Spara', 'Befintliga lärosäten', 'Gå med i valt lärosäte'],
};
const syntheticSchool = { id: 51, slug: 'synthetic', name: 'Synthetic school', kind: 'school', revision: 1, credentials_configured: false, is_active: true, member_count: 1, needs_admin_review: false };

for (const [lang, [title, create, name, save, directory, join]] of Object.entries(translations)) {
    test(`${lang}: second teacher selects and explicitly joins; notebook stays first, mobile fits`, async () => {
        const f = await fixture({ lang, width: 320 });
        try {
            f.state.schools = [{ ...syntheticSchool }]; f.state.memberships[51] = ['first']; f.state.username = 'second';
            f.state.groups = [{ id: 90, name: 'Private first-teacher class', code: 'GR-DEMO90', owner_username: 'first', institution_id: 51 }];
            await f.page.goto(`${origin}/docente`);
            const home = f.page.locator('[data-teacher-area-home]');
            await home.getByRole('link', { name: title, exact: true }).waitFor();
            assert.equal(await home.locator('a').first().getAttribute('href'), '/docente/taccuino');
            if (process.env.INSTITUTES_CAPTURE_GUIDE === '1') {
                await f.page.setViewportSize({ width: 1440, height: 1000 });
                await home.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
                await f.page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
                await f.page.screenshot({ path: `frontend/public/guide/${lang}/teacher-area.png`, fullPage: true });
                await f.page.setViewportSize({ width: 320, height: 950 });
            }
            await home.getByRole('link', { name: title, exact: true }).click();
            await f.page.getByRole('button', { name: create, exact: true }).waitFor();
            assert.equal(f.state.writes.length, 0);
            await f.page.getByRole('combobox', { name: directory, exact: true }).selectOption('51');
            assert.equal(f.state.writes.length, 0);
            await f.page.getByRole('button', { name: join, exact: true }).click();
            await f.page.getByRole('link', { name: 'Synthetic school', exact: true }).waitFor();
            assert.deepEqual(f.state.memberships[51], ['first', 'second']);
            await f.page.reload();
            const instituteLink = f.page.getByRole('link', { name: 'Synthetic school', exact: true });
            await instituteLink.waitFor();
            assert.equal(await f.page.getByRole('button', { name: join, exact: true }).isDisabled(), true);
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            if (process.env.INSTITUTES_CAPTURE_GUIDE === '1') {
                await f.page.setViewportSize({ width: 1440, height: 1000 });
                await f.page.screenshot({ path: `frontend/public/guide/${lang}/teacher-institutes.png`, fullPage: true });
            }
            await instituteLink.click();
            assert.equal(await f.page.getByRole('heading', { name: 'Private first-teacher class' }).count(), 0);
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}

test('failed creation and stale edit preserve drafts, retry saves once, cancel reloads', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/docente/istituti`);
        await f.page.getByRole('button', { name: 'Create institute', exact: true }).click();
        const name = f.page.getByLabel('Institute name', { exact: true });
        await name.fill('Synthetic school'); f.state.failure = 503;
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.locator('[role=alert]').filter({ hasText: /Save failed|Another teacher|Could not join/ }).first().waitFor();
        assert.equal(await name.inputValue(), 'Synthetic school');
        assert.equal((await f.page.locator('[role=alert]').filter({ hasText: 'Save failed' }).first().innerText()).includes('PRIVATE'), false);
        f.state.failure = 0;
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByRole('link', { name: 'Synthetic school', exact: true }).waitFor();
        await f.page.getByRole('button', { name: 'Edit', exact: true }).click();
        await name.fill('Unsaved rename'); f.state.failure = 409;
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.locator('[role=alert]').filter({ hasText: /Save failed|Another teacher|Could not join/ }).first().waitFor();
        assert.equal(await name.inputValue(), 'Unsaved rename');
        assert.equal(f.state.schools[0].name, 'Synthetic school');
        assert.equal(f.state.writes.at(-1).body.revision, 1);
        f.page.once('dialog', dialog => dialog.dismiss());
        await f.page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(await name.inputValue(), 'Unsaved rename');
        f.page.once('dialog', dialog => dialog.accept());
        await f.page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await f.page.getByRole('button', { name: 'Edit', exact: true }).click();
        assert.equal(await name.inputValue(), 'Synthetic school');
        f.state.failure = 0;
        await name.fill('Saved rename');
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByRole('link', { name: 'Saved rename', exact: true }).waitFor();
        assert.equal(f.state.schools[0].revision, 2);
    } finally { await f.context.close(); }
});

test('failed self-join grants nothing, keeps selection and allows a deliberate retry', async () => {
    const f = await fixture();
    try {
        f.state.schools = [{ ...syntheticSchool }]; f.state.memberships[51] = ['first']; f.state.username = 'second';
        await f.page.goto(`${origin}/docente/istituti`);
        await f.page.getByRole('combobox', { name: 'Existing institutes', exact: true }).selectOption('51'); f.state.failure = 409;
        await f.page.getByRole('button', { name: 'Join selected institute', exact: true }).click();
        await f.page.locator('[role=alert]').filter({ hasText: /Save failed|Another teacher|Could not join/ }).first().waitFor();
        assert.deepEqual(f.state.memberships[51], ['first']);
        assert.equal(await f.page.getByRole('combobox', { name: 'Existing institutes', exact: true }).inputValue(), '51');
        assert.equal(await f.page.getByRole('link', { name: 'Synthetic school', exact: true }).count(), 0);
        f.state.failure = 0;
        await f.page.getByRole('button', { name: 'Join selected institute', exact: true }).click();
        await f.page.getByRole('link', { name: 'Synthetic school', exact: true }).waitFor();
    } finally { await f.context.close(); }
});

test('institute context links an existing unlinked class, preserves it on failure and filters other classes', async () => {
    const f = await fixture();
    try {
        f.state.schools = [{ ...syntheticSchool }]; f.state.memberships[51] = ['first'];
        f.state.groups = [{ id: 92, name: 'Unlinked class', owner_username: 'first', institution_id: null, members_count: 0 },
            { id: 93, name: 'Other institute class', owner_username: 'first', institution_id: 99, members_count: 0 }];
        await f.page.goto(`${origin}/docente/istituti/51`);
        const select = f.page.getByLabel('Class without an institute', { exact: true });
        await select.selectOption('92'); f.state.failure = 503;
        await f.page.getByRole('button', { name: 'Link class', exact: true }).click();
        await f.page.locator('[role=alert]').filter({ hasText: /Save failed|Another teacher|Could not join/ }).first().waitFor();
        assert.equal(f.state.groups[0].institution_id, null); assert.equal(await select.inputValue(), '92');
        f.state.failure = 0;
        await f.page.getByRole('button', { name: 'Link class', exact: true }).click();
        await f.page.getByRole('heading', { name: 'Unlinked class', exact: true }).waitFor();
        assert.equal(await f.page.getByRole('heading', { name: 'Other institute class', exact: true }).count(), 0);
        assert.equal(f.state.groups[0].institution_id, 51);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const role of ['researchers', 'studenti', 'admins']) {
    test(`${role}: direct institute navigation provides no creation or self-join controls`, async () => {
        const f = await fixture({ role });
        try {
            await f.page.goto(`${origin}/docente/istituti`);
            await f.page.waitForLoadState('networkidle');
            assert.equal(await f.page.getByRole('button', { name: 'Create institute', exact: true }).count(), 0);
            assert.equal(await f.page.getByRole('button', { name: 'Join selected institute', exact: true }).count(), 0);
            assert.equal(f.state.writes.length, 0);
        } finally { await f.context.close(); }
    });
}

test('a creation conflict keeps the new draft and shows a retryable save failure', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/docente/istituti`);
        await f.page.getByRole('button', { name: 'Create institute', exact: true }).click();
        await f.page.getByLabel('Institute name', { exact: true }).fill('New synthetic institute');
        f.state.failure = 409;
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByText('Save failed. Your draft is preserved: try again.', { exact: true }).waitFor();
        assert.equal(await f.page.getByLabel('Institute name', { exact: true }).inputValue(), 'New synthetic institute');
        assert.equal(f.state.schools.length, 0);
    } finally { await f.context.close(); }
});
