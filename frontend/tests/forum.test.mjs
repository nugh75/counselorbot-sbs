import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.FORUM_BASE_URL || 'http://127.0.0.1:3137').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const topic = { id: 102, group_id: 102, title: 'Read your QSA', body: '**Welcome**', author_display_name: 'Teacher Snapshot',
    created_at: '2026-10-08T10:00:00Z', edited_at: null, hidden: false, deleted: false, hidden_reason: null, own: false,
    pinned: false, locked: false, last_post_at: '2026-10-08T10:00:00Z', replies_count: 0 };

async function fixture({ teacher = false, archive = false, lang = 'en', width = 390, failure = null } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.addInitScript(lang => localStorage.setItem('cb_lang', lang), lang);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const state = { topics: [structuredClone(topic)], posts: [], writes: [], failure, held: null, readFailure: null, errors: [],
        actions: [], actionFailure: null, log: [] };
    // Students never receive hidden text or reasons, mirroring the API.
    const view = row => teacher || !row.hidden ? row : { ...row, body: null, title: row.title === undefined ? undefined : null, hidden_reason: null };
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
        else if (url.pathname.endsWith('/forum/log')) data = { entries: state.log, has_more: false };
        else if (url.pathname.startsWith('/api/teacher/forum/') || url.pathname.startsWith('/api/forum/posts/')) {
            const body = request.postData() ? request.postDataJSON() : null;
            state.actions.push([request.method(), url.pathname, body]);
            if (state.actionFailure) return route.fulfill({ status: state.actionFailure, json: { detail: 'PRIVATE DEBUG MESSAGE' } });
            const [, kind, id, action] = url.pathname.match(/\/(topics|posts)\/(\d+)\/?(\w*)$/);
            const target = (kind === 'topics' ? state.topics : state.posts).find(row => row.id === Number(id));
            if (request.method() === 'PATCH') Object.assign(target, { body: body.body, edited_at: '2026-10-09T10:00:00Z' });
            else if (request.method() === 'DELETE') Object.assign(target, { body: null, deleted: true });
            else {
                Object.assign(target, { hide: { hidden: true, hidden_reason: body?.reason }, restore: { hidden: false, hidden_reason: null },
                    lock: { locked: true }, unlock: { locked: false }, pin: { pinned: true }, unpin: { pinned: false } }[action]);
                state.log.unshift({ id: state.log.length + 1, actor_username: 'fixture', action, target_kind: kind.slice(0, -1),
                    target_id: Number(id), reason: body?.reason ?? null, created_at: '2026-10-09T10:00:00Z' });
            }
            return route.fulfill({ json: target });
        }
        else if (url.pathname.includes('/forum/')) {
            if (request.method() === 'POST') {
                state.writes.push(request.postDataJSON());
                if (state.held) await state.held;
                if (state.failure) return route.fulfill({ status: state.failure, json: { detail: 'PRIVATE DEBUG MESSAGE' } });
                if (url.pathname.endsWith('/topics')) {
                    data = { ...topic, ...request.postDataJSON(), id: 103 }; state.topics.push(data);
                } else {
                    data = { ...topic, ...request.postDataJSON(), id: state.posts.length + 1, author_display_name: 'Student Snapshot', own: true }; state.posts.push(data);
                }
                return route.fulfill({ status: 201, json: data });
            }
            if (state.readFailure) return route.fulfill({ status: state.readFailure, json: {} });
            if (url.pathname.includes('/groups/')) data = { group: { id: 102, name: 'Synthetic class', is_active: !archive }, can_open_topic: teacher && !archive,
                can_moderate: teacher, topics: state.topics.map(view), has_more: false };
            else {
                const current = state.topics.at(-1);
                data = { topic: view({ ...current, replies_count: state.posts.length }), posts: state.posts.map(view),
                    can_reply: !archive && !current.locked && !current.hidden, can_moderate: teacher, has_more: false };
            }
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

const seeded = (state, rows) => { for (const row of rows) state.posts.push({ ...topic, title: undefined, own: false, ...row }); };

test('teacher hides and restores a reply with a reason, pins and closes, then reads the log', async () => {
    const f = await fixture({ teacher: true });
    try {
        seeded(f.state, [{ id: 1, body: 'Off topic reply', author_display_name: 'Marco P.' }]);
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        const reply = f.page.locator('article').filter({ hasText: 'Marco P.' });
        await reply.getByRole('button', { name: 'Hide…', exact: true }).click();
        assert.equal(await reply.getByRole('button', { name: 'Hide', exact: true }).isDisabled(), true);
        await reply.getByLabel('Reason', { exact: false }).fill('off topic');
        await reply.getByRole('button', { name: 'Hide', exact: true }).click();
        await reply.getByText('Hidden: “off topic”', { exact: true }).waitFor();
        await reply.getByText('Off topic reply', { exact: true }).waitFor();
        await reply.getByRole('button', { name: 'Restore', exact: true }).click();
        await reply.getByRole('button', { name: 'Hide…', exact: true }).waitFor();
        await f.page.getByRole('button', { name: 'Pin', exact: true }).click();
        await f.page.getByRole('button', { name: 'Unpin', exact: true }).waitFor();
        await f.page.getByRole('button', { name: 'Close discussion', exact: true }).click();
        await f.page.getByText('This discussion is closed.', { exact: true }).waitFor();
        assert.deepEqual(f.state.actions.map(([method, path, body]) => [method, path.replace('/api/teacher/forum/', ''), body?.reason]), [
            ['POST', 'posts/1/hide', 'off topic'], ['POST', 'posts/1/restore', undefined],
            ['POST', 'topics/102/pin', undefined], ['POST', 'topics/102/lock', undefined]]);
        assert.equal(await f.page.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
        await f.page.getByRole('button', { name: 'Discussions', exact: true }).click();
        await f.page.getByRole('button', { name: 'Moderation log', exact: true }).click();
        await f.page.getByText('fixture closed discussion #102', { exact: true }).waitFor();
        await f.page.getByText('“off topic”', { exact: true }).waitFor();
        await f.page.getByText(/never contains message text/).waitFor();
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('student sees placeholders, edits and deletes only own replies', async () => {
    const f = await fixture();
    try {
        seeded(f.state, [
            { id: 1, body: 'Hidden text', author_display_name: 'Marco P.', hidden: true, hidden_reason: 'off topic' },
            { id: 2, body: 'My typo', author_display_name: 'Anna B.', own: true },
            { id: 3, body: 'Classmate reply', author_display_name: 'Luca R.' },
        ]);
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        await f.page.getByText('Message hidden by the teacher', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('Hidden text').count(), 0);
        assert.equal(await f.page.getByText(/off topic/).count(), 0);
        assert.equal(await f.page.getByRole('button', { name: /Hide|Restore|Pin|Close discussion|Moderation log/ }).count(), 0);
        assert.equal(await f.page.getByRole('button', { name: 'Edit', exact: true }).count(), 1);
        const mine = f.page.locator('article').filter({ hasText: 'Anna B.' });
        await mine.getByRole('button', { name: 'Edit', exact: true }).click();
        await mine.getByLabel('Edit', { exact: false }).fill('My fixed reply');
        await mine.getByRole('button', { name: 'Save', exact: true }).click();
        await mine.getByText('My fixed reply', { exact: true }).waitFor();
        await mine.getByText('edited', { exact: true }).waitFor();
        f.page.once('dialog', dialog => dialog.dismiss());
        await mine.getByRole('button', { name: 'Delete', exact: true }).click();
        assert.equal(f.state.actions.filter(([method]) => method === 'DELETE').length, 0);
        f.page.once('dialog', dialog => dialog.accept());
        await mine.getByRole('button', { name: 'Delete', exact: true }).click();
        await mine.getByText('Message deleted', { exact: true }).waitFor();
        assert.equal(await mine.getByRole('button').count(), 0);
        assert.deepEqual(f.state.actions.map(([method, path, body]) => [method, path, body]), [
            ['PATCH', '/api/forum/posts/2', { body: 'My fixed reply' }], ['DELETE', '/api/forum/posts/2', null]]);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('a hidden topic in an active class explains the hiding, not an archive', async () => {
    const f = await fixture();
    try {
        Object.assign(f.state.topics[0], { hidden: true, hidden_reason: 'duplicate' });
        await f.page.reload({ waitUntil: 'networkidle' });
        await f.page.getByRole('button', { name: /Message hidden by the teacher/ }).click();
        await f.page.getByText('This discussion was hidden by the teacher.', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('Archive — read only', { exact: true }).count(), 0);
        assert.equal(await f.page.getByText(/Read your QSA|duplicate/).count(), 0);
        assert.equal(await f.page.locator('textarea').count(), 0);
    } finally { await f.context.close(); }
});

test('a rejected moderation action reports the failure and leaves no private detail', async () => {
    const f = await fixture({ teacher: true });
    try {
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        f.state.actionFailure = 409;
        await f.page.getByRole('button', { name: 'Close discussion', exact: true }).click();
        await f.page.getByText('The action failed. The discussion was reloaded.', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('PRIVATE DEBUG MESSAGE').count(), 0);
        assert.equal(await f.page.getByRole('button', { name: 'Close discussion', exact: true }).isEnabled(), true);
    } finally { await f.context.close(); }
});

test('archived class keeps the log readable and hides every moderation control', async () => {
    const f = await fixture({ teacher: true, archive: true });
    try {
        seeded(f.state, [{ id: 1, body: 'Old reply', author_display_name: 'Marco P.', own: true }]);
        await f.page.getByRole('button', { name: /Read your QSA/ }).click();
        await f.page.getByText('Old reply', { exact: true }).waitFor();
        assert.equal(await f.page.getByRole('button', { name: /Hide|Pin|Close discussion|Edit|Delete/ }).count(), 0);
        await f.page.getByRole('button', { name: 'Discussions', exact: true }).click();
        await f.page.getByRole('button', { name: 'Moderation log', exact: true }).click();
        await f.page.getByText('No moderation actions yet.', { exact: true }).waitFor();
    } finally { await f.context.close(); }
});

for (const lang of ['de', 'fr']) {
    test(`moderation controls fit 320px in ${lang}`, async () => {
        const f = await fixture({ teacher: true, lang, width: 320 });
        try {
            seeded(f.state, [{ id: 1, body: 'Reply', author_display_name: 'Marco P.', own: true, hidden: true, hidden_reason: 'A long moderation reason' }]);
            await f.page.getByRole('button', { name: /Read your QSA/ }).click();
            await f.page.locator('article').nth(1).getByRole('button').first().waitFor();
            assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}
