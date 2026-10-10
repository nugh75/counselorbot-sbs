// Individual meetings (#176), with synthetic APIs only: the teacher plans an
// individual meeting with an external expert, adds slots, moves and cancels
// bookings; the student books, changes, sees a cancellation and books again.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.INDIVIDUAL_MEETINGS_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

const group = { id: 11, code: 'GR-3B', name: '3B Liceo', school: null, school_level: null, institution_id: 5, institution_name: 'Liceo Sintetico',
    description: null, methodologies: null, context_visible_to_students: false, owner_username: 'teacher.test', is_active: true, members_count: 2, created_at: null };
const iso = hours => new Date(Date.now() + hours * 3600000).toISOString();

function server(user) {
    const state = { posts: [], slots: [], bookings: {}, cancelled: false, nextSlot: 1 };
    const meeting = { id: 7, group_id: 11, title: 'Colloquio di orientamento', description: null, starts_at: null, duration_minutes: null,
        kind: 'individual', host_kind: 'expert', host_name: 'Dott.ssa Rossi', host_role: 'Psicologa', mode: 'online', place: null,
        link: 'https://meet.example.invalid/7', status: 'scheduled', revision: 1, attendance_count: 0, group_name: '3B Liceo' };
    const teacherView = () => ({ ...meeting, slots: state.slots.map(slot => ({ ...slot,
        booking: state.bookings[slot.id] ? { id: 100 + slot.id, username: state.bookings[slot.id], name: 'Alice Bianchi' } : null })) });
    const studentView = () => {
        const mineId = Number(Object.keys(state.bookings).find(id => state.bookings[id] === 'alice')) || null;
        return { ...meeting, attended: false, can_mark: false, booking_slot_id: mineId, booking_cancelled: state.cancelled && !mineId,
            slots: state.slots.filter(slot => slot.status === 'open' && (!state.bookings[slot.id] || slot.id === mineId))
                .map(slot => ({ id: slot.id, starts_at: slot.starts_at, duration_minutes: slot.duration_minutes, mine: slot.id === mineId })) };
    };
    if (user === 'alice') {
        state.slots = [1, 2, 3].map(n => ({ id: n, starts_at: iso(24 * n), duration_minutes: 15, status: 'open', revision: 1 }));
        state.bookings = { 3: 'carla' };
    }
    const handler = async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = request.method();
        const body = request.postData() ? JSON.parse(request.postData()) : null;
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        const p = url.pathname;
        if (method !== 'GET') state.posts.push({ method, path: p, body });
        if (p === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: user, name: user,
            email: `${user}@example.invalid`, groups: user === 'teacher.test' ? ['docenti'] : [] });
        if (p === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (p === '/api/orientation/status') return json({ required: false, completed: true });
        if (p === '/api/admin/groups') return json([group]);
        if (p === '/api/teacher/path-templates') return json({ mine: [], shared: [] });
        if (p === '/api/teacher/groups/11/paths') return json([{ id: 301, group_id: 11, title: 'Orientamento', description: null,
            mode: 'recommended', status: 'draft', revision: 1, created_by: 'teacher.test', template_id: null, steps_count: 0, steps: [] }]);
        if (p === '/api/teacher/groups/11/settings') return json({ group_id: 11, revision: 1, disabled_tool_keys: [], tools: [] });
        if (p === '/api/teacher/groups/11/meeting-referents') return json([{ id: 4, role: 'Sportello orientamento', name: null }]);
        if (p === '/api/teacher/groups/11/meetings' && method === 'GET') return json(state.created ? [teacherView()] : []);
        if (p === '/api/teacher/groups/11/meetings') { state.created = body; return json(teacherView(), 201); }
        if (p === '/api/teacher/meetings/7/slots') {
            state.slots.push({ id: state.nextSlot++, starts_at: body.starts_at, duration_minutes: body.duration_minutes, status: 'open', revision: 1 });
            if (state.slots.length === 2) state.bookings[state.slots[0].id] = 'alice';
            return json(teacherView(), 201);
        }
        const move = p.match(/^\/api\/teacher\/bookings\/(\d+)\/move$/);
        if (move) { const from = Number(move[1]) - 100; delete state.bookings[from]; state.bookings[body.slot_id] = 'alice'; return json(teacherView()); }
        const cancelSlot = p.match(/^\/api\/teacher\/slots\/(\d+)\/cancel$/);
        if (cancelSlot) { const id = Number(cancelSlot[1]); state.slots.find(slot => slot.id === id).status = 'cancelled'; delete state.bookings[id]; return json(teacherView()); }
        if (p === '/api/user/meetings') return json([studentView()]);
        if (p === '/api/user/meetings/7/booking' && method === 'POST') {
            if (state.bookings[body.slot_id] && state.bookings[body.slot_id] !== 'alice') return json({ detail: 'slot_taken' }, 409);
            for (const id of Object.keys(state.bookings)) if (state.bookings[id] === 'alice') delete state.bookings[id];
            state.bookings[body.slot_id] = 'alice';
            return json({ slot_id: body.slot_id });
        }
        if (p === '/api/user/meetings/7/booking') {
            for (const id of Object.keys(state.bookings)) if (state.bookings[id] === 'alice') delete state.bookings[id];
            return json({ slot_id: null });
        }
        if (p === '/api/user/paths') return json([]);
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
    // Teacher: an individual meeting with an external expert, slots and bookings.
    const { page, errors, state } = await open({ width: 1280, height: 950 }, 'teacher.test');
    await page.goto(`${origin}/docente/percorsi`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Apri' }).click();
    const add = page.locator('[data-testid="add-step"]');
    await add.getByRole('button', { name: '+ Aggiungi passo' }).click();
    await add.getByRole('radio', { name: 'Partecipa a un incontro' }).check();
    const meetings = add.locator('[data-testid="class-meetings"]');
    await meetings.getByRole('button', { name: 'Nuovo incontro' }).click();
    await meetings.getByRole('textbox', { name: 'Argomento' }).fill('Colloquio di orientamento');
    await meetings.getByRole('radio', { name: 'Individuale, a fasce prenotabili' }).check();
    assert.equal(await meetings.getByLabel('Data e ora').count(), 0, 'no single date for individual meetings');
    await meetings.getByRole('radio', { name: 'Con un referente dell’istituto' }).check();
    await meetings.getByRole('option', { name: 'Sportello orientamento' }).waitFor({ state: 'attached' });
    await meetings.getByRole('radio', { name: 'Con un esperto esterno' }).check();
    await meetings.getByText('L’invito al referente o all’esperto lo mandi tu, fuori dalla piattaforma.').waitFor();
    await meetings.getByRole('textbox', { name: 'Nome dell’esperto' }).fill('Dott.ssa Rossi');
    await meetings.getByRole('textbox', { name: 'Ruolo (facoltativo)' }).fill('Psicologa');
    await meetings.getByRole('radio', { name: 'Online' }).check();
    await meetings.getByRole('textbox', { name: 'Link dell’incontro' }).fill('https://meet.example.invalid/7');
    await meetings.getByRole('button', { name: 'Salva incontro' }).click();
    const created = state.posts.find(row => row.path === '/api/teacher/groups/11/meetings');
    assert.equal(created.body.kind, 'individual');
    assert.equal(created.body.starts_at, null);
    assert.deepEqual([created.body.host_kind, created.body.host_name, created.body.host_role], ['expert', 'Dott.ssa Rossi', 'Psicologa']);
    const slots = meetings.locator('[data-testid="meeting-slots"]');
    await slots.getByText('Nessuna fascia: aggiungine una.').waitFor();
    for (const value of ['2026-11-05T10:00', '2026-11-05T10:20']) {
        await slots.getByLabel('Data e ora').fill(value);
        await slots.getByRole('button', { name: 'Aggiungi fascia' }).click();
        await slots.getByLabel('Data e ora').and(page.locator('[value=""]')).waitFor();
    }
    await slots.getByText('Alice Bianchi').waitFor();
    await slots.getByText('Libera').waitFor();
    await meetings.getByText(/Con Dott\.ssa Rossi, Psicologa/).waitFor();
    // Move Alice to the free slot, then cancel that slot.
    await slots.getByRole('combobox', { name: 'Sposta a…' }).selectOption({ index: 1 });
    await slots.locator('li').nth(1).getByText('Alice Bianchi').waitFor();
    await slots.locator('li').nth(1).getByRole('button', { name: 'Annulla fascia' }).click();
    await slots.locator('li').filter({ hasText: 'Alice Bianchi' }).waitFor({ state: 'detached' });
    assert.ok(state.posts.some(row => row.path === '/api/teacher/bookings/101/move' && row.body.slot_id === 2));
    assert.ok(state.posts.some(row => row.path === '/api/teacher/slots/2/cancel'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

async function studentFlow(viewport) {
    const { page, errors, state } = await open(viewport, 'alice');
    await page.goto(`${origin}/profilo/timeline`, { waitUntil: 'domcontentloaded' });
    const booking = page.locator('[data-testid="meeting-booking"]');
    await page.getByText('Con Dott.ssa Rossi, Psicologa').waitFor();
    await page.getByText('Prenota una fascia: potrai segnare la presenza dal suo inizio.').waitFor();
    // Carla's slot is not offered; Alice books, then changes.
    assert.equal(await booking.getByRole('option').count(), 3);
    await booking.getByRole('combobox').selectOption('1');
    await booking.getByRole('button', { name: 'Prenota' }).click();
    await booking.getByText('La tua fascia:').waitFor();
    await booking.getByRole('combobox').selectOption('2');
    await booking.getByRole('button', { name: 'Cambia fascia' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="meeting-booking"] select')?.querySelectorAll('option').length === 2);
    assert.deepEqual(state.bookings, { 2: 'alice', 3: 'carla' });
    // Wait for the reload after the change to settle before the teacher acts.
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="meeting-booking"] button')]
        .some(button => button.textContent === 'Annulla prenotazione' && !button.disabled));
    // The teacher cancels Alice's slot: she sees why and can book again.
    state.slots.find(slot => slot.id === 2).status = 'cancelled';
    delete state.bookings[2];
    state.cancelled = true;
    await booking.getByRole('button', { name: 'Annulla prenotazione' }).click();
    await booking.getByText('Il docente ha annullato la tua prenotazione: scegli un’altra fascia.').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await studentFlow({ width: 1280, height: 950 });
await studentFlow({ width: 390, height: 844 });

await browser.close();
console.log('individual meetings OK');
