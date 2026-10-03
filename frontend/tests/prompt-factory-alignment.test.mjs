import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3107';
const labels = {
    it: ['Allinea prompt di fabbrica', 'Allineamento dei prompt di fabbrica', 'Conferma allineamento', 'Ricarica anteprima', 'Chiudi', 'Nessun prompt di fabbrica da aggiornare.', 'Aggiornati 2 prompt.'],
    en: ['Align factory prompts', 'Factory prompt alignment', 'Confirm alignment', 'Reload preview', 'Close', 'No factory prompts to update.', 'Updated 2 prompts.'],
    es: ['Alinear prompts de fábrica', 'Alineación de prompts de fábrica', 'Confirmar alineación', 'Recargar vista previa', 'Cerrar', 'No hay prompts de fábrica por actualizar.', 'Se actualizaron 2 prompts.'],
    fr: ['Aligner les prompts d’origine', 'Alignement des prompts d’origine', 'Confirmer l’alignement', 'Recharger l’aperçu', 'Fermer', 'Aucun prompt d’origine à mettre à jour.', '2 prompts mis à jour.'],
    de: ['Standard-Prompts abgleichen', 'Abgleich der Standard-Prompts', 'Abgleich bestätigen', 'Vorschau neu laden', 'Schließen', 'Keine Standard-Prompts zu aktualisieren.', '2 Prompts aktualisiert.'],
    sv: ['Uppdatera standardprompter', 'Uppdatering av standardprompter', 'Bekräfta uppdateringen', 'Ladda om förhandsvisningen', 'Stäng', 'Inga standardprompter att uppdatera.', '2 prompter uppdaterades.'],
};

async function fixture(language, width = 390) {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const requests = [];
    const state = { applied: false, failPreview: false, failApply: 0, holdApply: null };
    let steps = [
        { id: 'cognitive', questionnaire_type: 'QSA', label: 'Fixture step', sort_order: 0, prompt: 'Current English step instruction.', system_prompt_mode: 'generic', color_theme: 'blue' },
        { id: 'affective', questionnaire_type: 'QSA', label: 'Second fixture step', sort_order: 1, prompt: 'Second English step instruction.', system_prompt_mode: 'generic', color_theme: 'blue' },
    ];
    await page.addInitScript(language => localStorage.setItem('cb_lang', language), language);
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const body = ['POST', 'PUT', 'PATCH'].includes(request.method()) ? request.postDataJSON() : null;
        requests.push({ path, method: request.method(), body });
        let data = [];
        if (path === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (path === '/api/admin/config') data = [{ key: 'prompt_generic', value: 'Current English system instruction.', description: '' }];
        if (path === '/api/admin/config/env-status') data = {};
        if (path === '/api/admin/guided-steps') {
            if (request.method() === 'POST') {
                steps.push(body);
                data = body;
            } else data = steps;
        }
        if (path === '/api/admin/guided-steps/reorder') {
            steps = steps.map(step => ({ ...step, sort_order: body.find(item => item.id === step.id)?.sort_order ?? step.sort_order }));
        }
        if (path.startsWith('/api/admin/guided-steps/') && request.method() === 'DELETE') {
            steps = steps.filter(step => step.id !== path.split('/').at(-1));
        }
        if (path.endsWith('/dry-run')) data = { envelope: { system_prompt_final: 'SYSTEM', full_message: 'STEP', history: [] }, components: {}, component_flags: {}, resolved: { provider: 'fixture', model: 'fixture', context_budget: {} }, warnings: [] };
        if (path === '/api/admin/prompt-factory-alignment/preview') {
            if (state.failPreview) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
            data = { review_hash: 'a'.repeat(64), changes: state.applied ? [] : [
                { scope: 'guided_step', key: 'cognitive', before: 'Current English step instruction.', after: 'Updated English step instruction.' },
                { scope: 'config', key: 'prompt_generic', before: 'Current English system instruction.', after: 'Updated English system instruction.' },
            ], preserved: [{ scope: 'config', key: 'prompt_savickas_interview', reason: 'personalised' }] };
        }
        if (path === '/api/admin/prompt-factory-alignment/apply') {
            if (state.holdApply) await state.holdApply;
            if (state.failApply) return route.fulfill({ status: state.failApply, contentType: 'application/json', body: '{}' });
            state.applied = true;
            data = { updated: 2, config_values: { prompt_generic: 'Updated English system instruction.' }, step_prompts: { cognitive: 'Updated English step instruction.' } };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/admin`);
    await page.getByRole('button', { name: labels[language][0], exact: true }).waitFor();
    return { browser, context, page, requests, state, close: async () => { await context.close(); await browser.close(); } };
}

for (const language of Object.keys(labels)) {
    test(`review, cancel, confirm and no-op in ${language} at 390px`, async () => {
        const f = await fixture(language);
        const [action, title, confirm, reload, close, empty, success] = labels[language];
        try {
            const { page, requests } = f;
            await page.getByRole('button', { name: action, exact: true }).click();
            let panel = page.getByRole('region', { name: title });
            await panel.locator('summary').filter({ hasText: /cognitive/ }).click();
            await panel.getByText('Current English step instruction.', { exact: true }).waitFor();
            await panel.getByText('Updated English step instruction.', { exact: true }).waitFor();
            assert.equal(await panel.getByRole('button', { name: confirm }).isEnabled(), true);
            assert.equal(requests.filter(r => r.method === 'POST').length, 0);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
            await panel.getByRole('button', { name: close, exact: true }).click();
            assert.equal(await page.getByRole('region', { name: title }).count(), 0);
            assert.equal(requests.filter(r => r.method === 'POST').length, 0);
            await page.getByRole('button', { name: action, exact: true }).click();
            panel = page.getByRole('region', { name: title });
            await panel.getByRole('button', { name: confirm }).click();
            await panel.getByText(success, { exact: false }).waitFor();
            const writes = requests.filter(r => r.path.endsWith('/prompt-factory-alignment/apply'));
            assert.equal(writes.length, 1);
            assert.deepEqual(writes[0].body, { review_hash: 'a'.repeat(64) });
            await panel.getByRole('button', { name: reload }).click();
            await panel.getByText(empty, { exact: true }).waitFor();
            assert.equal(await panel.getByRole('button', { name: confirm }).count(), 0);
            await panel.getByRole('button', { name: close, exact: true }).click();
            await page.getByRole('button', { name: 'QSA', exact: true }).click();
            await page.getByText('Updated English step instruction.', { exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: action, exact: true }).isEnabled(), true);
        } finally { await f.close(); }
    });
}

test('all tabs share one button; drafts, errors, stale approval and duplicate confirmation at 1440px', async () => {
    const f = await fixture('it', 1440);
    try {
        const { page, requests, state } = f;
        const action = page.getByRole('button', { name: labels.it[0], exact: true });
        for (const name of ['QSA', 'QSAr', 'ZTPI', 'Savickas', 'Evento significativo di studio', 'Evento significativo professionale', 'Il mio obiettivo di apprendimento', 'Obiettivi per la mia classe', 'QPCS', 'QPCC', 'QAP']) {
            await page.getByRole('button', { name, exact: true }).click();
            assert.equal(await action.count(), 1);
            assert.equal(await action.isEnabled(), true);
        }
        await page.getByRole('button', { name: 'QSA', exact: true }).click();
        await page.getByRole('button', { name: 'Modifica', exact: true }).first().click();
        assert.equal(await action.isDisabled(), true);
        await page.getByRole('button', { name: 'Annulla', exact: true }).click();
        assert.equal(await action.isEnabled(), true);
        state.failPreview = true;
        await action.click();
        let panel = page.getByRole('region', { name: labels.it[1] });
        await panel.getByRole('alert').getByText('Impossibile caricare il confronto. Riprova.', { exact: true }).waitFor();
        assert.equal(await panel.getByRole('button', { name: labels.it[2] }).count(), 0);
        state.failPreview = false;
        await panel.getByRole('button', { name: labels.it[3] }).click();
        const confirm = panel.getByRole('button', { name: labels.it[2] });
        state.failApply = 409;
        await confirm.click();
        await panel.getByRole('alert').getByText('I prompt sono cambiati dopo l’anteprima. Ricarica il confronto prima di confermare.', { exact: true }).waitFor();
        assert.equal(await confirm.isDisabled(), true);
        state.failApply = 0;
        await panel.getByRole('button', { name: labels.it[3] }).click();
        await panel.locator('summary').filter({ hasText: /cognitive/ }).click();
        await panel.getByText('Updated English step instruction.', { exact: true }).waitFor();
        await panel.screenshot({ path: '/tmp/prompt-factory-alignment-desktop.png' });
        let release;
        state.holdApply = new Promise(resolve => { release = resolve; });
        await confirm.evaluate(el => { el.click(); el.click(); });
        await panel.getByText('Applicazione dell’allineamento…', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Modifica', exact: true }).first().isDisabled(), true);
        assert.equal(requests.filter(r => r.path.endsWith('/prompt-factory-alignment/apply')).length, 2);
        release();
        await panel.getByText(labels.it[6], { exact: false }).waitFor();
        await page.getByText('Updated English step instruction.', { exact: true }).waitFor();
        assert.equal(await action.isEnabled(), true);
        await panel.getByRole('button', { name: labels.it[4], exact: true }).click();
        await page.getByRole('button', { name: 'Step guidati', exact: true }).click();
        await page.locator('textarea').filter({ hasText: 'Updated English step instruction.' }).fill('Unsaved English draft.');
        assert.equal(await action.isDisabled(), true);
        assert.equal(requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/dry-run') && !r.path.endsWith('/prompt-factory-alignment/apply')).length, 0);
    } finally { await f.close(); }
});

test('saved step creation, ordering and deletion unlock alignment; ordering preserves an unsaved prompt', async () => {
    const f = await fixture('it', 1440);
    try {
        const { page, requests } = f;
        const action = page.getByRole('button', { name: labels.it[0], exact: true });
        await page.getByRole('button', { name: 'QSA', exact: true }).click();
        await page.getByRole('button', { name: 'Step guidati', exact: true }).click();
        const first = page.locator('.glass-panel').filter({ has: page.getByRole('heading', { name: 'Fixture step', exact: true }) });
        await first.locator('textarea').fill('Unsaved English draft.');
        await first.getByTitle('Sposta giù', { exact: true }).click();
        await page.getByText('Salvato', { exact: true }).first().waitFor();
        assert.equal(await action.isDisabled(), true);
        assert.equal(await first.locator('textarea').inputValue(), 'Unsaved English draft.');
        await first.locator('textarea').fill('Current English step instruction.');
        await action.waitFor();
        assert.equal(await action.isEnabled(), true);
        await page.getByRole('button', { name: 'Aggiungi Step', exact: true }).click();
        assert.equal(await action.isDisabled(), true);
        await page.getByPlaceholder('es. analisi-metodo', { exact: true }).fill('custom-step');
        await page.getByPlaceholder('es. 4. Analisi del Metodo', { exact: true }).fill('New custom step');
        const form = page.locator('.glass-panel').filter({ has: page.getByRole('button', { name: 'Crea Step', exact: true }) });
        await form.locator('textarea').fill('Custom English instruction.');
        await page.getByRole('button', { name: 'Crea Step', exact: true }).click();
        const custom = page.locator('.glass-panel').filter({ has: page.getByRole('heading', { name: 'New custom step', exact: true }) });
        await custom.waitFor();
        assert.equal(await action.isEnabled(), true);
        page.once('dialog', dialog => dialog.accept());
        await custom.getByTitle('Elimina', { exact: true }).click();
        await custom.waitFor({ state: 'detached' });
        assert.equal(await action.isEnabled(), true);
        assert.equal(requests.filter(r => r.path.endsWith('/reorder')).length, 1);
        assert.equal(requests.filter(r => r.path.endsWith('/prompt-factory-alignment/apply')).length, 0);
    } finally { await f.close(); }
});
