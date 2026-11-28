// Guided chats and meetings are separate steps in a class operational plan:
// the old combined chat+follow-up form (#177) was replaced by the step-kind
// picker, so a chat and a class meeting are added and saved independently.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.GUIDED_CHAT_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

const group = { id: 11, code: 'GR-3B', name: '3B Liceo', school: null, school_level: null, institution_id: 5, institution_name: 'Liceo Sintetico',
    description: null, methodologies: null, context_visible_to_students: false, owner_username: 'teacher.test', is_active: true, members_count: 2, created_at: null };
const meetings = [
    { id: 1, group_id: 11, title: 'Debriefing', description: null, starts_at: '2030-11-10T09:00:00+00:00', duration_minutes: 60, kind: 'group',
      host_kind: 'teacher', host_name: null, host_role: null, mode: 'in_person', place: 'Aula 3', link: null, status: 'scheduled', revision: 1, attendance_count: 0 },
    { id: 2, group_id: 11, title: 'Colloquio', description: null, starts_at: null, duration_minutes: null, kind: 'individual',
      host_kind: 'teacher', host_name: null, host_role: null, mode: 'in_person', place: 'Studio', link: null, status: 'scheduled', revision: 1,
      attendance_count: 0, slots: [] },
];

const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
page.setDefaultTimeout(20000);
const errors = [];
let saved = null;
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
const path = { id: 301, group_id: 11, title: 'Racconto di sé', description: null, mode: 'recommended', status: 'draft', revision: 1,
    created_by: 'teacher.test', template_id: null, steps_count: 0, steps: [] };
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
    if (p === '/api/admin/groups') return json([group]);
    if (p === '/api/teacher/path-templates') return json({ mine: [], shared: [] });
    if (p === '/api/teacher/groups/11/paths') return json([path]);
    if (p === '/api/teacher/groups/11/settings') return json({ group_id: 11, revision: 1, disabled_tool_keys: [], tools: [] });
    if (p === '/api/teacher/groups/11/meetings') return json(meetings);
    if (p === '/api/teacher/groups/11/meeting-referents') return json([]);
    if (p === '/api/teacher/paths/301' && request.method() === 'PUT') {
        saved = JSON.parse(request.postData());
        const steps = saved.steps.map((step, index) => ({ ...step, id: 50 + index, position: index + 1, auto_detect: true,
            tool_key: step.tool_key ?? null, target_summary: step.meeting_id ? meetings.find(row => row.id === step.meeting_id) : null,
            follows_step_id: step.follows != null ? 50 + step.follows : null }));
        return json({ ...path, revision: 2, steps });
    }
    return json([]);
});

await page.goto(`${origin}/docente/piani-operativi`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Apri' }).click();
const add = page.locator('[data-testid="add-step"]');
const cards = page.locator('[data-testid="path-step-card"]');
const openAdd = async kind => {
    await add.getByRole('button', { name: '+ Aggiungi passo' }).click();
    await add.getByRole('radio', { name: kind }).check();
};

// Standalone guided chat.
await openAdd('Fa una chat guidata');
await add.getByRole('combobox', { name: /^Percorso guidato/ }).selectOption('SAVICKAS');
await add.getByRole('button', { name: 'Aggiungi passo', exact: true }).click();
await cards.nth(0).getByText(/^Chat guidata · /).waitFor();

// A class meeting is its own step, not a follow-up of the chat.
await openAdd('Partecipa a un incontro');
await add.getByRole('button', { name: 'Gestisci incontri' }).click();
const manager = page.locator('[data-testid="class-meetings"]');
await manager.locator('option').nth(1).waitFor({ state: 'attached' });
const offered = await manager.getByRole('combobox').first().locator('option').allTextContents();
assert.ok(offered.some(name => name.startsWith('Debriefing')) && offered.some(name => name.startsWith('Colloquio')), offered.join(', '));
await manager.getByRole('combobox').first().selectOption('1');
await manager.getByRole('button', { name: 'Aggiungi passo' }).click();
await cards.nth(1).getByText(/Incontro · Debriefing/).first().waitFor();

// Saving keeps the two independent steps.
await page.getByRole('button', { name: 'Salva bozza' }).click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="path-step-card"]').length === 2);
assert.deepEqual(saved.steps.map(step => [step.step_type, step.tool_key ?? step.meeting_id, step.follows ?? null]),
    [['guided_chat', 'SAVICKAS', null], ['meeting', 1, null]]);
await cards.nth(1).getByText(/Incontro · Debriefing/).first().waitFor();
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
assert.deepEqual(errors, []);
await browser.close();
console.log('guided chat and meeting steps OK');
