import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3207';

// «Anteprima di ciò che riceve il modello» nella Mappa dei prompt: ordine dei
// messaggi, valori salvati, componenti e stato di errore. API intercettate.
const config = (key, value, extra = {}) => ({
    key, kind: 'config', role: 'system_prompt', level: 'common', destination: 'model', when: 'every_turn',
    label: '', description: key, value, stored: true, default: value, shared: false,
    used_by: { instruments: ['QSA'], steps: [] }, editor: { method: 'POST', path: '/admin/config' }, read_only: false, ...extra,
});
const stepField = (stepId, field, value) => ({
    key: `guided_step:${stepId}:${field}`, kind: 'guided_step', field, role: 'step_field', level: 'step',
    destination: field === 'prompt' ? 'model' : 'student', when: field === 'prompt' ? 'entry' : 'student',
    value, stored: true, shared: false, used_by: { instruments: ['QSA'], steps: [{ instrument: 'QSA', step_id: stepId, label: 'Fixture step' }] },
    editor: { method: 'PUT', path: `/admin/guided-steps/${stepId}`, field }, read_only: false,
});
const mapData = () => ({
    instrument: 'QSA', instruments: [{ id: 'QSA', step_count: 1 }],
    levels: {
        common: [config('prompt_generic', 'SAVED_SYSTEM')], groups: [], instrument: [],
        steps: [{
            id: 'preview-fixture', label: 'Fixture step', color_theme: 'blue', sort_order: 0, system_prompt_mode: 'generic',
            system_prompt_key: null, follow_up_mode: null, fixed: false,
            entries: [stepField('preview-fixture', 'label', 'Fixture step'), stepField('preview-fixture', 'color_theme', 'blue'), stepField('preview-fixture', 'prompt', 'SAVED_STEP')],
            refs: [{ key: 'prompt_generic', level: 'common', role: 'system_prompt', when: 'every_turn' }],
        }],
    },
});

for (const width of [1440, 390]) {
    test(`prompt request preview drafts, message order and errors at ${width}px`, async () => {
        const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        try {
            const page = await context.newPage();
            const requests = [];
            let fail = false;
            await page.addInitScript(() => { if (!localStorage.getItem('cb_lang')) localStorage.setItem('cb_lang', 'it'); });
            await page.route('**/api/**', async route => {
                const request = route.request();
                const url = new URL(request.url());
                const path = url.pathname;
                const body = ['POST', 'PUT', 'PATCH'].includes(request.method()) ? request.postDataJSON() : null;
                requests.push({ path, method: request.method(), body });
                let data = [];
                if (path === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
                if (path === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
                if (path === '/api/admin/config') data = [{ key: 'prompt_generic', value: 'SAVED_SYSTEM', description: '' }];
                if (path === '/api/admin/config/env-status') data = {};
                if (path === '/api/admin/presets') data = [];
                if (path === '/api/admin/prompt-map/instruments') data = [{ id: 'QSA', step_count: 1 }];
                if (path === '/api/admin/prompt-map') data = { ...mapData(), instrument: url.searchParams.get('instrument') || 'QSA' };
                if (path === '/api/admin/guided-steps/modes') data = [{ mode: 'generic', system_prompt_key: 'prompt_generic' }];
                if (path === '/api/admin/counselors') data = [];
                if (path === '/api/admin/questionnaire-results') data = [];
                if (path === '/api/admin/guided-step-questions') data = [];
                if (path.endsWith('/dry-run')) {
                    if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
                    data = {
                        envelope: { system_prompt_final: 'SAVED_SYSTEM', full_message: body.message, history: [{ role: 'user', content: 'PREVIOUS_USER' }, { role: 'assistant', content: 'PREVIOUS_ASSISTANT' }] },
                        components: { system_prompt: 'SAVED_SYSTEM', step_prompt: body.message, meta_system_prompt: 'META', counselor: 'COUNSELOR', history: [], cognitive_factors: 'EXCLUDED_SCORES' },
                        component_origins: { system_prompt: 'prompt_generic', step_prompt: 'guided_step:preview-fixture' },
                        component_flags: { cognitive_factors: false },
                        warnings: [{ code: 'retrieval_not_replayed', message: 'TECHNICAL_RETRIEVAL_DETAIL' }],
                        resolved: { provider: 'fixture', model: 'fixture-model', context_budget: {} },
                    };
                }
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
            });
            await page.goto(`${origin}/admin?section=prompt-map&instrument=QSA`);
            const step = page.locator('#pm-step-preview-fixture');
            await step.waitFor();
            await step.getByRole('button', { name: 'Anteprima di ciò che riceve il modello' }).click();
            const panel = page.getByRole('region', { name: 'Anteprima della richiesta' });
            await panel.getByText('fixture-model', { exact: false }).waitFor();
            assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).at(-1).body.questionnaire_type, 'QSA');
            await panel.getByRole('button', { name: 'Messaggi completi' }).click();
            assert.deepEqual((await panel.locator('details pre, pre').allTextContents()).slice(0, 4), ['SAVED_SYSTEM', 'PREVIOUS_USER', 'PREVIOUS_ASSISTANT', 'SAVED_STEP']);
            assert.equal(await panel.getByText('TECHNICAL_RETRIEVAL_DETAIL', { exact: false }).isVisible().catch(() => false), false);
            await panel.getByRole('button', { name: 'Per componenti' }).click();
            await panel.getByText('Recupero non eseguito', { exact: true }).waitFor();
            await panel.getByText('Dato assente', { exact: true }).waitFor();
            await panel.getByText('Escluso', { exact: true }).waitFor();
            await panel.getByRole('combobox', { name: 'Ingresso nello step' }).selectOption('reply');
            const before = requests.filter(r => r.path.endsWith('/dry-run')).length;
            await panel.getByText('Scrivi un messaggio di prova per simulare la risposta dello studente.', { exact: true }).waitFor();
            await page.waitForTimeout(300);
            assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).length, before);
            assert.equal(await panel.getByRole('button', { name: 'Copia richiesta' }).isDisabled(), true);
            await panel.getByRole('textbox', { name: 'Messaggio di prova' }).fill('STUDENT_REPLY');
            await panel.getByRole('button', { name: 'Messaggi completi' }).click();
            await panel.locator('pre').filter({ hasText: /^STUDENT_REPLY$/ }).waitFor();
            assert.equal(requests.filter(r => r.path.endsWith('/dry-run')).at(-1).body.use_phase_prompt, false);
            fail = true;
            await panel.getByRole('textbox', { name: 'Messaggio di prova' }).fill('FAILED_PREVIEW');
            await panel.getByText('Anteprima non disponibile. Il contenuto precedente non è aggiornato.', { exact: true }).waitFor();
            assert.equal(await panel.getByRole('button', { name: 'Copia richiesta' }).isDisabled(), true);
            assert.equal(requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/dry-run')).length, 0);
        } finally { await context.close(); await browser.close(); }
    });
}
