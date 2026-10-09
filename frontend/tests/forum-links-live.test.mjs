// Explicit opt-in: real APIs on the documented synthetic database and dev runners.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.FORUM_BASE_URL || 'http://127.0.0.1:3107').origin;
const demo = { 'X-View-As': 'studente.demo' };

test('live resource links, student navigation, archive/revoke and departure', async () => {
    assert.equal(process.env.FORUM_LINKS_LIVE, '1', 'Use only the documented C22 synthetic database');
    const browser = await chromium.launch({ headless: true });
    const teacher = await browser.newContext();
    const student = await browser.newContext({ viewport: { width: 390, height: 900 } });
    let groupId;
    const json = async (response, status = 200) => {
        assert.equal(response.status(), status, await response.text()); return response.json();
    };
    try {
        const group = await json(await teacher.request.post(`${origin}/api/admin/groups`, { data: {
            name: 'C22 synthetic links', code: `GR-C22LIVE${Date.now()}`,
        } })); groupId = group.id;
        await json(await student.request.post(`${origin}/api/groups/join`, { headers: demo, data: { code: group.code } }));
        let path = await json(await teacher.request.post(`${origin}/api/teacher/groups/${groupId}/paths`, { data: { title: 'C22 live path' } }));
        path = await json(await teacher.request.put(`${origin}/api/teacher/paths/${path.id}`, { data: {
            revision: path.revision, title: path.title, mode: 'recommended', steps: [{ tool_key: 'QSA', title: 'C22 live step' }],
        } }));
        await json(await teacher.request.post(`${origin}/api/teacher/paths/${path.id}/publish`));
        const stepId = path.steps[0].id;
        const source = await json(await teacher.request.post(`${origin}/api/teacher/goal-catalog`, { data: {
            group_id: groupId, status: 'published', data: { title: 'C22 live assignment', language: 'en' },
        } }), 201);
        const assignment = await json(await teacher.request.post(`${origin}/api/teacher/assignments`, { data: {
            source_kind: 'goal', source_id: source.id, group_id: groupId, request_id: `c22-live-${Date.now()}`, language: 'en',
        } }), 201);
        await teacher.addInitScript(() => localStorage.setItem('cb_lang', 'en'));
        await student.addInitScript(() => { localStorage.setItem('cb_lang', 'en'); sessionStorage.setItem('cb_view_as_user', 'studente.demo'); });
        const teacherPage = await teacher.newPage(); teacherPage.setDefaultTimeout(30000);
        const page = await student.newPage(); page.setDefaultTimeout(30000);
        const aiRequests = [];
        for (const current of [teacherPage, page]) {
            current.on('request', request => {
                if (request.method() === 'POST' && /\/api\/(chat|site-chat|orientation|opencode)/.test(new URL(request.url()).pathname)) aiRequests.push(request.url());
            });
            await current.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
            await current.route('**/api/orientation/status', route => route.fulfill({ json: { required: false } }));
        }
        const topics = {};
        for (const [kind, id, title] of [['path_step', stepId, 'C22 step discussion'], ['assignment', assignment.id, 'C22 assignment discussion']]) {
            await teacherPage.goto(`${origin}/docente/classi/${groupId}`);
            await teacherPage.getByRole('tab', { name: 'Forum', exact: true }).click();
            await teacherPage.getByRole('button', { name: 'New discussion', exact: true }).click();
            await teacherPage.getByLabel('Title', { exact: false }).fill(title);
            await teacherPage.getByLabel('Text', { exact: false }).fill('Synthetic discussion body');
            await teacherPage.getByLabel('Optional link').selectOption(`${kind}:${id}`);
            await teacherPage.getByRole('button', { name: 'Send', exact: true }).click();
            await teacherPage.getByRole('heading', { name: title, exact: true }).waitFor();
            const listing = await json(await teacher.request.get(`${origin}/api/groups/${groupId}/forum/topics`));
            topics[kind] = listing.topics.find(topic => topic.title === title).id;
        }
        await page.goto(`${origin}/profilo/percorsi`);
        await page.locator(`#class-step-${stepId}`).getByRole('link', { name: 'Discuss in the class forum', exact: true }).click();
        await page.getByRole('heading', { name: 'C22 step discussion', exact: true }).waitFor();
        await page.getByRole('link', { name: /C22 live step/ }).click();
        await page.locator(`#class-step-${stepId}`).waitFor();
        await page.goto(`${origin}/profilo/assegnazioni#assignment-${assignment.id}`);
        await page.locator(`#assignment-${assignment.id}`).getByRole('link', { name: 'Discuss in the class forum', exact: true }).click();
        await page.getByRole('heading', { name: 'C22 assignment discussion', exact: true }).waitFor();
        await page.getByRole('link', { name: 'C22 live assignment', exact: true }).click();
        await page.locator(`#assignment-${assignment.id}`).waitFor();
        await json(await teacher.request.post(`${origin}/api/teacher/paths/${path.id}/archive`));
        await json(await teacher.request.delete(`${origin}/api/teacher/assignments/${assignment.id}`));
        for (const [kind, title] of [['path_step', 'C22 live step'], ['assignment', 'C22 live assignment']]) {
            await page.goto(`${origin}/profilo/classi/${groupId}/forum?topic=${topics[kind]}`);
            await page.getByText(/Unavailable/).waitFor();
            assert.equal(await page.getByRole('link', { name: new RegExp(title) }).count(), 0);
        }
        await page.screenshot({ path: '../backend/.venv/c22-forum-link-unavailable.png', fullPage: true });
        const groups = await json(await student.request.get(`${origin}/api/user/groups`, { headers: demo }));
        await json(await student.request.delete(`${origin}/api/user/groups/${groups.find(row => row.group_id === groupId).membership_id}`, { headers: demo }));
        assert.deepEqual(await json(await student.request.get(`${origin}/api/user/forum/links`, { headers: demo })), { links: [] });
        assert.equal((await student.request.get(`${origin}/api/forum/topics/${topics.path_step}`, { headers: demo })).status(), 403);
        assert.deepEqual(aiRequests, []);
    } finally {
        if (groupId) assert.equal((await teacher.request.delete(`${origin}/api/admin/groups/${groupId}`)).status(), 200);
        await browser.close();
    }
});
