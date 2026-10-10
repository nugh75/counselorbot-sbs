// Activity tools (#174), with synthetic APIs only: the teacher picks the class's
// personal tools in «Nuova assegnazione»; the student opens each one in an
// accessible popup (Esc, focus back to the opener) or at full page, and a tool
// the class switched off later is listed as unavailable.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.ACTIVITY_TOOLS_BASE_URL || 'http://127.0.0.1:3107').origin;
const browser = await chromium.launch({ headless: true });

const tool = (key, category = 'personal', extra = {}) => ({ key, kind: 'personal', category, label_key: key, label_i18n: {},
    admin_enabled: true, enabled: true, always_on: false, ...extra });
const settings = { group_id: 11, revision: 1, disabled_tool_keys: ['portfolio'], tools: [
    tool('tavolo'), tool('timeline'), tool('portfolio', 'personal', { enabled: false }), tool('bussola', 'support'), tool('forum', 'forum'),
    { key: 'QSA', kind: 'instrument', category: 'guided', label_i18n: { it: 'QSA' }, admin_enabled: true, enabled: true, always_on: false },
] };
const assignment = { id: 51, author_name: 'Docente', group_name: '3B Liceo', source_kind: 'goal', instructions: 'Prepara il piano',
    created_at: '2026-10-10T10:00:00Z', revoked_at: null, intent: 'requested', attachments: [],
    tools: [{ key: 'tavolo', available: true }, { key: 'timeline', available: false }],
    snapshot: { title: 'Piano della settimana', description: 'Organizza lo studio', details: '' },
    progress: { planned: false, shared: false, feedback_available: false } };

async function prepare(page, user) {
    page.setDefaultTimeout(20000);
    const errors = [];
    const posts = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        const p = url.pathname;
        if (request.method() === 'POST') posts.push({ path: p, body: JSON.parse(request.postData() || '{}') });
        if (p === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: user, name: user,
            email: `${user}@example.invalid`, groups: user === 'teacher.test' ? ['docenti'] : [] });
        if (p === '/api/user/account') return json({ setup_complete: true, notebook_completed: true });
        if (p === '/api/orientation/status') return json({ required: false, completed: true });
        if (p === '/api/user/assignments') return json([assignment]);
        if (p === '/api/teacher/assignments' && request.method() === 'GET') return json([]);
        if (p === '/api/teacher/assignments') return json({ ...assignment, id: 52 }, 201);
        if (p === '/api/teacher/assignment-targets') return json([{ id: 11, name: '3B Liceo', participants: [{ username: 'alice', name: 'Alice' }] }]);
        if (p === '/api/teacher/goal-catalog') return json([{ id: 40, group_id: null, status: 'published', data: { title: 'Piano della settimana' } }]);
        if (p === '/api/teacher/groups/11/settings') return json(settings);
        return json([]);
    });
    return { errors, posts };
}

{
    // Teacher: only the class's enabled personal tools can be picked.
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const { errors, posts } = await prepare(page, 'teacher.test');
    await page.goto(`${origin}/docente/assegnazioni`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Nuova assegnazione' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Scegli prima la classe o il gruppo.').waitFor();
    await dialog.getByRole('combobox', { name: 'Gruppo o classe' }).selectOption('11');
    const tools = dialog.getByRole('group', { name: 'Strumenti da usare nell’attività' });
    await tools.getByRole('checkbox', { name: 'Tavolo' }).waitFor();
    const names = await tools.getByRole('checkbox').evaluateAll(rows => rows.map(row => row.parentElement.textContent.trim()));
    assert.deepEqual(names, ['Tavolo', 'Linea del tempo', 'Bussola']);
    await tools.getByRole('checkbox', { name: 'Tavolo' }).check();
    await tools.getByRole('checkbox', { name: 'Bussola' }).check();
    await dialog.getByRole('combobox', { name: 'Obiettivo', exact: true }).selectOption('40');
    await dialog.getByRole('button', { name: 'Conferma assegnazione' }).click();
    await dialog.waitFor({ state: 'detached' });
    const sent = posts.find(row => row.path === '/api/teacher/assignments');
    assert.deepEqual(sent.body.tool_keys, ['tavolo', 'bussola']);
    assert.deepEqual(errors, []);
    await page.close();
}

{
    // Student: popup with focus trap and Esc; full page link; unavailable tool.
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const { errors } = await prepare(page, 'alice');
    await page.goto(`${origin}/profilo/assegnazioni`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Dettagli' }).click();
    await page.getByText('Strumenti da usare nell’attività').waitFor();
    await page.getByText('Non disponibile: lo strumento è stato disattivato per la classe o il gruppo.').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Apri a pagina intera' }).getAttribute('href'), '/profilo/tavolo');
    const opener = page.getByRole('button', { name: 'Apri qui' });
    assert.equal(await opener.count(), 1);
    await opener.click();
    const popup = page.getByRole('dialog', { name: 'Tavolo' });
    await popup.waitFor();
    assert.equal(await popup.locator('iframe').getAttribute('src'), '/profilo/tavolo?embedded=1');
    // The tool page inside the popup shows no site header.
    const frame = page.frameLocator('[data-testid="activity-tool-popup"] iframe');
    await frame.locator('main#contenuto').waitFor();
    assert.equal(await frame.locator('.console-header').isVisible(), false);
    assert.equal(await page.locator('.console-header').isVisible(), true);
    // Focus stays in the popup; Esc closes it and focus returns to the opener.
    assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog') != null), true);
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    assert.equal(await opener.evaluate(element => element === document.activeElement), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

{
    // Phone width: the popup fits the screen.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const { errors } = await prepare(page, 'alice');
    await page.goto(`${origin}/profilo/assegnazioni`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Dettagli' }).click();
    await page.getByRole('button', { name: 'Apri qui' }).click();
    const box = await page.getByRole('dialog', { name: 'Tavolo' }).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
}

await browser.close();
console.log('activity tools OK');
