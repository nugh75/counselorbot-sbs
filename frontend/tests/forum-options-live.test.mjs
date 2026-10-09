// Real API/browser verification on the owned F3 synthetic PostgreSQL database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.FORUM_BASE_URL || 'http://127.0.0.1:3169').origin;

test('live F3 options, pending privacy, approve/reject, timed mute and forum disable', async () => {
    assert.equal(process.env.FORUM_LIVE, '1', 'Use only the documented F3 synthetic database and dev runners');
    const browser = await chromium.launch({ headless: true });
    const teacher = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const student = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const member = { 'X-View-As': 'studente.demo' };
    const peer = { 'X-View-As': 'studente.demo2' };
    let groupId;
    try {
        await teacher.addInitScript(() => localStorage.setItem('cb_lang', 'en'));
        await student.addInitScript(() => { localStorage.setItem('cb_lang', 'en'); sessionStorage.setItem('cb_view_as_user', 'studente.demo'); });
        const response = await teacher.request.post(`${origin}/api/admin/groups`, { data: { name: 'F3 synthetic class', code: `GR-F3${Date.now()}` } });
        assert.equal(response.status(), 200);
        const group = await response.json(); groupId = group.id;
        for (const headers of [member, peer]) {
            assert.equal((await teacher.request.post(`${origin}/api/groups/join`, { headers, data: { code: group.code } })).status(), 200);
        }
        const page = await teacher.newPage(); const pupil = await student.newPage();
        const errors = []; const aiRequests = [];
        for (const tab of [page, pupil]) {
            tab.on('pageerror', error => errors.push(error.message));
            tab.on('request', request => { if (request.method() === 'POST' && /\/api\/(chat|site-chat|orientation|opencode)/.test(new URL(request.url()).pathname)) aiRequests.push(request.url()); });
            await tab.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
            await tab.route('**/api/orientation/status', route => route.fulfill({ json: { required: false } }));
        }
        await page.goto(`${origin}/docente/classi/${groupId}`, { waitUntil: 'networkidle' });
        await page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Students can open discussions', exact: true }).check();
        await page.getByRole('checkbox', { name: 'Approve messages before they are visible', exact: true }).check();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByText('Settings saved', { exact: true }).waitFor();
        const settings = await (await teacher.request.get(`${origin}/api/teacher/groups/${groupId}/settings`)).json();
        assert.equal(settings.forum.students_can_open, true);
        assert.equal(settings.forum.premoderation, true);
        await page.getByRole('tab', { name: 'Forum', exact: true }).click();
        await page.getByRole('button', { name: 'New discussion', exact: true }).click();
        await page.getByLabel('Title', { exact: false }).fill('F3 discussion');
        await page.getByLabel('Text', { exact: false }).fill('Welcome');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await page.getByRole('heading', { name: 'F3 discussion', exact: true }).waitFor();
        const topics = await (await teacher.request.get(`${origin}/api/groups/${groupId}/forum/topics`)).json();
        const topicId = topics.topics[0].id;
        await pupil.goto(`${origin}/profilo/classi/${groupId}/forum`, { waitUntil: 'networkidle' });
        assert.equal(await pupil.getByRole('button', { name: 'New discussion', exact: true }).count(), 1);
        await pupil.getByRole('button', { name: /F3 discussion/ }).click();
        await pupil.getByLabel('Reply', { exact: false }).fill('F3 private pending');
        await pupil.getByRole('button', { name: 'Send', exact: true }).click();
        await pupil.locator('article').getByText('F3 private pending', { exact: true }).waitFor();
        await pupil.getByText('Your message will be visible after approval.', { exact: true }).waitFor();
        const other = await (await teacher.request.get(`${origin}/api/forum/topics/${topicId}`, { headers: peer })).json();
        assert.deepEqual(other.posts, []);
        await page.getByRole('button', { name: 'Discussions', exact: true }).click();
        await page.getByRole('button', { name: 'Pending (1)', exact: true }).click();
        await page.getByText('F3 private pending', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Approve', exact: true }).click();
        await page.getByText('Pending (0)', { exact: true }).waitFor();
        const visible = await (await teacher.request.get(`${origin}/api/forum/topics/${topicId}`, { headers: peer })).json();
        assert.equal(visible.posts[0].body, 'F3 private pending');
        assert.equal(visible.posts[0].status, 'published');
        await pupil.getByLabel('Reply', { exact: false }).fill('F3 rejected text');
        await pupil.getByRole('button', { name: 'Send', exact: true }).click();
        await pupil.getByText('F3 rejected text', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Discussions', exact: true }).click();
        await page.getByRole('button', { name: 'Pending (1)', exact: true }).click();
        await page.getByRole('button', { name: 'Reject', exact: true }).click();
        await page.getByLabel('Reason', { exact: false }).fill('Off topic');
        await page.getByRole('button', { name: 'Reject', exact: true }).last().click();
        await page.getByText('Pending (0)', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Discussions', exact: true }).click();
        await page.getByRole('button', { name: /F3 discussion/ }).click();
        const article = page.locator('article').filter({ hasText: 'F3 private pending' });
        await article.getByRole('button', { name: 'Mute author', exact: true }).click();
        await article.getByLabel('Reason', { exact: false }).fill('Please pause');
        await article.getByLabel('Until (optional)', { exact: true }).fill('2099-01-01T12:00');
        await article.getByRole('button', { name: 'Mute', exact: true }).click();
        await article.getByRole('button', { name: 'Mute author', exact: true }).waitFor();
        assert.equal((await teacher.request.post(`${origin}/api/forum/topics/${topicId}/posts`, { headers: member, data: { body: 'Blocked' } })).status(), 403);
        await pupil.reload({ waitUntil: 'networkidle' });
        await pupil.getByRole('button', { name: /F3 discussion/ }).click();
        assert.equal(await pupil.getByLabel('Reply', { exact: false }).count(), 0);
        await pupil.getByText(/You cannot post until/).first().waitFor();
        await pupil.screenshot({ path: '../backend/.venv/forum-options-muted.png', fullPage: true });
        await page.getByRole('button', { name: 'Discussions', exact: true }).click();
        await page.getByRole('button', { name: 'Muted students', exact: true }).click();
        await page.getByText('Please pause', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Unmute', exact: true }).click();
        await page.getByText('Muted students (0)', { exact: true }).waitFor();
        await page.getByRole('tab', { name: 'Tools & counselors', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Forum', exact: true }).uncheck();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByText('Settings saved', { exact: true }).waitFor();
        await pupil.reload({ waitUntil: 'networkidle' });
        await pupil.getByText('The forum is disabled for this class. You can read earlier messages.', { exact: true }).waitFor();
        assert.equal(await pupil.getByRole('button', { name: 'New discussion', exact: true }).count(), 0);
        await pupil.getByRole('button', { name: /F3 discussion/ }).click();
        await pupil.getByText('F3 private pending', { exact: true }).waitFor();
        assert.equal(await pupil.getByLabel('Reply', { exact: false }).count(), 0);
        const log = await (await teacher.request.get(`${origin}/api/teacher/groups/${groupId}/forum/log`)).json();
        for (const action of ['settings_change', 'approve', 'reject', 'mute', 'unmute']) assert.ok(log.entries.some(entry => entry.action === action));
        assert.ok(!JSON.stringify(log).includes('F3 rejected text'));
        // Known baseline debt (see teacher-notebook-page.test.mjs): the view-as
        // RolePreviewBanner hydration mismatch. Every other page error fails.
        assert.deepEqual(errors.filter(error => !(/^Hydration failed/.test(error) && /RolePreviewBanner/.test(error))), []);
        assert.deepEqual(aiRequests, []);
    } finally {
        try { if (groupId) assert.equal((await teacher.request.delete(`${origin}/api/admin/groups/${groupId}`)).status(), 200); }
        finally { await teacher.close(); await student.close(); await browser.close(); }
    }
});
