import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3107';

const labels = {
    it: ['Allinea prompt di fabbrica', 'Allineamento dei prompt di fabbrica', /^Applica selezione \(\d+\)$/, 'Ricarica anteprima', 'Chiudi', 'Nessun prompt di fabbrica da aggiornare.', 'Aggiornati 2 prompt.'],
    en: ['Align factory prompts', 'Factory prompt alignment', /^Apply selection \(\d+\)$/, 'Reload preview', 'Close', 'No factory prompts to update.', 'Updated 2 prompts.'],
    es: ['Alinear prompts de fábrica', 'Alineación de prompts de fábrica', /^Aplicar selección \(\d+\)$/, 'Recargar vista previa', 'Cerrar', 'No hay prompts de fábrica por actualizar.', 'Se actualizaron 2 prompts.'],
    fr: ['Aligner les prompts d’origine', 'Alignement des prompts d’origine', /^Appliquer la sélection \(\d+\)$/, 'Recharger l’aperçu', 'Fermer', 'Aucun prompt d’origine à mettre à jour.', '2 prompts mis à jour.'],
    de: ['Standard-Prompts abgleichen', 'Abgleich der Standard-Prompts', /^Auswahl anwenden \(\d+\)$/, 'Vorschau neu laden', 'Schließen', 'Keine Standard-Prompts zu aktualisieren.', '2 Prompts aktualisiert.'],
    sv: ['Uppdatera standardprompter', 'Uppdatering av standardprompter', /^Tillämpa val \(\d+\)$/, 'Ladda om förhandsvisningen', 'Stäng', 'Inga standardprompter att uppdatera.', '2 prompter uppdaterades.'],
};

async function fixture(language, width = 390) {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
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
        if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        if (path === '/api/orientation/status') data = { required: false, completed: true };
        if (path === '/api/user/access') data = { groups: ['admins'], is_admin: true, features: {} };
        if (path === '/api/me/ai-source') data = { source: null };
        if (path === '/api/admin/config') data = [{ key: 'prompt_generic', value: 'Current English system instruction.', description: '' }];
        if (path === '/api/admin/config/env-status') data = {};
        if (path === '/api/admin/prompt-health') data = { run: null, pending_proposals: 0 };
        if (path === '/api/admin/prompt-health/map') data = {
            paths: [{ instrument: 'QSA', steps: [{ id: 'cognitive', label: 'Fattori cognitivi', prompts: ['guided_step:QSA:cognitive:prompt'] }] }],
            prompt_statuses: { 'guided_step:QSA:cognitive:prompt': 'factory' }, prompt_levels: { 'guided_step:QSA:cognitive:prompt': 'step' },
        };
        if (path === '/api/admin/prompt-health/llm') data = { findings: [] };
        if (path === '/api/admin/prompt-health/llm/settings') data = { provider: '', model: '', configured: false, providers: [], max_calls_per_run: 0 };
        if (path === '/api/admin/prompt-map/instruments') data = [{ id: 'QSA', step_count: 2 }];
        if (path === '/api/admin/prompt-map') data = {
            instrument: 'QSA', instruments: [{ id: 'QSA', step_count: 2 }],
            levels: { common: [], groups: [], instrument: [], steps: [
                { id: 'cognitive', label: 'Fattori cognitivi', color_theme: 'blue', sort_order: 1, system_prompt_mode: 'generic', system_prompt_key: null, follow_up_mode: null, fixed: false, entries: [], refs: [] },
                { id: 'conclusion', label: 'conclusion', color_theme: null, sort_order: null, system_prompt_mode: null, system_prompt_key: null, follow_up_mode: null, fixed: true, entries: [], refs: [] },
            ] },
        };
        if (path === '/api/admin/guided-steps/modes') data = [{ mode: 'intro', system_prompt_key: null }, { mode: 'generic', system_prompt_key: 'prompt_generic' }];
        if (path === '/api/admin/presets') data = [];
        if (path === '/api/admin/prompt-health/usage') data = { prompts: [], steps: [], never_used: [], turns: 0, retention_days: 0, tracking_since: null, partial: false };
        if (path === '/api/admin/prompt-health/proposals') data = { proposals: [], ignored: [], pending_count: 0 };
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
    // Next dev can return a transient 500 while compiling /admin; retry the document.
    for (let attempt = 0; attempt < 3; attempt++) {
        const response = await page.goto(`${origin}/admin?tab=promptHealth`);
        if (response && response.status() < 500) break;
        await page.waitForTimeout(1500);
    }
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
            await panel.waitFor();
            await panel.locator('summary').first().click();
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
            assert.deepEqual(writes[0].body, { review_hash: 'a'.repeat(64), selected: [
                { scope: 'guided_step', key: 'cognitive' },
                { scope: 'config', key: 'prompt_generic' },
            ] });
            await panel.getByRole('button', { name: reload }).click();
            await panel.getByText(empty, { exact: true }).waitFor();
            assert.equal(await panel.getByRole('button', { name: confirm }).count(), 0);
            await panel.getByRole('button', { name: close, exact: true }).click();
            assert.equal(await page.getByRole('region', { name: title }).count(), 0);
            assert.equal(await page.getByRole('button', { name: action, exact: true }).isEnabled(), true);
        } finally { await f.close(); }
    });
}

test('alignment panel handles preview errors, stale approval and duplicate confirmation at 1440px', async () => {
    const f = await fixture('it', 1440);
    try {
        const { page, requests, state } = f;
        const action = page.getByRole('button', { name: labels.it[0], exact: true });
        state.failPreview = true;
        await action.click();
        const panel = page.getByRole('region', { name: labels.it[1] });
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
        await panel.locator('summary').first().click();
        await panel.getByText('Updated English step instruction.', { exact: true }).waitFor();
        let release;
        state.holdApply = new Promise(resolve => { release = resolve; });
        await confirm.evaluate(el => { el.click(); el.click(); });
        await panel.getByText('Applicazione dell’allineamento…', { exact: true }).waitFor();
        assert.equal(requests.filter(r => r.path.endsWith('/prompt-factory-alignment/apply')).length, 2);
        release();
        await panel.getByText(labels.it[6], { exact: false }).waitFor();
        assert.equal(await action.isEnabled(), true);
        assert.equal(requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/dry-run') && !r.path.endsWith('/prompt-factory-alignment/apply')).length, 0);
    } finally { await f.close(); }
});

test('guided steps are managed from the prompt map, not the old configuration sections', async () => {
    const f = await fixture('it', 1440);
    try {
        const { page } = f;
        await page.goto(`${origin}/admin?section=prompt-map`);
        await page.getByText('Fattori cognitivi').first().waitFor();
        assert.equal(await page.getByRole('button', { name: 'Elimina lo step «Fattori cognitivi»' }).count(), 1);
        assert.equal(await page.getByRole('button', { name: /Sposta (su|giù) «Fattori cognitivi»/ }).count(), 2);
        assert.ok(await page.getByRole('button', { name: /Crea step|Aggiungi step/i }).count() > 0);
        assert.equal(await page.getByRole('button', { name: 'Step guidati', exact: true }).count(), 0, 'the classic step editor is gone');
    } finally { await f.close(); }
});
