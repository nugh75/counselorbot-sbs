import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
const page = await ctx.newPage();
const api = 'http://127.0.0.1:18096';
await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); const path = url.pathname.slice(4);
    if (/^\/(user\/goal|user\/timeline|user\/portfolio)/.test(path)) {
        const response = await fetch(api + path + url.search, { method: route.request().method(), headers: { 'Content-Type': 'application/json', 'x-test-user': 'student-timeline' }, body: route.request().postData() || undefined });
        return route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' });
    }
    let data = [];
    if (path === '/auth/me') data = { authenticated: true, username: 'student-timeline', name: 'ST', is_admin: false, groups: ['studenti'] };
    else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
    else if (path === '/orientation/status') data = { required: false, completed: true };
    else if (path === '/tavolo/enabled') data = { enabled: false };
    else if (path === '/orientation-directory') data = { institution: null, events: [] };
    return route.fulfill({ json: data });
});
await page.goto('http://127.0.0.1:3108/profilo/azioni', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const titleInput = page.locator('input[id$="-new-action-title"]');
const addSummary = page.locator('summary').filter({ hasText: 'Aggiungi azione' });
await titleInput.or(addSummary).first().waitFor();
if (!(await titleInput.isVisible())) await addSummary.click();
await titleInput.fill('Debug card');
await page.getByRole('button', { name: 'Aggiungi azione', exact: true }).last().click();
await page.waitForTimeout(800);
const editBtn = page.getByRole('button', { name: 'Modifica: Debug card' });
await editBtn.click();
await page.waitForTimeout(600);
const card = page.locator('article').filter({ hasText: 'Debug card' }).first();
const details = card.locator('details');
console.log('details:', await details.count(), 'open:', await details.first().getAttribute('open'));
console.log('Quando count:', await card.getByLabel('Quando', { exact: true }).count(), 'visibile:', await card.getByLabel('Quando', { exact: true }).isVisible().catch(() => 'err'));
await browser.close();
