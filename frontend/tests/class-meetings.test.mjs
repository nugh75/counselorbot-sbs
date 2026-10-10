// Class and group meetings (#175), with synthetic APIs only: the teacher plans,
// moves and cancels a meeting and adds it as a step; the student sees place or
// link in the path and on the timeline and marks attendance after the start.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.CLASS_MEETINGS_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

const group = { id: 11, code: 'GR-3B', name: '3B Liceo', school: null, school_level: null, institution_id: 5, institution_name: 'Liceo Sintetico',
    description: null, methodologies: null, context_visible_to_students: false, owner_username: 'teacher.test', is_active: true, members_count: 2, created_at: null };
const iso = hours => new Date(Date.now() + hours * 3600000).toISOString();

function server(user) {
    const state = {
        meetings: [
            { id: 1, group_id: 11, title: 'Debriefing', description: null, starts_at: iso(-1), duration_minutes: 60, mode: 'online', place: null,
              link: 'https://meet.example.invalid/3b', status: 'scheduled', revision: 1, attendance_count: 0, group_name: '3B Liceo', attended: false, can_mark: true },
            { id: 2, group_id: 11, title: 'Uscita', description: null, starts_at: iso(48), duration_minutes: null, mode: 'in_person', place: 'Aula magna',
              link: null, status: 'scheduled', revision: 1, attendance_count: 0, group_name: '3B Liceo', attended: false, can_mark: false },
            { id: 3, group_id: 11, title: 'Annullato', description: null, starts_at: iso(-30), duration_minutes: null, mode: 'in_person', place: 'Aula 2',
              link: null, status: 'cancelled', revision: 2, attendance_count: 0, group_name: '3B Liceo', attended: false, can_mark: false },
        ],
        path: { id: 301, group_id: 11, title: 'Riflettere', description: null, mode: 'recommended', status: 'draft', revision: 1,
            created_by: 'teacher.test', template_id: null, steps_count: 0, steps: [] },
        posts: [],
    };
    const studentPath = () => [{ id: 301, group_id: 11, group_name: '3B Liceo', title: 'Riflettere', description: null, mode: 'recommended',
        next_step_id: 9, done: state.meetings[0].attended ? 1 : 0, total: 1, steps: [{ id: 9, position: 1, step_type: 'meeting', meeting_id: 1,
            tool_key: null, target_summary: state.meetings[0], state: state.meetings[0].attended ? 'done' : 'not_done',
            source: state.meetings[0].attended ? 'automatic' : null, start_href: null, can_self_mark: false, availability_reason: null }] }];
    const handler = async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = request.method();
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        const p = url.pathname;
        if (method !== 'GET') state.posts.push(`${method} ${p}`);
        if (p === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: user, name: user,
            email: `${user}@example.invalid`, groups: user === 'teacher.test' ? ['docenti'] : [] });
        if (p === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (p === '/api/orientation/status') return json({ required: false, completed: true });
        if (p === '/api/admin/groups') return json([group]);
        if (p === '/api/teacher/path-templates') return json({ mine: [], shared: [] });
        if (p === '/api/teacher/groups/11/paths') return json([state.path]);
        if (p === '/api/teacher/groups/11/settings') return json({ group_id: 11, revision: 1, disabled_tool_keys: [], tools: [] });
        if (p === '/api/teacher/groups/11/meetings' && method === 'GET') return json(state.meetings);
        if (p === '/api/teacher/groups/11/meetings') {
            const created = { ...body, id: 4, group_id: 11, status: 'scheduled', revision: 1, attendance_count: 0 };
            state.meetings.push(created);
            return json(created, 201);
        }
        const edit = p.match(/^\/api\/teacher\/meetings\/(\d+)(\/cancel)?$/);
        if (edit) {
            const row = state.meetings.find(item => item.id === Number(edit[1]));
            Object.assign(row, edit[2] ? { status: 'cancelled' } : body, { revision: row.revision + 1 });
            return json(row);
        }
        if (p === '/api/user/meetings') return json(state.meetings);
        const mark = p.match(/^\/api\/user\/meetings\/(\d+)\/attendance$/);
        if (mark) {
            state.meetings.find(item => item.id === Number(mark[1])).attended = method === 'POST';
            return json({ attended: method === 'POST' });
        }
        if (p === '/api/user/paths') return json(studentPath());
        if (p === '/api/groups/11/forum/topics') return json({ forum_enabled: true, group: { id: 11, name: '3B Liceo', is_active: true },
            can_open_topic: true, can_moderate: true, has_more: false, topics: [] });
        return json([]);
    };
    return { state, handler };
}

async function open(viewport, user) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
    const fake = server(user);
    await page.route('**/*', fake.handler);
    return { page, errors, state: fake.state };
}

{
    // Teacher: plan, move and cancel; add a meeting as a step. Templates do not offer meetings yet.
    const { page, errors, state } = await open({ width: 1280, height: 950 }, 'teacher.test');
    await page.goto(`${origin}/docente/percorsi`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Nuovo modello' }).click();
    const editor = page.locator('[data-testid="path-template-editor"]');
    await editor.getByRole('button', { name: '+ Aggiungi passo' }).click();
    assert.equal(await editor.getByRole('radio', { name: /Partecipa a un incontro/ }).isDisabled(), true);
    await page.getByRole('button', { name: 'Annulla' }).click();

    await page.getByRole('button', { name: 'Apri' }).click();
    const add = page.locator('[data-testid="add-step"]');
    await add.getByRole('button', { name: '+ Aggiungi passo' }).click();
    await add.getByRole('radio', { name: 'Partecipa a un incontro' }).check();
    const meetings = add.locator('[data-testid="class-meetings"]');
    await meetings.getByText('Debriefing', { exact: true }).waitFor();
    await meetings.getByRole('button', { name: 'Nuovo incontro' }).click();
    await meetings.getByRole('textbox', { name: 'Argomento' }).fill('Restituzione');
    await meetings.getByLabel('Data e ora').fill('2026-11-05T10:30');
    assert.equal(await meetings.getByRole('button', { name: 'Salva incontro' }).isDisabled(), true);
    await meetings.getByRole('textbox', { name: 'Luogo' }).fill('Aula 3');
    await meetings.getByRole('button', { name: 'Salva incontro' }).click();
    await meetings.getByText('Restituzione', { exact: true }).waitFor();
    assert.ok(state.posts.includes('POST /api/teacher/groups/11/meetings'));
    // Cancelled meetings cannot be chosen; the new one is preselected.
    const options = await meetings.getByRole('combobox').locator('option').allTextContents();
    assert.ok(!options.some(name => name.startsWith('Annullato')), options.join(', '));
    await meetings.getByRole('button', { name: 'Aggiungi passo', exact: true }).click();
    await page.locator('[data-testid="path-step-card"]').first().getByText(/^Incontro · Restituzione · /).waitFor();

    // Move the online debriefing, then cancel it.
    await add.getByRole('button', { name: '+ Aggiungi passo' }).click();
    await add.getByRole('radio', { name: 'Partecipa a un incontro' }).check();
    const debrief = meetings.locator('li').filter({ hasText: 'Debriefing' });
    await debrief.getByRole('button', { name: 'Modifica' }).click();
    await meetings.getByLabel('Data e ora').fill('2026-11-06T09:00');
    await meetings.getByRole('button', { name: 'Salva incontro' }).click();
    await debrief.getByRole('button', { name: 'Annulla incontro' }).click();
    await debrief.getByRole('button', { name: /Conferma|Sì/ }).click();
    await debrief.getByText('Annullato').waitFor();
    assert.ok(state.posts.includes('PUT /api/teacher/meetings/1') && state.posts.includes('POST /api/teacher/meetings/1/cancel'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

{
    // Student: link in the path, attendance from the start, timeline list.
    const { page, errors } = await open({ width: 1280, height: 950 }, 'alice');
    await page.goto(`${origin}/profilo/percorsi`, { waitUntil: 'domcontentloaded' });
    const details = page.locator('[data-testid="meeting-details"]').first();
    await details.getByRole('link', { name: 'Apri il link dell’incontro' }).waitFor();
    assert.equal(await details.getByRole('link').getAttribute('href'), 'https://meet.example.invalid/3b');
    await details.getByRole('button', { name: 'Ho partecipato' }).click();
    await details.getByRole('button', { name: 'Annulla la presenza' }).waitFor();
    await page.getByText('Completato', { exact: true }).first().waitFor();

    await page.goto(`${origin}/profilo/timeline`, { waitUntil: 'domcontentloaded' });
    const timeline = page.getByRole('region', { name: 'Incontri delle tue classi o gruppi' });
    await timeline.getByText('Uscita · 3B Liceo').waitFor();
    await timeline.getByText('Potrai segnare la presenza dall’inizio dell’incontro.').waitFor();
    const cancelled = timeline.locator('li').filter({ hasText: 'Annullato · 3B Liceo' });
    assert.equal(await cancelled.getByRole('button').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

{
    const { page, errors } = await open({ width: 390, height: 844 }, 'alice');
    await page.goto(`${origin}/profilo/timeline`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('region', { name: 'Incontri delle tue classi o gruppi' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('class meetings OK');
