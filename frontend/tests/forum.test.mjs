import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:3137';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const topic = { id: 102, group_id: 102, title: 'Read your QSA', body: '**Welcome**', author_display_name: 'Teacher Snapshot',
    created_at: '2026-10-08T10:00:00Z', edited_at: null, hidden: false, deleted: false,
    pinned: false, locked: false, last_post_at: '2026-10-08T10:00:00Z', replies_count: 0 };

async function fixture({ teacher = false, archive = false, lang = 'en', width = 390, failure = null } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.addInitScript(lang => localStorage.setItem('cb_lang', lang), lang);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const state = { topics: [structuredClone(topic)], posts: [], writes: [], failure, held: null, readFailure: null, errors: [] };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'fixture', name: 'Fixture', groups: [teacher ? 'docenti' : 'studenti'], is_admin: false };
        else if (url.pathname === '/api/admin/groups') data = [{ id: 102, name: 'Synthetic class', code: 'GR-C4TEST', owner_username: 'fixture', is_active: !archive, members_count: 1 }];
        else if (url.pathname.endsWith('/settings')) data = { group_id: 102, revision: 1, disabled_tool_keys: [], disabled_counselor_ids: [], default_counselor_id: null, tools: [], counselors: [], forum: { students_can_open: false, premoderation: false } };
        else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false };
        else if (url.pathname.includes('/forum/')) {
            if (request.method() === 'POST') {
                state.writes.push(request.postDataJSON());
                if (state.held) await state.held;
                if (state.failure) return route.fulfill({ status: state.failure, json: { detail: 'PRIVATE DEBUG MESSAGE' } });
                if (url.pathname.endsWith('/topics')) {
                    data = { ...topic, ...request.postDataJSON(), id: 103 }; state.topics.push(data);
                } else {
                    data = { ...topic, ...request.postDataJSON(), id: state.posts.length + 1, author_display_name: 'Student Snapshot' }; state.posts.push(data);
                }
                return route.fulfill({ status: 201, json: data });
            }
            if (state.readFailure) return route.fulfill({ status: state.readFailure, json: {} });
            if (url.pathname.includes('/groups/')) data = { group: { id: 102, name: 'Synthetic class', is_active: !archive }, can_open_topic: teacher && !archive, topics: state.topics, has_more: false };
            else data = { topic: { ...state.topics.at(-1), replies_count: state.posts.length }, posts: state.posts, can_reply: !archive, has_more: false };
        }
        return route.fulfill({ json: data });
    });
    await page.goto(`${origin}/${teacher ? 'docente/classi/102' : 'profilo/classi/102/forum'}`, { waitUntil: 'networkidle' });
    if (teacher) await page.getByRole('tab', { name: 'Forum', exact: true }).click();
    return { context, page, state };
}

test('teacher forum tab opens a discussion and preserves a failed-send draft', async () => {
    const f = await fixture({ teacher: true });
    try {
        await f.page.getByRole('button', { name: 'New discussion', exact: true }).click();
        await f.page.getByLabel('Title', { exact: false }).fill('New class discussion');
        await f.page.getByLabel('Text', { exact: false }).fill('Teacher body');
        assert.deepEqual(f.state.writes, []);
        f.state.failure = 500;
        await f.page.getByRole('button', { name: 'Send', exact: true }).click();
        await f.page.getByText('Could not send. Your draft is preserved.', { exact: true }).waitFor();
        assert.equal(await f.page.getByLabel('Text', { exact: false }).inputValue(), 'Teacher body');
        f.state.failure = null;
        await f.page.getByRole('button', { name: 'Send', exact: true }).click();
        await f.page.getByRole('heading', { name: 'New class discussion', exact: true }).waitFor();
        assert.equal(await f.page.getByLabel('Reply', { exact: false }).inputValue(), '');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('member replies explicitly, observes rate limits and cannot open discussions', async () => {
    const f = await fixture();
    try {
        assert.equal(await f.page.getByRole('button', { name: 'New discussion', exact: true }).count(), 0);
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        const reply = f.page.getByLabel('Reply', { exact: false });
        await reply.fill('My member reply');
        f.state.failure = 429;
        await f.page.getByRole('button', { name: 'Send', exact: true }).click();
        await f.page.getByText(/Posting limit reached/).waitFor();
        assert.equal(await reply.inputValue(), 'My member reply');
        assert.equal(await f.page.getByText('PRIVATE DEBUG MESSAGE').count(), 0);
        f.state.failure = null;
        await f.page.getByRole('button', { name: 'Send', exact: true }).click();
        await f.page.locator('article').getByText('My member reply', { exact: true }).waitFor();
        assert.equal(await reply.inputValue(), '');
    } finally { await f.context.close(); }
});

test('safe reduced Markdown makes no image requests and strips raw HTML and unsafe links', async () => {
    const f = await fixture();
    try {
        f.state.topics[0].body = '**Bold** ![remote image](https://evil.invalid/track.png) <img src="https://evil.invalid/raw.png"> [safe](https://example.org) [unsafe](javascript:alert%281%29)';
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        const article = f.page.locator('article').first();
        await article.getByText('Bold', { exact: true }).waitFor();
        assert.equal(await article.locator('img, script').count(), 0);
        assert.equal(await article.locator('a[href^="javascript:"]').count(), 0);
        assert.match(await article.getByRole('link', { name: 'safe', exact: true }).getAttribute('rel'), /nofollow noopener/);
    } finally { await f.context.close(); }
});

test('inactive class displays a read-only archive and no composer', async () => {
    const f = await fixture({ archive: true });
    try {
        await f.page.getByText('Archive — read only', { exact: true }).waitFor();
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        await f.page.getByRole('heading', { name: 'Read your QSA', exact: true }).waitFor();
        assert.equal(await f.page.locator('textarea').count(), 0);
        assert.equal(await f.page.getByRole('button', { name: 'Send', exact: true }).count(), 0);
    } finally { await f.context.close(); }
});

test('read failure retries locally; revoked membership hides discussion content', async () => {
    const f = await fixture();
    try {
        f.state.readFailure = 500;
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        await f.page.getByText('Could not load the forum.', { exact: true }).waitFor();
        f.state.readFailure = 403;
        await f.page.getByRole('button', { name: 'Retry', exact: true }).click();
        await f.page.getByText('You do not have access to this forum.', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('Welcome', { exact: true }).count(), 0);
    } finally { await f.context.close(); }
});

for (const [lang, replyLabel] of [['it', 'Risposta'], ['en', 'Reply'], ['es', 'Respuesta'], ['fr', 'Réponse'], ['de', 'Antwort'], ['sv', 'Svar']]) {
    test(`forum composer is localized and fits 320px in ${lang}`, async () => {
        const f = await fixture({ lang, width: 320 });
        try {
            await f.page.getByRole('button', { name: /Read your QSA/ }).click();
            await f.page.getByLabel(replyLabel, { exact: false }).waitFor();
            assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}

test('pending sends cannot submit twice and cancellation preserves a declined draft', async () => {
    const f = await fixture({ teacher: true });
    let release;
    try {
        await f.page.getByRole('button', { name: 'New discussion', exact: true }).click();
        await f.page.getByLabel('Title', { exact: false }).fill('Pending discussion');
        await f.page.getByLabel('Text', { exact: false }).fill('Pending body');
        f.page.once('dialog', dialog => dialog.dismiss());
        await f.page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(await f.page.getByLabel('Text', { exact: false }).inputValue(), 'Pending body');
        f.state.held = new Promise(resolve => { release = resolve; });
        await f.page.getByRole('button', { name: 'Send', exact: true }).click();
        await f.page.getByRole('button', { name: 'Sending', exact: true }).waitFor();
        await f.page.locator('form').evaluate(form => form.requestSubmit());
        assert.equal(f.state.writes.length, 1);
        assert.equal(await f.page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true);
        release();
        await f.page.getByRole('heading', { name: 'Pending discussion', exact: true }).waitFor();
    } finally { release?.(); await f.context.close(); }
});

test('late response after an account change exposes no old discussion content', async () => {
    const f = await fixture({ teacher: true });
    let release;
    try {
        await f.page.getByRole('button', { name: 'New discussion', exact: true }).click();
        await f.page.getByLabel('Title', { exact: false }).fill('Old account title');
        await f.page.getByLabel('Text', { exact: false }).fill('Old account content');
        f.state.held = new Promise(resolve => { release = resolve; });
        await f.page.getByRole('button', { name: 'Send', exact: true }).click();
        await f.page.getByRole('button', { name: 'Sending', exact: true }).waitFor();
        await f.page.evaluate(() => sessionStorage.setItem('cb_view_as_user', 'studente.demo'));
        release();
        await f.page.getByText('You do not have access to this forum.', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('Old account content', { exact: true }).count(), 0);
        assert.equal(await f.page.locator('textarea').count(), 0);
    } finally { release?.(); await f.context.close(); }
});
