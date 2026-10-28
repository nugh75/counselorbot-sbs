import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.CLASS_PATH_BASE_URL || 'http://127.0.0.1:3108').origin;
let browser;

before(async () => {
    browser = await chromium.launch({ headless: true });
});

after(async () => {
    await browser?.close();
});

const sampleSteps = [
    {
        id: 101,
        path_id: 1,
        position: 1,
        tool_key: 'bussola',
        title: 'Bussola iniziale',
        instructions: 'Fai il primo colloquio di orientamento',
        due_date: null,
        state: 'done',
        source: 'automatic',
        start_href: '/bussola',
        can_self_mark: false,
    },
    {
        id: 102,
        path_id: 1,
        position: 2,
        tool_key: 'QSA',
        title: 'Compilazione QSA',
        instructions: 'Compila il questionario sulle strategie di studio',
        due_date: '2026-10-15',
        state: 'not_done',
        source: null,
        start_href: '/?start=QSA',
        can_self_mark: false,
    },
    {
        id: 103,
        path_id: 1,
        position: 3,
        tool_key: 'timeline',
        title: 'Linea del tempo',
        instructions: 'Aggiungi una tappa',
        due_date: '2026-10-31',
        state: 'not_done',
        source: null,
        start_href: '/profilo/timeline',
        can_self_mark: true,
    },
];

const samplePath1 = {
    id: 1,
    group_id: 10,
    group_name: '3B Liceo',
    title: 'Inizio anno',
    description: 'Percorso iniziale di orientamento e metodo',
    mode: 'recommended',
    steps: sampleSteps,
    next_step_id: 102,
    done: 1,
    total: 3,
};

const samplePath2 = {
    id: 2,
    group_id: 10,
    group_name: '3B Liceo',
    title: 'Percorso Autunno',
    description: 'Attività successive di consolidamento',
    mode: 'strict',
    steps: [
        {
            id: 201,
            path_id: 2,
            position: 1,
            tool_key: 'goals',
            title: 'Obiettivi di studio',
            due_date: '2026-11-10',
            state: 'not_done',
            source: null,
            start_href: '/profilo/obiettivi',
            can_self_mark: true,
        },
    ],
    next_step_id: 201,
    done: 0,
    total: 1,
};

async function createFixture({
    paths = [samplePath1],
    lang = 'it',
    initialStorage = {},
    width = 1280,
    admin = false,
    frozen = [],
    goals = [],
} = {}) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
    });
    const page = await context.newPage();
    // Stable relation to the fixture deadlines, independent of the calendar date.
    await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });
    page.setDefaultTimeout(12000);
    const errors = [];
    const doneCalls = [];

    page.on('pageerror', (err) => errors.push(err.message));

    await page.addInitScript(
        ({ lang, initialStorage }) => {
            localStorage.setItem('cb_lang', lang);
            localStorage.setItem('cb_theme', 'light');
            for (const [key, value] of Object.entries(initialStorage)) {
                localStorage.setItem(key, value);
            }
        },
        { lang, initialStorage }
    );

    let currentPaths = JSON.parse(JSON.stringify(paths));
    let currentView = admin ? 'all' : 'classes';

    await page.route('**/api/**', (route) => {
        const request = route.request();
        const url = new URL(request.url());


        if (url.pathname === '/api/auth/me') {
            return route.fulfill({
                json: {
                    authenticated: true,
                    is_admin: admin,
                    username: 'student.fixture',
                    name: 'Mario Rossi',
                    groups: [admin ? 'admins' : 'studenti'],
                },
            });
        }
        if (url.pathname === '/api/user/access') {
            return route.fulfill({
                json: {
                    restricted: admin && currentView !== 'all',
                    tool_keys: ['QSA', 'SAVICKAS', 'timeline', ...(admin && currentView !== 'all' ? [] : ['goals']), 'bussola'],
                    counselor_ids: null,
                    default_counselor_id: null,
                    class_ids: [10],
                    classes: [{ id: 10, name: '3B Liceo' }],
                    view: currentView,
                },
            });
        }
        if (url.pathname === '/api/user/access/view' && request.method() === 'PUT') {
            currentView = request.postDataJSON().view;
            return route.fulfill({ json: {
                restricted: currentView !== 'all', tool_keys: ['QSA', 'SAVICKAS', 'timeline', 'bussola'],
                counselor_ids: null, default_counselor_id: null, class_ids: [10],
                classes: [{ id: 10, name: '3B Liceo' }], view: currentView,
            } });
        }
        if (url.pathname === '/api/user/account-preferences') {
            return route.fulfill({
                json: {
                    counselor_id: 1,
                    counselor_ready: true,
                    notebook_ready: true,
                    setup_completed: true,
                },
            });
        }
        if (url.pathname === '/api/orientation/status') {
            return route.fulfill({ json: { required: false, completed: true } });
        }
        if (url.pathname === '/api/counselors') {
            return route.fulfill({
                json: [
                    {
                        id: 1,
                        name: 'Clio',
                        slug: 'clio',
                        language: ['it'],
                        questionnaire_types: ['QSA', 'SAVICKAS'],
                        suitable: true,
                        is_active: true,
                    },
                ],
            });
        }
        if (url.pathname === '/api/instruments' || url.pathname === '/api/admin/instruments') {
            return route.fulfill({ json: [] });
        }
        if (url.pathname === '/api/session/frozen') {
            return route.fulfill({ json: frozen });
        }
        if (url.pathname === '/api/user/questionnaire-results') {
            return route.fulfill({ json: [] });
        }
        if (url.pathname === '/api/user/learner-profile') {
            return route.fulfill({ json: { created_at: '2026-09-05T08:00:00Z', profile: {} } });
        }
        if (url.pathname === '/api/user/forum/unread') {
            return route.fulfill({ json: { total: 0, by_group: {} } });
        }
        if (url.pathname === '/api/user/goals') {
            return route.fulfill({ json: goals });
        }
        if (url.pathname === '/api/user/assignments') {
            return route.fulfill({ json: [] });
        }
        if (url.pathname === '/api/user/paths') {
            return route.fulfill({ json: currentPaths });
        }

        const doneMatch = url.pathname.match(/^\/api\/user\/paths\/(\d+)\/steps\/(\d+)\/done$/);
        if (doneMatch) {
            const pathId = Number(doneMatch[1]);
            const stepId = Number(doneMatch[2]);
            const method = request.method();
            doneCalls.push({ pathId, stepId, method });

            const targetPath = currentPaths.find((p) => p.id === pathId);
            if (targetPath) {
                const targetStep = targetPath.steps.find((s) => s.id === stepId);
                if (targetStep) {
                    if (method === 'POST') {
                        targetStep.state = 'done';
                        targetStep.source = 'student';
                        targetPath.done = Math.min(targetPath.total, targetPath.done + 1);
                    } else if (method === 'DELETE') {
                        targetStep.state = 'not_done';
                        targetStep.source = null;
                        targetPath.done = Math.max(0, targetPath.done - 1);
                    }
                }
            }
            return route.fulfill({
                json: {
                    status: method === 'POST' ? 'marked_done' : 'cleared',
                    step_id: stepId,
                    username: 'student.fixture',
                },
            });
        }

        return route.fulfill({ json: [] });
    });

    return { context, page, errors, doneCalls };
}

test('student home resumes questionnaire and guided chats alongside personal work', async () => {
    const frozen = [
        { session_id: 'qsa-1', questionnaire_type: 'QSA', label: 'QSA — Profilo', current_phase: 'intro' },
        { session_id: 'sav-1', questionnaire_type: 'SAVICKAS', label: 'SAVICKAS — Storia', current_phase: 'intro' },
        { session_id: 'practice-1', questionnaire_type: 'SAVICKAS', label: 'Simulazione', practice_notebook_id: 8, current_phase: 'intro' },
    ];
    const f = await createFixture({ paths: [], frozen, goals: [{ id: 2, title: 'Organizzare lo studio', status: 'active', links: [], review_date: null }],
        initialStorage: { counselorbot_resume: JSON.stringify({ instrument: 'QSA', sessionId: 'qsa-1', experience: 'standard', counselorId: 1 }) } });
    try {
        await f.page.goto(`${origin}/profilo`);
        const section = f.page.locator('section[aria-labelledby="personal-resume-title"]');
        await section.getByText('SAVICKAS — Storia').waitFor();
        assert.equal(await section.getByRole('link', { name: 'QSA — Profilo' }).getAttribute('href'), '/?frozen=qsa-1');
        assert.equal(await section.getByRole('link', { name: 'SAVICKAS — Storia' }).getAttribute('href'), '/?frozen=sav-1');
        assert.equal(await section.getByText('Simulazione').count(), 0);
        assert.equal(await section.getByText('QSA — Profilo').count(), 1);
        assert.equal(await section.getByText('Organizzare lo studio').count(), 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('an administrator enrolled in a class sees the student plan and class selector', async () => {
    const f = await createFixture({ admin: true });
    try {
        await f.page.goto(`${origin}/profilo`);
        const hero = f.page.locator('[data-testid="class-path-hero-card"]');
        await hero.waitFor();
        assert.match(await hero.innerText(), /Inizio anno/);
        const selector = f.page.locator('header select').first();
        await selector.waitFor();
        assert.equal(await selector.inputValue(), 'all');
        assert.match(await selector.innerText(), /3B Liceo/);
        await selector.selectOption('classes');
        await f.page.waitForFunction(() => document.querySelector('header select')?.value === 'classes');
        await f.page.locator('[data-testid="toggle-profile-catalog-btn"]').click();
        assert.equal(await f.page.locator('#personal-catalog-section a[href="/profilo/obiettivi"]').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('student home includes a locally interrupted chat when no saved copy exists', async () => {
    const f = await createFixture({ paths: [], initialStorage: {
        counselorbot_resume: JSON.stringify({ instrument: 'QSA', sessionId: 'local-1', experience: 'standard', counselorId: 1 }),
    } });
    try {
        await f.page.goto(`${origin}/profilo`);
        const section = f.page.locator('section[aria-labelledby="personal-resume-title"]');
        const link = section.locator('a[href="/?resume=1"]');
        await link.waitFor();
        assert.match(await link.innerText(), /QSA/);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('Home with active class path: heading first, folded plan, catalog always visible', async () => {
    const f = await createFixture({ paths: [samplePath1], lang: 'it' });
    try {
        await f.page.goto(`${origin}/?view=home`, { waitUntil: 'domcontentloaded' });

        // The page heading comes first, the plan immediately below it.
        const heading = f.page.getByRole('heading', { name: 'Attività e percorsi', exact: true });
        const heroCard = f.page.locator('[data-testid="class-path-hero-card"]');
        await heroCard.waitFor({ state: 'visible' });
        const headingBox = await heading.boundingBox();
        const heroBox = await heroCard.boundingBox();
        assert.ok(headingBox.y < heroBox.y);

        // Subtitle shows class name
        assert.ok((await heroCard.innerText()).toLowerCase().includes('3b liceo'));
        // Title shows path title and starts folded
        const planToggle = heroCard.getByRole('button', { name: 'Inizio anno', exact: true });
        assert.equal(await planToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await heroCard.getByText('Compilazione QSA').count(), 0);
        // A folded plan still shows its progress.
        assert.ok((await heroCard.innerText()).includes('1 di 3 completati'));

        // Expanding the plan reveals the current step (step 102), with ochre styling and ▶.
        // A done step reopens; a chat start remembers the way back to the plan.
        await planToggle.click();
        assert.equal(await planToggle.getAttribute('aria-expanded'), 'true');
        assert.equal(await heroCard.getByRole('link', { name: 'Riapri' }).getAttribute('href'), '/bussola');
        assert.equal(await heroCard.getByRole('link', { name: 'Inizia' }).first().getAttribute('href'), '/?start=QSA&from=plan');
        const currentStep = heroCard.getByText('Compilazione QSA');
        await currentStep.waitFor({ state: 'visible' });
        const currentBadge = heroCard.getByText('In corso');
        await currentBadge.waitFor({ state: 'visible' });

        // The rest of the page is never folded: no catalog toggle, catalog visible.
        assert.equal(await f.page.locator('[data-testid="toggle-catalog-btn"]').count(), 0);
        const catalogSection = f.page.locator('#home-catalog-section');
        await catalogSection.waitFor({ state: 'visible' });
        assert.equal(await catalogSection.getAttribute('hidden'), null);

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Home without active class path: hero card absent, catalog open normally', async () => {
    const f = await createFixture({ paths: [], lang: 'it' });
    try {
        // Without active path and with learner profile, user opens /?view=home (base step)
        await f.page.goto(`${origin}/?view=home`, { waitUntil: 'domcontentloaded' });

        // Hero card is NOT rendered
        const heroCard = f.page.locator('[data-testid="class-path-hero-card"]');
        assert.equal(await heroCard.count(), 0);

        // Catalog toggle is NOT rendered
        const toggleBtn = f.page.locator('[data-testid="toggle-catalog-btn"]');
        assert.equal(await toggleBtn.count(), 0);

        // Catalog is open normally and visible
        const catalogSection = f.page.locator('#home-catalog-section');
        await catalogSection.waitFor({ state: 'visible' });
        assert.equal(await catalogSection.getAttribute('hidden'), null);

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Home with several paths: every plan listed and folded', async () => {
    // samplePath1 has due date 2026-10-15; samplePath2 has due date 2026-11-10.
    const f = await createFixture({ paths: [samplePath2, samplePath1], lang: 'it' });
    try {
        await f.page.goto(`${origin}/?view=home`, { waitUntil: 'domcontentloaded' });

        const list = f.page.locator('[data-testid="class-path-hero-list"]');
        const cards = list.locator('[data-testid="class-path-hero-card"]');
        await cards.first().waitFor({ state: 'visible' });
        assert.equal(await cards.count(), 2);

        const first = list.getByRole('button', { name: 'Inizio anno', exact: true });
        const second = list.getByRole('button', { name: 'Percorso Autunno', exact: true });
        assert.equal(await first.getAttribute('aria-expanded'), 'false');
        assert.equal(await second.getAttribute('aria-expanded'), 'false');
        assert.equal(await cards.nth(0).getByText('Compilazione QSA').count(), 0);
        assert.equal(await cards.nth(1).getByText('Obiettivi di studio').count(), 0);
        // A folded plan still shows its progress.
        assert.ok((await cards.nth(1).innerText()).includes('0 di 1 completati'));

        await second.click();
        assert.equal(await second.getAttribute('aria-expanded'), 'true');
        await cards.nth(1).getByText('Obiettivi di studio').waitFor({ state: 'visible' });
        await first.click();
        assert.equal(await first.getAttribute('aria-expanded'), 'true');
        await cards.nth(0).getByText('Compilazione QSA').waitFor({ state: 'visible' });

        const allPathsLink = list.getByRole('link', { name: /Vedi tutti i piani operativi/i });
        assert.equal(await allPathsLink.getAttribute('href'), '/profilo/piani-operativi');
        assert.ok((await allPathsLink.innerText()).includes('(2)'));
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Self-marking on hero card calls API and updates step state', async () => {
    const f = await createFixture({ paths: [samplePath1], lang: 'it' });
    try {
        await f.page.goto(`${origin}/?view=home`, { waitUntil: 'domcontentloaded' });

        const heroCard = f.page.locator('[data-testid="class-path-hero-card"]');
        await heroCard.waitFor({ state: 'visible' });

        // Step 103 (timeline) has can_self_mark = true and state not_done
        const markDoneBtn = heroCard.getByRole('button', { name: 'Segna come completato' });
        await markDoneBtn.waitFor({ state: 'visible' });

        // Click mark done
        await markDoneBtn.click();

        // Check that API was called
        assert.ok(f.doneCalls.some((c) => c.stepId === 103 && c.method === 'POST'));

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Student area (/profilo): hero card displayed first when path active, tools collapsible', async () => {
    const f = await createFixture({ paths: [samplePath1], lang: 'it' });
    try {
        await f.page.goto(`${origin}/profilo`, { waitUntil: 'domcontentloaded' });

        // Hero card is visible at the top
        const heroCard = f.page.locator('[data-testid="class-path-hero-card"]');
        await heroCard.waitFor({ state: 'visible' });
        assert.ok((await heroCard.innerText()).includes('Inizio anno'));

        // Toggle profile tools button is present and collapsed
        const toggleBtn = f.page.locator('[data-testid="toggle-profile-catalog-btn"]');
        await toggleBtn.waitFor({ state: 'visible' });
        assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'false');

        // Personal tools section is hidden
        const toolsSection = f.page.locator('#personal-catalog-section');
        assert.equal(await toolsSection.getAttribute('hidden'), '');

        // Click to expand
        await toggleBtn.click();
        assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'true');
        assert.equal(await toolsSection.getAttribute('hidden'), null);

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Student area (/profilo) on a phone: every plan listed and folded except the first', async () => {
    const f = await createFixture({ paths: [samplePath2, samplePath1], lang: 'it', width: 390 });
    try {
        await f.page.goto(`${origin}/profilo`, { waitUntil: 'domcontentloaded' });
        const cards = f.page.locator('[data-testid="class-path-hero-list"] [data-testid="class-path-hero-card"]');
        await cards.first().waitFor({ state: 'visible' });
        assert.equal(await cards.count(), 2);
        assert.equal(await f.page.getByRole('button', { name: 'Percorso Autunno', exact: true }).getAttribute('aria-expanded'), 'false');
        if (process.env.CLASS_PATH_SHOT) await f.page.screenshot({ path: process.env.CLASS_PATH_SHOT });
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});
