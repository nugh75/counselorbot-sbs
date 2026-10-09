import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Class counselor enablement (#93): the student only meets allowed counselors and
// a disallowed one is replaced by the class default or by a new choice.
const origin = new URL(process.env.STUDENT_COUNSELORS_BASE_URL || 'http://127.0.0.1:3107').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const ALL = [
    { id: 1, name: 'Clio', slug: 'clio', language: ['*'], questionnaire_types: [], suitable: true, is_active: true },
    { id: 2, name: 'Giulio', slug: 'giulio', language: ['*'], questionnaire_types: [], suitable: true, is_active: true },
    { id: 5, name: 'Mine', slug: 'mine', language: ['*'], questionnaire_types: [], suitable: true, is_active: true, is_personal: true },
];

async function fixture({ access, prefs, selected = null }) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.addInitScript(({ selected }) => {
        localStorage.setItem('cb_lang', 'en');
        localStorage.setItem('cb_theme', 'light');
        if (selected != null && !sessionStorage.getItem('seeded')) {
            localStorage.setItem('counselorbot_selected_counselor', String(selected));
            sessionStorage.setItem('seeded', '1');
        }
    }, { selected });
    await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') {
            data = { authenticated: true, is_admin: false, username: 'student.fixture', name: 'Student', groups: ['studenti'] };
        } else if (url.pathname === '/api/user/access') {
            data = access;
        } else if (url.pathname === '/api/user/account-preferences') {
            data = prefs;
        } else if (url.pathname === '/api/orientation/status') {
            data = { required: false, completed: true };
        } else if (url.pathname === '/api/counselors') {
            // Mirrors the server: restricted students get only allowed counselors.
            data = access.counselor_ids ? ALL.filter((row) => access.counselor_ids.includes(row.id)) : ALL;
        } else if (url.pathname === '/api/counselors/categories') {
            data = [];
        } else if (url.pathname === '/api/session/frozen/frozen-sav') {
            data = { session_id: 'frozen-sav', questionnaire_type: 'SAVICKAS', current_phase: 'intro', messages: [], counselor_id: 2 };
        } else if (url.pathname === '/api/user/learner-profile') {
            data = { created_at: '2026-09-05T08:00:00Z', profile: {} };
        }
        return route.fulfill({ json: data });
    });
    return { context, page, errors };
}

const restricted = (default_counselor_id) => ({
    restricted: true, tool_keys: ['SAVICKAS'], counselor_ids: [1, 5], default_counselor_id, class_ids: [10],
});

test('A frozen session with a disallowed counselor resumes with the class default', async () => {
    const f = await fixture({
        access: restricted(1), selected: 2,
        prefs: { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true },
    });
    try {
        await f.page.goto(`${origin}/?frozen=frozen-sav`, { waitUntil: 'networkidle' });
        await f.page.getByRole('status').filter({ hasText: 'the conversation continues with an enabled counselor' }).waitFor();
        assert.equal(new URL(f.page.url()).pathname, '/');
        assert.equal(await f.page.evaluate(() => localStorage.getItem('counselorbot_selected_counselor')), '1');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('Without a class default the student picks among allowed counselors, then resumes', async () => {
    const prefs = { counselor_id: 2, counselor_ready: false, notebook_ready: true, setup_completed: true };
    const f = await fixture({ access: restricted(null), selected: 2, prefs });
    await f.page.route('**/api/user/account-preferences', async (route) => {
        if (route.request().method() === 'PUT') {
            const body = route.request().postDataJSON();
            Object.assign(prefs, { counselor_id: body.counselor_id, counselor_ready: true });
        }
        return route.fulfill({ json: prefs });
    });
    try {
        await f.page.goto(`${origin}/?frozen=frozen-sav`, { waitUntil: 'networkidle' });
        await f.page.waitForURL(/\/counselor\?next=/);
        assert.equal(new URL(f.page.url()).searchParams.get('next'), '/?frozen=frozen-sav');
        await f.page.getByText('Clio').first().waitFor();
        assert.equal(await f.page.getByText('Giulio').count(), 0, 'disallowed counselor is not offered');
        await f.page.getByText('Mine').first().waitFor();
        await f.page.getByRole('button', { name: /Clio/ }).first().click();
        await f.page.getByRole('button', { name: 'Continue', exact: true }).click();
        // Back on the frozen session with the newly chosen, allowed counselor.
        await f.page.waitForURL((url) => url.pathname === '/');
        await f.page.getByRole('status').filter({ hasText: 'the conversation continues with an enabled counselor' }).waitFor();
        assert.equal(prefs.counselor_id, 1);
        assert.equal(await f.page.evaluate(() => localStorage.getItem('counselorbot_selected_counselor')), '1');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('A student whose account counselor is disallowed meets the selector with allowed counselors only', async () => {
    const f = await fixture({
        access: restricted(null), selected: 2,
        prefs: { counselor_id: 2, counselor_ready: false, notebook_ready: true, setup_completed: true },
    });
    try {
        await f.page.goto(`${origin}/?view=questionnaires`, { waitUntil: 'networkidle' });
        await f.page.waitForURL(/\/counselor\?next=/);
        await f.page.getByText('Clio').first().waitFor();
        assert.equal(await f.page.getByText('Giulio').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
