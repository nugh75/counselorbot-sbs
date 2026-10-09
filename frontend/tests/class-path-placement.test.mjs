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
} = {}) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
    });
    const page = await context.newPage();
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

    await page.route('**/api/**', (route) => {
        const request = route.request();
        const url = new URL(request.url());


        if (url.pathname === '/api/auth/me') {
            return route.fulfill({
                json: {
                    authenticated: true,
                    is_admin: false,
                    username: 'student.fixture',
                    name: 'Mario Rossi',
                    groups: ['studenti'],
                },
            });
        }
        if (url.pathname === '/api/user/access') {
            return route.fulfill({
                json: {
                    restricted: false,
                    tool_keys: ['QSA', 'SAVICKAS', 'timeline', 'goals', 'bussola'],
                    counselor_ids: null,
                    default_counselor_id: null,
                    class_ids: [10],
                },
            });
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
            return route.fulfill({ json: [] });
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
            return route.fulfill({ json: [] });
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

test('Home with active class path: hero card shown first, ochre current step, catalog collapsed with toggle', async () => {
    const f = await createFixture({ paths: [samplePath1], lang: 'it' });
    try {
        await f.page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });

        // Hero card is rendered
        const heroCard = f.page.locator('[data-testid="class-path-hero-card"]');
        await heroCard.waitFor({ state: 'visible' });

        // Subtitle shows class name
        assert.ok((await heroCard.innerText()).toLowerCase().includes('3b liceo'));
        // Title shows path title
        assert.ok((await heroCard.innerText()).includes('Inizio anno'));

        // Current step (step 102) is rendered with ochre styling and ▶
        const currentStep = heroCard.getByText('Compilazione QSA');
        await currentStep.waitFor({ state: 'visible' });
        const currentBadge = heroCard.getByText('In corso');
        await currentBadge.waitFor({ state: 'visible' });

        // Progress indicates 1 of 3
        assert.ok((await heroCard.innerText()).includes('1 di 3 completati'));

        // Catalog toggle button is visible and collapsed
        const toggleBtn = f.page.locator('[data-testid="toggle-catalog-btn"]');
        await toggleBtn.waitFor({ state: 'visible' });
        assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'false');

        // Catalog section is hidden
        const catalogSection = f.page.locator('#home-catalog-section');
        assert.equal(await catalogSection.getAttribute('hidden'), '');

        // Click toggle button expands catalog
        await toggleBtn.click();
        assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'true');
        assert.equal(await catalogSection.getAttribute('hidden'), null);

        // Verify localStorage remembered state
        const stored = await f.page.evaluate(() => localStorage.getItem('cb_home_catalog_open'));
        assert.equal(stored, 'true');

        // Toggle back collapses catalog
        await toggleBtn.click();
        assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'false');
        assert.equal(await catalogSection.getAttribute('hidden'), '');

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

test('Home with several paths: path with nearest due date displayed first, link to all paths present', async () => {
    // samplePath1 has due date 2026-10-15; samplePath2 has due date 2026-11-10.
    // samplePath1 should be chosen first.
    const f = await createFixture({ paths: [samplePath2, samplePath1], lang: 'it' });
    try {
        await f.page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });

        const heroCard = f.page.locator('[data-testid="class-path-hero-card"]');
        await heroCard.waitFor({ state: 'visible' });

        // Title of nearest due date path is displayed
        assert.ok((await heroCard.innerText()).includes('Inizio anno'));

        // Link to all paths mentions count (2)
        const allPathsLink = heroCard.getByRole('link', { name: /Vedi tutti i percorsi di classe/i });
        await allPathsLink.waitFor({ state: 'visible' });
        assert.equal(await allPathsLink.getAttribute('href'), '/profilo/percorsi');
        assert.ok((await allPathsLink.innerText()).includes('(2)'));

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Self-marking on hero card calls API and updates step state', async () => {
    const f = await createFixture({ paths: [samplePath1], lang: 'it' });
    try {
        await f.page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });

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

test('Personal area (/profilo): hero card displayed first when path active, tools collapsible', async () => {
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
