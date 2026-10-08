// Explicit opt-in; real forum APIs, owned synthetic database, isolated dev ports
// (default C4 3137; FORUM_BASE_URL and FORUM_LIVE_ADMIN select another owned runner).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.FORUM_BASE_URL || 'http://127.0.0.1:3137').origin;
const admin = process.env.FORUM_LIVE_ADMIN || 'c4.synthetic.admin';
test('live discussion, student reply, read marker, departure and inactive archive', async () => {
    assert.equal(process.env.FORUM_LIVE, '1', 'Use only the documented C4 synthetic database and dev runners');
    const browser = await chromium.launch({ headless: true });
    const teacher = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const student = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const demo = { 'X-View-As': 'studente.demo' };
    let groupId;
    try {
        await teacher.addInitScript(() => localStorage.setItem('cb_lang', 'en'));
        await student.addInitScript(() => { localStorage.setItem('cb_lang', 'en'); sessionStorage.setItem('cb_view_as_user', 'studente.demo'); });
        const created = await teacher.request.post(`${origin}/api/admin/groups`, { data: { name: 'C4 synthetic forum', code: `GR-C4LIVE${Date.now()}` } });
        assert.equal(created.status(), 200);
        const group = await created.json(); groupId = group.id;
        assert.equal((await student.request.post(`${origin}/api/groups/join`, { headers: demo, data: { code: group.code } })).status(), 200);
        const teacherPage = await teacher.newPage();
        await teacherPage.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await teacherPage.goto(`${origin}/docente/classi/${groupId}`, { waitUntil: 'networkidle' });
        await teacherPage.getByRole('tab', { name: 'Forum', exact: true }).click();
        await teacherPage.getByRole('button', { name: 'New discussion', exact: true }).click();
        await teacherPage.getByLabel('Title', { exact: false }).fill('Live QSA discussion');
        await teacherPage.getByLabel('Text', { exact: false }).fill('**Welcome**, current members.');
        await teacherPage.getByRole('button', { name: 'Send', exact: true }).click();
        await teacherPage.getByRole('heading', { name: 'Live QSA discussion', exact: true }).waitFor();
        const listing = await (await teacher.request.get(`${origin}/api/groups/${groupId}/forum/topics`)).json();
        assert.equal(listing.topics.length, 1);
        const topicId = listing.topics[0].id;
        assert.equal(listing.topics[0].author_display_name, admin);
        const page = await student.newPage();
        const aiRequests = [];
        page.on('request', request => {
            if (request.method() === 'POST' && /\/api\/(chat|site-chat|orientation|opencode)/.test(new URL(request.url()).pathname)) aiRequests.push(request.url());
        });
        await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        // Only unrelated onboarding is bypassed. Forum and membership changes
        // use the actual backend and PostgreSQL database.
        await page.route('**/api/orientation/status', route => route.fulfill({ json: { required: false } }));
        await page.goto(`${origin}/profilo/classi/${groupId}/forum`, { waitUntil: 'networkidle' });
        assert.equal(await page.getByRole('button', { name: 'New discussion', exact: true }).count(), 0);
        await page.getByRole('button', { name: /Live QSA discussion/ }).click();
        await page.getByLabel('Reply', { exact: false }).fill('My live student reply');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await page.locator('article').getByText('My live student reply', { exact: true }).waitFor();
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /Live QSA discussion/ }).click();
        await page.locator('article').getByText('My live student reply', { exact: true }).waitFor();
        const detail = await (await student.request.get(`${origin}/api/forum/topics/${topicId}`, { headers: demo })).json();
        assert.equal(detail.posts[0].author_display_name, 'Alice Bianchi');
        assert.equal((await student.request.post(`${origin}/api/forum/topics/${topicId}/read`, { headers: demo })).status(), 200);
        await page.screenshot({ path: '../backend/.venv/forum-student-live.png', fullPage: true });
        const groups = await (await student.request.get(`${origin}/api/user/groups`, { headers: demo })).json();
        const membership = groups.find(row => row.group_id === groupId);
        assert.equal((await student.request.delete(`${origin}/api/user/groups/${membership.membership_id}`, { headers: demo })).status(), 200);
        assert.equal((await student.request.get(`${origin}/api/forum/topics/${topicId}`, { headers: demo })).status(), 403);
        assert.equal((await teacher.request.put(`${origin}/api/admin/groups/${groupId}`, { data: { is_active: false } })).status(), 200);
        await teacherPage.reload({ waitUntil: 'networkidle' });
        await teacherPage.getByRole('tab', { name: 'Forum', exact: true }).click();
        await teacherPage.getByText('Archive — read only', { exact: true }).waitFor();
        assert.equal(await teacherPage.getByRole('button', { name: 'New discussion', exact: true }).count(), 0);
        assert.equal((await teacher.request.post(`${origin}/api/forum/topics/${topicId}/posts`, { data: { body: 'Archive write' } })).status(), 403);
        assert.deepEqual(aiRequests, []);
    } finally {
        try { if (groupId) assert.equal((await teacher.request.delete(`${origin}/api/admin/groups/${groupId}`)).status(), 200); }
        finally { await student.close(); await teacher.close(); await browser.close(); }
    }
});

test('live moderation: hide/restore, author edit/delete, lock, pin and log', async () => {
    assert.equal(process.env.FORUM_LIVE, '1', 'Use only the documented synthetic database and dev runners');
    const browser = await chromium.launch({ headless: true });
    const teacher = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const student = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const demo = { 'X-View-As': 'studente.demo' };
    let groupId;
    try {
        await teacher.addInitScript(() => localStorage.setItem('cb_lang', 'en'));
        await student.addInitScript(() => { localStorage.setItem('cb_lang', 'en'); sessionStorage.setItem('cb_view_as_user', 'studente.demo'); });
        const created = await teacher.request.post(`${origin}/api/admin/groups`, { data: { name: 'C5 synthetic moderation', code: `GR-C5LIVE${Date.now()}` } });
        assert.equal(created.status(), 200);
        const group = await created.json(); groupId = group.id;
        assert.equal((await student.request.post(`${origin}/api/groups/join`, { headers: demo, data: { code: group.code } })).status(), 200);
        const topic = await (await teacher.request.post(`${origin}/api/groups/${groupId}/forum/topics`, { data: { title: 'Live moderation', body: 'Start' } })).json();
        const post = async body => (await student.request.post(`${origin}/api/forum/topics/${topic.id}/posts`, { headers: demo, data: { body } })).json();
        const rude = await post('LIVE_RUDE_SENTINEL');
        await post('My live typo');

        const page = await student.newPage();
        const aiRequests = [];
        page.on('request', request => {
            if (request.method() === 'POST' && /\/api\/(chat|site-chat|orientation|opencode)/.test(new URL(request.url()).pathname)) aiRequests.push(request.url());
        });
        await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await page.route('**/api/orientation/status', route => route.fulfill({ json: { required: false } }));

        const teacherPage = await teacher.newPage();
        await teacherPage.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await teacherPage.goto(`${origin}/docente/classi/${groupId}`, { waitUntil: 'networkidle' });
        await teacherPage.getByRole('tab', { name: 'Forum', exact: true }).click();
        await teacherPage.getByRole('button', { name: /Live moderation/ }).click();
        const rudeArticle = teacherPage.locator('article').filter({ hasText: 'LIVE_RUDE_SENTINEL' });
        await rudeArticle.getByRole('button', { name: 'Hide…', exact: true }).click();
        await rudeArticle.getByLabel('Reason', { exact: false }).fill('off topic');
        await rudeArticle.getByRole('button', { name: 'Hide', exact: true }).click();
        await rudeArticle.getByText('Hidden: “off topic”', { exact: true }).waitFor();
        await teacherPage.getByRole('button', { name: 'Pin', exact: true }).click();
        await teacherPage.getByRole('button', { name: 'Unpin', exact: true }).waitFor();

        await page.goto(`${origin}/profilo/classi/${groupId}/forum`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /Live moderation/ }).click();
        await page.getByText('Message hidden by the teacher', { exact: true }).waitFor();
        assert.equal(await page.getByText(/LIVE_RUDE_SENTINEL|off topic/).count(), 0);
        // Topic, hidden reply, own reply: the textarea replaces the text while editing.
        const mine = page.locator('article').nth(2);
        await mine.getByText('My live typo', { exact: true }).waitFor();
        await mine.getByRole('button', { name: 'Edit', exact: true }).click();
        await mine.getByLabel('Edit', { exact: false }).fill('My live fixed reply');
        await mine.getByRole('button', { name: 'Save', exact: true }).click();
        await mine.getByText('My live fixed reply', { exact: true }).waitFor();
        await mine.getByText('edited', { exact: true }).waitFor();
        page.once('dialog', dialog => dialog.accept());
        await mine.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.getByText('Message deleted', { exact: true }).waitFor();
        await page.screenshot({ path: '../backend/.venv/forum-moderation-student-live.png', fullPage: true });

        await teacherPage.getByRole('button', { name: 'Close discussion', exact: true }).click();
        await teacherPage.getByText('This discussion is closed.', { exact: true }).waitFor();
        await rudeArticle.getByRole('button', { name: 'Restore', exact: true }).click();
        await teacherPage.getByRole('button', { name: 'Discussions', exact: true }).click();
        await teacherPage.getByRole('button', { name: 'Moderation log', exact: true }).click();
        await teacherPage.getByText(`${admin} hid message #${rude.id}`, { exact: true }).waitFor();
        await teacherPage.screenshot({ path: '../backend/.venv/forum-moderation-teacher-live.png', fullPage: true });

        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /Live moderation/ }).click();
        await page.getByText('This discussion is closed.', { exact: true }).waitFor();
        await page.getByText('LIVE_RUDE_SENTINEL', { exact: true }).waitFor();
        assert.equal((await student.request.get(`${origin}/api/teacher/groups/${groupId}/forum/log`, { headers: demo })).status(), 403);
        const log = await (await teacher.request.get(`${origin}/api/teacher/groups/${groupId}/forum/log`)).json();
        assert.deepEqual(log.entries.map(entry => entry.action), ['restore', 'lock', 'pin', 'hide']);
        assert.equal(JSON.stringify(log).includes('LIVE_RUDE_SENTINEL'), false);
        assert.deepEqual(aiRequests, []);
    } finally {
        try { if (groupId) assert.equal((await teacher.request.delete(`${origin}/api/admin/groups/${groupId}`)).status(), 200); }
        finally { await student.close(); await teacher.close(); await browser.close(); }
    }
});
