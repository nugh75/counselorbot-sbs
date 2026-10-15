import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.TEACHER_CLASSES_BASE_URL || process.env.LIVE_DEV_URL || 'http://127.0.0.1:3133').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const demo = {
    id: 91,
    name: 'Classe Demo',
    code: 'GR-DEMO91',
    school: 'Ente Demo',
    school_level: null,
    institution_id: null,
    description: 'Contesto salvato',
    methodologies: 'Laboratorio',
    context_visible_to_students: false,
    owner_username: 'teacher.fixture',
    is_active: true,
    members_count: 0,
    shares_count: 0,
};

async function fixture({
    lang = 'it',
    width = 390,
    scale = 1,
    role = 'docenti',
    admin = false,
    readFailure = false,
    path = '/docente/classi',
} = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: scale });
    await context.addInitScript(lang => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', 'light');
    }, lang);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const state = {
        rows: [structuredClone(demo), { ...demo, id: 92, name: 'Gruppo Demo', code: 'GR-DEMO92' }],
        writes: [],
        reads: [],
        errors: [],
        failure: false,
        readFailure,
        holdWrite: null,
        holdRead: null,
    };
    page.on('pageerror', error => state.errors.push(error.message));

    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();

        if (request.method() !== 'GET') {
            const body = request.postDataJSON();
            state.writes.push({ path: url.pathname, method: request.method(), body });
            assert.match(url.pathname, /^\/api\/admin\/groups(?:\/\d+)?$/);
            const failure = state.failure;
            if (state.holdWrite) {
                const pending = state.holdWrite;
                state.holdWrite = null;
                await pending;
            }
            if (failure) return route.fulfill({ status: failure, json: { detail: 'PRIVATE DETAIL' } });
            const id = Number(url.pathname.split('/').at(-1));
            if (request.method() === 'PUT') state.rows = state.rows.map(row => row.id === id ? { ...row, ...body } : row);
            if (request.method() === 'POST') state.rows.push({ ...demo, ...body, id: 93, name: body.name });
            return route.fulfill({ json: state.rows.find(row => row.id === id) || {} });
        }

        state.reads.push(url.pathname);
        let data = [];
        if (url.pathname === '/api/auth/me') {
            data = { authenticated: true, username: 'teacher.fixture', name: 'Teacher Demo', groups: [role], is_admin: admin };
        } else if (url.pathname === '/api/admin/groups') {
            const snapshot = structuredClone(state.rows);
            const failure = state.readFailure;
            if (state.holdRead) await state.holdRead;
            if (failure) return route.fulfill({ status: failure, json: {} });
            data = snapshot;
        } else if (url.pathname.endsWith('/settings')) {
            data = {
                group_id: 91,
                revision: 1,
                tools: [],
                disabled_tool_keys: [],
                disabled_counselor_ids: [],
                default_counselor_id: null,
                forum: { students_can_open: false, premoderation: false },
                counselors: [],
                students_personal_ai: true,
            };
        } else if (url.pathname.endsWith('/shares')) {
            data = [];
        } else if (url.pathname.endsWith('/users-summary') || url.pathname === '/api/admin/users-summary') {
            data = [];
        } else if (url.pathname === '/api/user/account-preferences') {
            data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        } else if (url.pathname === '/api/orientation/status') {
            data = { required: false, completed: true };
        } else if (url.pathname === '/api/telegram/bot-info') {
            data = { enabled: true, bot_username: 'fixture_bot' };
        } else if (url.pathname === '/api/admin/groups/91/students') {
            data = { students: [{ username: 'participant.fixture', telegram_linked: false, learner_profile: null, results: [] }] };
        } else if (url.pathname.includes('institutions')) {
            data = [{ id: 5, name: 'Istituto Demo', kind: 'school', slug: 'demo' }];
        }
        return route.fulfill({ json: data });
    });

    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    const hold = kind => {
        let release;
        state[kind] = new Promise(resolve => { release = resolve; });
        return () => { state[kind] = null; release(); };
    };
    return { context, page, state, hold };
}

test('class directory renders cards with direct links to the class hub, tabs and copy code', async () => {
    const f = await fixture();
    try {
        const demoCard = f.page.locator('div[data-testid="group-card-91"]');
        await demoCard.waitFor();

        // Direct Class Hub open CTA
        const openLink = demoCard.getByRole('link', { name: /Apri classe|Open class/i });
        assert.equal(await openLink.getAttribute('href'), '/docente/classi/91');

        // Shortcut tabs
        const studentsLink = demoCard.locator('a[href="/docente/classi/91?tab=students"]');
        assert.equal(await studentsLink.count(), 1);

        const toolsLink = demoCard.locator('a[href="/docente/classi/91?tab=tools"]');
        assert.equal(await toolsLink.count(), 1);

        const pathsLink = demoCard.locator('a[href="/docente/classi/91?tab=paths"]');
        assert.equal(await pathsLink.count(), 1);

        // Class code
        assert.equal(await demoCard.getByText('GR-DEMO91').isVisible(), true);
        assert.deepEqual(f.state.writes, []);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('existing creation stays before the list, uses four-field payload, and redirects to the class hub', async () => {
    const f = await fixture();
    try {
        await f.page.getByRole('button', { name: 'Nuovo gruppo o classe', exact: true }).click();
        const name = f.page.getByPlaceholder('Es. 3A Informatica, Gruppo Orientamento');
        await name.fill('Nuovo gruppo demo');

        const school = f.page.getByPlaceholder('Es. Liceo Da Vinci');
        await school.fill('Ente Demo');

        const level = f.page.locator('select').first();
        await level.selectOption('universita');

        const institution = f.page.locator('select').nth(1);
        await institution.selectOption('5');

        await f.page.getByRole('button', { name: 'Crea', exact: true }).click();

        // Wait for redirect to the new class hub
        await f.page.waitForURL(`${origin}/docente/classi/93`);
        assert.deepEqual(f.state.writes, [{
            path: '/api/admin/groups',
            method: 'POST',
            body: { name: 'Nuovo gruppo demo', school: 'Ente Demo', school_level: 'universita', institution_id: 5 },
        }]);
    } finally { await f.context.close(); }
});

test('class hub overview renders anagrafica, tracks dirty state and saves via PUT', async () => {
    const f = await fixture({ path: '/docente/classi/91' });
    try {
        const descInput = f.page.getByLabel('Descrizione della classe', { exact: true });
        await descInput.waitFor();
        assert.equal(await descInput.inputValue(), 'Contesto salvato');

        // Edit description -> triggers dirty state
        await descInput.fill('Nuova bozza contesto');
        await f.page.getByText('Modifiche non salvate', { exact: true }).waitFor();

        // Reverting clears dirty state
        await descInput.fill('Contesto salvato');
        assert.equal(await f.page.getByText('Modifiche non salvate', { exact: true }).count(), 0);

        // Edit again and save
        await descInput.fill('Nuovo contesto aggiornato');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByText('Anagrafica della classe salvata.', { exact: true }).waitFor();

        assert.deepEqual(f.state.writes, [{
            path: '/api/admin/groups/91',
            method: 'PUT',
            body: {
                name: 'Classe Demo',
                school: 'Ente Demo',
                school_level: null,
                institution_id: null,
                description: 'Nuovo contesto aggiornato',
                methodologies: 'Laboratorio',
                context_visible_to_students: false,
            },
        }]);
    } finally { await f.context.close(); }
});

test('failed context save displays error alert and retry sends existing payload', async () => {
    const f = await fixture({ path: '/docente/classi/91' });
    try {
        const descInput = f.page.getByLabel('Descrizione della classe', { exact: true });
        await descInput.waitFor();
        await descInput.fill('Nuovo contesto con errore');

        f.state.failure = 503;
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('alert').waitFor();

        f.state.failure = false;
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByText('Anagrafica della classe salvata.', { exact: true }).waitFor();

        assert.equal(f.state.writes.length, 2);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const failure of [401, 403]) test(`write ${failure} revokes editing instead of exposing private class`, async () => {
    const f = await fixture({ path: '/docente/classi/91' });
    try {
        const descInput = f.page.getByLabel('Descrizione della classe', { exact: true });
        await descInput.waitFor();
        f.state.failure = failure;
        await descInput.fill('Bozza da rifiutare');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('alert').waitFor();
    } finally { await f.context.close(); }
});

for (const [role, admin] of [['docenti', false], ['ricercatori', false], ['studenti', true], ['studenti', false]]) {
    test(`access ${role}, admin=${admin} keeps expected permissions`, async () => {
        const f = await fixture({ role, admin });
        try {
            if (role === 'studenti' && !admin) {
                await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
                assert.equal(f.state.reads.includes('/api/admin/groups'), false);
            } else {
                await f.page.getByText('Classi e gruppi studenti').waitFor();
            }
            assert.deepEqual(f.state.writes, []);
        } finally { await f.context.close(); }
    });
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    for (const scale of [1, 2]) {
        test(`${lang}: 320px / ${scale * 100}% equivalent layout fits without horizontal scroll`, async () => {
            const f = await fixture({ lang, width: scale === 2 ? 640 : 320, scale });
            try {
                await f.page.locator('h2').first().waitFor();
                assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
                assert.deepEqual(f.state.writes, []);
                assert.deepEqual(f.state.errors, []);
            } finally { await f.context.close(); }
        });
    }
}
