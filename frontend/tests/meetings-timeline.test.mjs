// Meetings on the student's timeline (#189), with synthetic APIs only: class or
// group meetings appear for every student, individual meetings only at the
// student's own slot, and a meeting the teacher keeps off the timeline does not.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.MEETINGS_TIMELINE_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

const base = { group_id: 11, description: null, duration_minutes: 60, host_kind: 'teacher', host_name: null, host_role: null,
    mode: 'in_person', link: null, revision: 1, group_name: '3B Liceo', attended: false, can_mark: false };
const meetings = [
    { ...base, id: 1, title: 'Debriefing di classe', kind: 'group', starts_at: '2026-11-10T08:30:00Z', place: 'Aula 3', status: 'scheduled', show_on_timeline: true },
    { ...base, id: 2, title: 'Riunione interna', kind: 'group', starts_at: '2026-11-11T08:30:00Z', place: 'Aula 4', status: 'scheduled', show_on_timeline: false },
    { ...base, id: 3, title: 'Colloquio prenotato', kind: 'individual', starts_at: null, place: 'Studio', status: 'scheduled', show_on_timeline: true,
      booking_slot_id: 7, booking_cancelled: false, slots: [{ id: 7, starts_at: '2026-11-12T09:00:00Z', duration_minutes: 15, mine: true }] },
    { ...base, id: 4, title: 'Colloquio non prenotato', kind: 'individual', starts_at: null, place: 'Studio', status: 'scheduled', show_on_timeline: true,
      booking_slot_id: null, booking_cancelled: false, slots: [{ id: 8, starts_at: '2026-11-13T09:00:00Z', duration_minutes: 15, mine: false }] },
    { ...base, id: 5, title: 'Incontro annullato', kind: 'group', starts_at: '2026-11-14T08:30:00Z', place: null, mode: 'online',
      link: 'https://meet.example.invalid/5', status: 'cancelled', show_on_timeline: true },
];
const emptyWorkspace = { actions: [], cards: [], comparison: { options: [], criteria: [], cells: [], chosen: null, reason: '' },
    timeline: { title: '', events: [] } };

async function open(viewport, storedFilters) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(filters => {
        localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light');
        if (filters) localStorage.setItem('cb_timeline_filters', filters);
    }, storedFilters ?? null);
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        const p = url.pathname;
        if (p === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: 'alice', name: 'Alice', email: 'alice@example.invalid', groups: [] });
        if (p === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (p === '/api/orientation/status') return json({ required: false, completed: true });
        if (p === '/api/user/timeline') return json({ revision: 1, workspace: emptyWorkspace });
        if (p === '/api/user/meetings') return json(meetings);
        if (p === '/api/orientation-directory') return json({ institution: null, events: [], referrals: [] });
        return json([]);
    });
    await page.goto(`${origin}/profilo/timeline`, { waitUntil: 'domcontentloaded' });
    return { page, errors };
}

{
    // A filter saved before #189 keeps the new kind visible.
    const { page, errors } = await open({ width: 1280, height: 950 }, JSON.stringify(['milestone', 'action', 'goal', 'appointment']));
    const entry = title => page.locator('[id^="timeline-meeting-"]').filter({ hasText: title });
    await entry('Debriefing di classe').waitFor();
    await entry('Colloquio prenotato').waitFor();
    await entry('Debriefing di classe').getByText(/Incontro della classe o del gruppo · .*Aula 3/).waitFor();
    await entry('Incontro annullato').getByText(/Online · Annullato/).waitFor();
    // Kept off the timeline by the teacher, and individual meetings without a booking, are not there.
    assert.equal(await entry('Riunione interna').count(), 0);
    assert.equal(await entry('Colloquio non prenotato').count(), 0);
    // The kind filter hides and shows meetings and is remembered in the new format.
    await page.locator('details summary').filter({ hasText: /Filtr/ }).first().click();
    const filter = page.getByRole('checkbox', { name: 'Incontro della classe o del gruppo' });
    assert.equal(await filter.isChecked(), true);
    await filter.uncheck();
    await entry('Debriefing di classe').waitFor({ state: 'detached' });
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('cb_timeline_filters'))).visible.includes('meeting'), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

{
    // Unchecked in the new format, it stays hidden after a reload; phone width fits.
    const { page, errors } = await open({ width: 390, height: 844 }, JSON.stringify({ visible: ['milestone', 'action', 'goal', 'appointment'] }));
    await page.locator('details summary').filter({ hasText: /Filtr/ }).first().click();
    await page.getByRole('checkbox', { name: 'Incontro della classe o del gruppo' }).waitFor();
    assert.equal(await page.getByRole('checkbox', { name: 'Incontro della classe o del gruppo' }).isChecked(), false);
    assert.equal(await page.locator('[id^="timeline-meeting-"]').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('meetings timeline OK');
