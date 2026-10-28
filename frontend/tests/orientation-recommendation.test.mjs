// Production frontend with synthetic API data: unsaved changes and historical documents.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.ORIENTATION_BASE_URL || 'http://127.0.0.1:3186').origin;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
const docs = {
    alice: { group_id: 11, group_name: 'Classe sintetica', username: 'alice', display_name: 'Alice', content: '', status: null, revision: 0, ai_draft_used: false, is_member: true, updated_by: null, final_at: null, created_at: null, updated_at: null },
    bob: { group_id: 11, group_name: 'Classe sintetica', username: 'bob', display_name: 'Bob', content: 'Documento storico', status: 'draft', revision: 1, ai_draft_used: false, is_member: false, updated_by: null, final_at: null, created_at: null, updated_at: null },
};
let saveStarted;
let releaseSave;
const started = new Promise(resolve => { saveStarted = resolve; });
const release = new Promise(resolve => { releaseSave = resolve; });
await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const p = url.pathname;
    const json = data => route.fulfill({ json: data });
    if (p === '/api/auth/me') return json({ authenticated: true, is_admin: false, username: 'teacher.test', name: 'Teacher', groups: ['docenti'] });
    if (p === '/api/admin/groups') return json([{ id: 11, code: 'GR-3B', name: 'Classe sintetica', owner_username: 'teacher.test', members_count: 1, is_active: true }]);
    if (p === '/api/teacher/groups/11/settings') return json({ group_id: 11, revision: 1, disabled_tool_keys: [], tools: [] });
    if (p === '/api/teacher/groups/11/orientation-recommendations') return json(Object.values(docs));
    const match = p.match(/^\/api\/teacher\/groups\/11\/orientation-recommendations\/(alice|bob)$/);
    if (match) {
        const doc = docs[match[1]];
        if (request.method() === 'PUT') {
            saveStarted(); await release;
            Object.assign(doc, JSON.parse(request.postData()), { revision: doc.revision + 1 });
        }
        return json(doc);
    }
    if (p === '/api/orientation/status') return json({ required: false, completed: true });
    return json([]);
});
try {
    await page.goto(`${origin}/docente/classi/11?tab=orientation`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Alice/ }).click();
    const editor = page.getByLabel('Testo del consiglio');
    await editor.fill('Modifica da salvare');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: /Bob/ }).click();
    assert.equal(await editor.inputValue(), 'Modifica da salvare');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('tab', { name: 'Forum' }).click();
    assert.equal(await editor.inputValue(), 'Modifica da salvare');
    await page.getByRole('tab', { name: 'Consiglio orientativo' }).focus();
    page.once('dialog', dialog => dialog.dismiss());
    await page.keyboard.press('ArrowRight');
    assert.equal(await editor.inputValue(), 'Modifica da salvare');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await started;
    assert.equal(await page.getByRole('button', { name: /Bob/ }).isDisabled(), true);
    releaseSave();
    await page.getByText('Salvato', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Bob/ }).click();
    await page.getByText(/Studente non più iscritto/).waitFor();
    assert.equal(await editor.isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Scarica PDF' }).isDisabled(), false);
    assert.deepEqual(errors, []);
} finally {
    await browser.close();
}
console.log('Orientation recommendation: save, unsaved guard and historical access passed');
