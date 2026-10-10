// /docente/incontri, with synthetic APIs only: the teacher picks a class or
// group and plans its meetings without opening a class path; no step controls.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.TEACHER_MEETINGS_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });
const group = id => ({ id, code: `GR-${id}`, name: id === 11 ? '3B Liceo' : 'Tutor Roma Tre', school: null, school_level: null,
    institution_id: null, institution_name: null, description: null, methodologies: null, context_visible_to_students: false,
    owner_username: 'teacher.test', is_active: true, members_count: 2, created_at: null });

for (const viewport of [{ width: 1280, height: 950 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(20000);
    const errors = [];
    const created = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        const p = url.pathname;
        if (p === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: 'teacher.test', name: 'Docente',
            email: 'teacher@example.invalid', groups: ['docenti'] });
        if (p === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (p === '/api/orientation/status') return json({ required: false, completed: true });
        if (p === '/api/admin/groups') return json([group(11), group(12)]);
        const list = p.match(/^\/api\/teacher\/groups\/(\d+)\/meetings$/);
        if (list && request.method() === 'POST') {
            const body = JSON.parse(request.postData());
            created.push({ group: Number(list[1]), body });
            return json({ ...body, id: 9, group_id: Number(list[1]), status: 'scheduled', revision: 1, attendance_count: 0 }, 201);
        }
        if (list) return json(created.filter(row => row.group === Number(list[1])).map(row => ({ ...row.body, id: 9, group_id: row.group,
            status: 'scheduled', revision: 1, attendance_count: 0, kind: row.body.kind, host_kind: 'teacher' })));
        return json([]);
    });
    await page.goto(`${origin}/docente/incontri?class=12`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Incontri', exact: true }).first().waitFor();
    // `?class=` preselects the group; there is no path to add a step to.
    assert.equal(await page.getByRole('combobox', { name: /^Classe o gruppo/ }).inputValue(), '12');
    const meetings = page.locator('[data-testid="class-meetings"]');
    await meetings.getByRole('button', { name: 'Nuovo incontro' }).waitFor();
    assert.equal(await meetings.getByRole('button', { name: /Aggiungi passo/ }).count(), 0);
    await meetings.getByRole('button', { name: 'Nuovo incontro' }).click();
    await meetings.getByRole('textbox', { name: 'Argomento' }).fill('Presentazione del tutorato');
    await meetings.getByLabel('Data e ora').fill('2026-11-20T15:00');
    await meetings.getByRole('textbox', { name: 'Luogo' }).fill('Aula magna');
    await meetings.getByRole('button', { name: 'Salva incontro' }).click();
    await meetings.getByText('Presentazione del tutorato', { exact: true }).waitFor();
    assert.equal(created[0].group, 12);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('teacher meetings page OK');
