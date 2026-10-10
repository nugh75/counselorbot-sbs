// Deleting assignments (#188), with synthetic APIs only: «Elimina» appears only
// while no student has started the assignment and no path step uses it.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.ASSIGNMENT_DELETE_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });
const row = (id, title, blocker) => ({ id, author_name: 'Docente', group_name: '3B Liceo', source_kind: 'goal', instructions: '',
    created_at: '2026-10-10T10:00:00Z', revoked_at: null, intent: 'proposal', attachments: [], tools: [], recipient_username: null,
    recipient_count: 2, delete_blocker: blocker, snapshot: { title, description: '', details: '' } });

for (const viewport of [{ width: 1280, height: 950 }, { width: 390, height: 844 }]) {
    let rows = [row(1, 'Piano libero', null), row(2, 'Piano iniziato', 'assignment_started'), row(3, 'Piano nel percorso', 'assignment_in_path')];
    const deleted = [];
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(20000);
    const errors = [];
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
        if (p === '/api/teacher/assignments') return json(rows);
        const del = p.match(/^\/api\/teacher\/assignments\/(\d+)\/delete$/);
        if (del) { deleted.push(Number(del[1])); rows = rows.filter(item => item.id !== Number(del[1])); return json({ deleted: Number(del[1]) }); }
        return json([]);
    });
    await page.goto(`${origin}/docente/assegnazioni`, { waitUntil: 'domcontentloaded' });
    const card = title => page.locator('article').filter({ hasText: title });
    await card('Piano libero').getByRole('button', { name: 'Elimina' }).waitFor();
    assert.equal(await card('Piano iniziato').getByRole('button', { name: 'Elimina' }).count(), 0);
    await card('Piano iniziato').getByText('Non si può eliminare perché uno studente l’ha già iniziata: puoi revocarla.').waitFor();
    await card('Piano nel percorso').getByText(/è un passo di un percorso/).waitFor();
    // The confirmation says what is lost, then the card disappears.
    await card('Piano libero').getByRole('button', { name: 'Elimina' }).click();
    await card('Piano libero').getByText(/sparirà per tutti e non si potrà recuperare/).waitFor();
    await card('Piano libero').getByRole('button', { name: /Sì|Conferma/ }).click();
    await card('Piano libero').waitFor({ state: 'detached' });
    assert.deepEqual(deleted, [1]);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('assignment delete OK');
