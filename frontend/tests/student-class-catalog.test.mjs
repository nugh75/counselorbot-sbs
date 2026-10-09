import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.STUDENT_CATALOG_BASE_URL || 'http://127.0.0.1:3107').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({
    access = { restricted: true, tool_keys: ['SAVICKAS'], counselor_ids: null, default_counselor_id: null, class_ids: [10] },
    frozen = [],
    lang = 'it',
    width = 1280,
} = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.addInitScript(({ lang }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', 'light');
    }, { lang });

    await page.route('**/*', (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();

        let data = [];
        if (url.pathname === '/api/auth/me') {
            data = { authenticated: true, is_admin: false, username: 'student.fixture', name: 'Mario Rossi', groups: ['studenti'] };
        } else if (url.pathname === '/api/user/access') {
            data = access;
        } else if (url.pathname === '/api/user/account-preferences') {
            data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        } else if (url.pathname === '/api/orientation/status') {
            data = { required: false, completed: true };
        } else if (url.pathname === '/api/counselors') {
            data = [{ id: 1, name: 'Clio', slug: 'clio', language: ['it'], questionnaire_types: ['QSA', 'SAVICKAS'], suitable: true, is_active: true }];
        } else if (url.pathname === '/api/admin/instruments') {
            data = [];
        } else if (url.pathname === '/api/session/frozen') {
            data = frozen;
        } else if (url.pathname === '/api/session/frozen/frozen-qsa') {
            if (access.restricted && !access.tool_keys.includes('QSA')) {
                return route.fulfill({ status: 403, json: { detail: 'tool_disabled_for_class', tool: 'QSA' } });
            }
            data = { session_id: 'frozen-qsa', questionnaire_type: 'QSA', current_phase: 'intro', messages: [] };
        } else if (url.pathname === '/api/session/frozen/frozen-savickas') {
            data = { session_id: 'frozen-savickas', questionnaire_type: 'SAVICKAS', current_phase: 'intro', messages: [] };
        } else if (url.pathname === '/api/user/learner-profile') {
            data = { created_at: '2026-09-05T08:00:00Z', profile: {} };
        }
        return route.fulfill({ json: data });
    });

    return { context, page, errors };
}

test('Restricted student sees only class-enabled tools and no disabled cards', async () => {
    const f = await fixture({
        access: { restricted: true, tool_keys: ['SAVICKAS'], counselor_ids: null, default_counselor_id: null, class_ids: [10] },
    });
    try {
        await f.page.goto(`${origin}/?view=questionnaires`, { waitUntil: 'networkidle' });

        // SAVICKAS is allowed and visible
        const savickasCard = f.page.getByRole('button', { name: /Savickas/i });
        await savickasCard.waitFor({ state: 'visible' });

        // QSA is disabled and NOT rendered
        const qsaCard = f.page.getByRole('button', { name: /QSA/i });
        assert.equal(await qsaCard.count(), 0);

        // IDEA is disabled and NOT rendered
        const ideaCard = f.page.getByRole('button', { name: /IDEA/i });
        assert.equal(await ideaCard.count(), 0);

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Direct navigation to /strumenti/<disabled_id> shows not-enabled-for-class state', async () => {
    const f = await fixture({
        access: { restricted: true, tool_keys: ['SAVICKAS'], counselor_ids: null, default_counselor_id: null, class_ids: [10] },
    });
    try {
        await f.page.goto(`${origin}/strumenti/QSA`, { waitUntil: 'networkidle' });

        const heading = f.page.getByRole('heading', { name: 'Strumento non abilitato per la tua classe' });
        await heading.waitFor({ state: 'visible' });

        const body = f.page.getByText(/La tua classe non ha abilitato questo strumento/);
        assert.ok(await body.isVisible());

        // Back button returns to questionnaire selection
        const backBtn = f.page.getByRole('button', { name: 'Indietro' });
        await backBtn.click();
        await f.page.waitForURL(/view=questionnaires/);

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Deep link with disabled tool (?start=QSA) shows warning toast and falls back to catalog', async () => {
    const f = await fixture({
        access: { restricted: true, tool_keys: ['SAVICKAS'], counselor_ids: null, default_counselor_id: null, class_ids: [10] },
    });
    try {
        await f.page.goto(`${origin}/?start=QSA`, { waitUntil: 'networkidle' });

        // Warning toast is displayed
        const toast = f.page.getByRole('status').filter({ hasText: 'Questo strumento non è abilitato per la tua classe.' });
        await toast.waitFor({ state: 'visible' });

        // Chat interface is NOT loaded, falls back to catalog selector
        const savickasCard = f.page.getByRole('button', { name: /Savickas/i });
        await savickasCard.waitFor({ state: 'visible' });

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Deep link with disabled tool via ?q=QSA also shows warning toast and falls back', async () => {
    const f = await fixture({
        access: { restricted: true, tool_keys: ['SAVICKAS'], counselor_ids: null, default_counselor_id: null, class_ids: [10] },
    });
    try {
        await f.page.goto(`${origin}/?q=QSA`, { waitUntil: 'networkidle' });

        const toast = f.page.getByRole('status').filter({ hasText: 'Questo strumento non è abilitato per la tua classe.' });
        await toast.waitFor({ state: 'visible' });

        const savickasCard = f.page.getByRole('button', { name: /Savickas/i });
        await savickasCard.waitFor({ state: 'visible' });

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Frozen sessions of disabled tools are hidden from Resume and direct resume warns', async () => {
    const f = await fixture({
        access: { restricted: true, tool_keys: ['SAVICKAS'], counselor_ids: null, default_counselor_id: null, class_ids: [10] },
        frozen: [
            { session_id: 'frozen-qsa', questionnaire_type: 'QSA', instrument: 'QSA', updated_at: '2026-10-08T12:00:00Z', label: 'QSA · Session' },
            { session_id: 'frozen-savickas', questionnaire_type: 'SAVICKAS', instrument: 'SAVICKAS', updated_at: '2026-10-08T12:00:00Z', label: 'Savickas · Session' },
        ],
    });
    try {
        // Open catalog view and verify Resume menu only lists Savickas (QSA hidden)
        await f.page.goto(`${origin}/?view=questionnaires`, { waitUntil: 'networkidle' });
        const resumeBtn = f.page.getByRole('button', { name: 'Riprendi' });
        await resumeBtn.waitFor({ state: 'visible' });
        await resumeBtn.click();

        const menu = f.page.getByRole('menu');
        await menu.waitFor({ state: 'visible' });
        assert.ok(await menu.getByText(/Savickas/i).isVisible());
        assert.equal(await menu.getByText(/QSA/i).count(), 0);

        // Direct resume attempt to disabled frozen session
        await f.page.goto(`${origin}/?frozen=frozen-qsa`, { waitUntil: 'networkidle' });

        // Expect warning toast
        const toast = f.page.getByRole('status').filter({ hasText: 'Questo strumento non è abilitato per la tua classe.' });
        await toast.waitFor({ state: 'visible' });

        // Stays on catalog view
        const savickasCard = f.page.getByRole('button', { name: /Savickas/i });
        await savickasCard.waitFor({ state: 'visible' });

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});

test('Unrestricted student sees full catalog and can access /strumenti/QSA', async () => {
    const f = await fixture({
        access: { restricted: false, tool_keys: [], counselor_ids: null, default_counselor_id: null, class_ids: [] },
    });
    try {
        await f.page.goto(`${origin}/?view=questionnaires`, { waitUntil: 'networkidle' });

        // Both QSA and SAVICKAS are visible
        const qsaCard = f.page.getByRole('button', { name: /^QSA\s/ });
        await qsaCard.waitFor({ state: 'visible' });

        const savickasCard = f.page.getByRole('button', { name: /Savickas/i });
        await savickasCard.waitFor({ state: 'visible' });

        // Directly opening /strumenti/QSA shows normal detail page
        await f.page.goto(`${origin}/strumenti/QSA`, { waitUntil: 'networkidle' });
        const disabledHeading = f.page.getByRole('heading', { name: 'Strumento non abilitato per la tua classe' });
        assert.equal(await disabledHeading.count(), 0);

        const startBtn = f.page.getByRole('link', { name: /Avvia/i });
        await startBtn.waitFor({ state: 'visible' });

        assert.deepEqual(f.errors, []);
    } finally {
        await f.context.close();
    }
});
