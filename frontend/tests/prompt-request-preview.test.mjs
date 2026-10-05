import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3107';

// The configuration sections live in a searchable filter, not in a row of buttons.
async function chooseSection(page, name) {
    await page.locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('listbox').getByRole('option', { name, exact: true }).click();
}
for (const width of [1440, 390]) {
 test(`preview drafts, message order and errors at ${width}px`, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
   const page = await context.newPage(); const requests = []; let fail = false; let unknownModel = false;
   const instruments = [['QSA','QSA'], ['QSAr','QSAr'], ['ZTPI','ZTPI'], ['Savickas','SAVICKAS'], ['Evento significativo di studio','EVENTO_STUDIO'], ['Evento significativo professionale','EVENTO_PROFESSIONALE'], ['Il mio obiettivo di apprendimento','OBIETTIVO_STUDIO'], ['Obiettivi per la mia classe','OBIETTIVO_DOCENZA'], ['QPCS','QPCS'], ['QPCC','QPCC'], ['QAP','QAP']];
   await page.addInitScript(() => { if (!localStorage.getItem('cb_lang')) localStorage.setItem('cb_lang', 'it'); });
   await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    const body = req.method() === 'POST' ? req.postDataJSON() : null;
    requests.push({ path, method: req.method(), body }); let data = [];
    if (path === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
    if (path === '/api/admin/config') data = [{ key: 'prompt_generic', value: 'SAVED_SYSTEM', description: '' }];
    if (path === '/api/admin/config/env-status') data = {};
    if (path === '/api/admin/guided-steps') data = instruments.map(([,code]) => ({ id: code === 'QSA' ? 'preview-fixture' : `fixture-${code}`, questionnaire_type: code, label: 'Fixture step', sort_order: 0, prompt: 'SAVED_STEP', system_prompt_mode: 'generic', color_theme: 'blue', component_defaults: code === 'QSA' ? { cognitive_factors: false, affective_factors: false, knowledge: true, certified_strategy_limit: 0 } : null }));
    if (path.endsWith('/dry-run')) {
     if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
     data = { envelope: { system_prompt_final: body.config_overrides?.prompt_generic || 'SAVED_SYSTEM', full_message: body.message, history: [{ role: 'user', content: 'PREVIOUS_USER' }, { role: 'assistant', content: 'PREVIOUS_ASSISTANT' }] }, components: { step_prompt: body.message, history: [], cognitive_factors: 'EXCLUDED_SCORES' }, component_flags: { cognitive_factors: false }, resolved: { provider: unknownModel ? 'unknown' : 'fixture', model: unknownModel ? 'unknown' : 'fixture-model', context_budget: {} }, warnings: [{ code: 'retrieval_not_replayed', message: 'TECHNICAL_RETRIEVAL_DETAIL' }, { code: 'unknown_context_capacity', message: 'TECHNICAL_CAPACITY_DETAIL' }] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
   });
   await page.goto(`${origin}/admin`);
   await chooseSection(page, 'QSA');
   await page.getByRole('button', { name: 'Step guidati', exact: true }).click();
   await page.emulateMedia({ media: 'print' });
   assert.equal(await page.locator('.prompt-print-value').isVisible(), true);
   await page.emulateMedia({ media: 'screen' });
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
   const beforeEmpty = requests.filter(r => r.path.endsWith('/dry-run')).length;
   await panel.getByText('Scrivi un messaggio di prova per simulare la risposta dello studente.', { exact: true }).waitFor();
   await page.waitForTimeout(450);
   assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).length, beforeEmpty);
   assert.equal(await panel.getByRole('button', { name: 'Copia richiesta' }).isDisabled(), true);
   await panel.getByRole('textbox', { name: 'Messaggio di prova' }).fill('STUDENT_REPLY');
   await panel.locator('pre').filter({ hasText: /^STUDENT_REPLY$/ }).waitFor();
   assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).at(-1).body.use_phase_prompt, false);
   fail = true;
   await panel.getByRole('textbox', { name: 'Messaggio di prova' }).fill('FAILED_PREVIEW');
   await panel.getByText('Anteprima non disponibile. Il contenuto precedente non è aggiornato.', { exact: true }).waitFor();
   assert.equal(await panel.getByRole('button', { name: 'Copia richiesta' }).isDisabled(), true);
   assert.equal(requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/dry-run')).length, 0);
   fail = false;
   if (width === 1440) {
    await page.getByRole('button', { name: 'Prompt per step', exact: true }).click();
    for (const [name, code] of instruments) {
     await chooseSection(page, name);
     const shared = page.getByRole('region', { name: 'Anteprima della richiesta' });
     await shared.getByText('fixture-model', { exact: false }).waitFor();
     assert.equal(await shared.getByRole('combobox').count(), 1);
     assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).at(-1).body.questionnaire_type, code);
     assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).at(-1).body.component_flags, undefined);
     if (code === 'QSA') {
      await page.getByText('Componenti passati alla fase', { exact: true }).click();
      assert.equal(await page.getByRole('checkbox', { name: 'Fattori cognitivi', exact: true }).isChecked(), false);
      assert.equal(await page.getByRole('checkbox', { name: 'Fattori affettivi', exact: true }).isChecked(), false);
      await page.getByText('Componenti passati alla fase', { exact: true }).click();
     }
     assert.equal(await page.getByText('Questa vista mostra solo i prompt.', { exact: false }).count(), 0);
     assert.equal(await shared.getByText('TECHNICAL_RETRIEVAL_DETAIL', { exact: false }).isVisible(), false);
     await shared.getByRole('button', { name: 'Per componenti' }).click();
     await shared.getByText('Recupero non eseguito', { exact: true }).waitFor();
     await shared.getByText('Dato assente', { exact: true }).waitFor();
     await shared.getByText('Escluso', { exact: true }).waitFor();
    }
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.console-header').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await page.locator('.admin-shell button').first().evaluate(el => getComputedStyle(el).display), 'none');
    await page.pdf({ path: '/tmp/improved-prompt-preview.pdf', format: 'A4', printBackground: true });
    assert.equal(await page.locator('.prompt-print-value').count(), 0);
    await page.emulateMedia({ media: 'screen' });
    unknownModel = true;
    const modelMessages = ['Nessun modello configurato: puoi comunque esaminare i prompt.', 'No model configured: you can still inspect prompts.', 'Sin modelo configurado: puedes examinar los prompts.', 'Aucun modèle configuré : vous pouvez examiner les prompts.', 'Kein Modell konfiguriert: Prompts können geprüft werden.', 'Ingen modell konfigurerad: du kan granska prompterna.'];
    let languageIndex = 0;
    for (const [code, title, entry, missing] of [
     ['it','Anteprima della richiesta','Ingresso nello step','Scrivi un messaggio di prova per simulare la risposta dello studente.'],
     ['en','Request preview','Step entry','Enter a test message to simulate a student reply.'],
     ['es','Vista previa de la solicitud','Inicio del paso','Escribe un mensaje de prueba para simular la respuesta.'],
     ['fr','Aperçu de la requête','Début de l’étape','Saisissez un message de test pour simuler la réponse.'],
     ['de','Anfragevorschau','Schrittbeginn','Testnachricht eingeben, um eine Antwort zu simulieren.'],
     ['sv','Förhandsvisning av begäran','Stegets början','Skriv ett testmeddelande för att simulera elevens svar.'],
    ]) {
     await page.evaluate(code => localStorage.setItem('cb_lang', code), code);
     await page.reload();
     await chooseSection(page, 'QSA');
     const localized = page.getByRole('region', { name: title });
     await localized.getByText(modelMessages[languageIndex++], { exact: true }).waitFor();
     await localized.getByRole('combobox', { name: entry }).selectOption('reply');
     await localized.getByText(missing, { exact: true }).waitFor();
    }
   }
   await page.screenshot({ path: `/tmp/prompt-preview-${width}.png`, fullPage: true });
  } finally { await context.close(); await browser.close(); }
 });
}
