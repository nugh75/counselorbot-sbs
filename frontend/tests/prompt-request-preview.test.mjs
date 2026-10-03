import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3107';
for (const width of [1440, 390]) {
 test(`preview drafts, message order and errors at ${width}px`, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
   const page = await context.newPage(); const requests = []; let fail = false;
   await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
   await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    const body = req.method() === 'POST' ? req.postDataJSON() : null;
    requests.push({ path, method: req.method(), body }); let data = [];
    if (path === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
    if (path === '/api/admin/config') data = [{ key: 'prompt_generic', value: 'SAVED_SYSTEM', description: '' }];
    if (path === '/api/admin/config/env-status') data = {};
    if (path === '/api/admin/guided-steps') data = [{ id: 'preview-fixture', questionnaire_type: 'QSA', label: 'Fixture step', sort_order: 0, prompt: 'SAVED_STEP', system_prompt_mode: 'generic', color_theme: 'blue' }];
    if (path.endsWith('/dry-run')) {
     if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
     data = { envelope: { system_prompt_final: body.config_overrides?.prompt_generic || 'SAVED_SYSTEM', full_message: body.message, history: [{ role: 'user', content: 'PREVIOUS_USER' }, { role: 'assistant', content: 'PREVIOUS_ASSISTANT' }] }, components: { step_prompt: body.message }, resolved: { provider: 'fixture', model: 'fixture-model', context_budget: {} }, warnings: [] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
   });
   await page.goto(`${origin}/admin`);
   await page.getByRole('button', { name: 'QSA', exact: true }).click();
   await page.getByRole('button', { name: 'Step guidati', exact: true }).click();
   await page.getByRole('button', { name: 'Anteprima della richiesta', exact: true }).click();
   const panel = page.getByRole('region', { name: 'Anteprima della richiesta' });
   await panel.getByText('fixture-model', { exact: false }).waitFor();
   await page.locator('textarea').filter({ hasText: 'SAVED_STEP' }).fill('UNSAVED_STEP');
   await panel.getByRole('button', { name: 'Messaggi completi' }).click();
   await panel.getByText('UNSAVED_STEP', { exact: true }).waitFor();
   assert.deepEqual((await panel.locator('details pre').allTextContents()).slice(0,4), ['SAVED_SYSTEM', 'PREVIOUS_USER', 'PREVIOUS_ASSISTANT', 'UNSAVED_STEP']);
   assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).at(-1).body.use_phase_prompt, true);
   await panel.getByText('Modifiche non salvate', { exact: true }).waitFor();
   await panel.getByRole('checkbox', { name: 'Mostra configurazione salvata' }).check();
   await panel.locator('pre').filter({ hasText: /^SAVED_STEP$/ }).waitFor();
   await panel.getByRole('checkbox', { name: 'Mostra configurazione salvata' }).uncheck();
   await panel.locator('pre').filter({ hasText: /^UNSAVED_STEP$/ }).waitFor();
   await panel.getByRole('combobox', { name: 'Ingresso nello step' }).selectOption('reply');
   await panel.getByRole('textbox', { name: 'Messaggio di prova' }).fill('STUDENT_REPLY');
   await panel.locator('pre').filter({ hasText: /^STUDENT_REPLY$/ }).waitFor();
   assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).at(-1).body.use_phase_prompt, false);
   fail = true;
   await panel.getByRole('textbox', { name: 'Messaggio di prova' }).fill('FAILED_PREVIEW');
   await panel.getByText('Anteprima non disponibile. Il contenuto precedente non è aggiornato.', { exact: true }).waitFor();
   assert.equal(await panel.getByRole('button', { name: 'Copia richiesta' }).isDisabled(), true);
   assert.equal(requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/dry-run')).length, 0);
   await page.screenshot({ path: `/tmp/prompt-preview-${width}.png`, fullPage: true });
  } finally { await context.close(); await browser.close(); }
 });
}
