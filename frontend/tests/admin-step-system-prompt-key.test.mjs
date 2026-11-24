import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

// La "Mappa dei prompt" deve mostrare e salvare la chiave del prompt di
// sistema che il backend risolve come a runtime (audit B-01), e il select del
// mode deve offrire i mode del backend (NB-02). API intercettate, nessun DB.
const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3107';

const steps = [
    { id: 'obbstudio-intro', questionnaire_type: 'OBIETTIVO_STUDIO', label: 'Presentazione', sort_order: 0, prompt: 'Apri il percorso', system_prompt_mode: 'intro', color_theme: 'blue', system_prompt_key: 'prompt_obbstudio_intro' },
    { id: 'obbstudio-patto', questionnaire_type: 'OBIETTIVO_STUDIO', label: 'Patto', sort_order: 1, prompt: 'Proponi il patto', system_prompt_mode: 'obiettivo-interview', color_theme: 'blue', system_prompt_key: 'prompt_obiettivo_interview' },
];
const modes = [
    { mode: 'intro', system_prompt_key: null },
    { mode: 'generic', system_prompt_key: 'prompt_generic' },
    { mode: 'idea-focus', system_prompt_key: 'prompt_idea_focus' },
    { mode: 'obiettivo-interview', system_prompt_key: 'prompt_obiettivo_interview' },
    { mode: 'obiettivo-summary', system_prompt_key: 'prompt_obiettivo_summary' },
];
const configs = [
    { key: 'prompt_generic', value: 'Testo della chat generica', description: '' },
    { key: 'prompt_obiettivo_interview', value: 'Testo della conversazione Obiettivo', description: '' },
    { key: 'prompt_obbstudio_intro', value: 'Testo di apertura Obiettivo', description: '' },
];

const configEntry = (key, value, stepId, level = 'instrument') => ({
    key, kind: 'config', role: 'system_prompt', level, destination: 'model', when: 'every_turn',
    label: '', description: key, value, stored: true, default: value, shared: false,
    used_by: { instruments: ['OBIETTIVO_STUDIO'], steps: [{ instrument: 'OBIETTIVO_STUDIO', step_id: stepId, label: stepId }] },
    editor: { method: 'POST', path: '/admin/config' }, read_only: false,
});

const stepField = (step, field, value, destination, when) => ({
    key: `guided_step:${step.id}:${field}`, kind: 'guided_step', field, role: 'step_field', level: 'step', destination, when,
    value, stored: true, shared: false,
    used_by: { instruments: ['OBIETTIVO_STUDIO'], steps: [{ instrument: 'OBIETTIVO_STUDIO', step_id: step.id, label: step.label }] },
    editor: { method: 'PUT', path: `/admin/guided-steps/${step.id}`, field }, read_only: false,
});

const promptMap = {
    instrument: 'OBIETTIVO_STUDIO',
    instruments: [{ id: 'OBIETTIVO_STUDIO', step_count: 2 }],
    levels: {
        common: [],
        groups: [],
        instrument: [
            configEntry('prompt_obbstudio_intro', 'Testo di apertura Obiettivo', 'obbstudio-intro'),
            configEntry('prompt_obiettivo_interview', 'Testo della conversazione Obiettivo', 'obbstudio-patto'),
        ],
        steps: steps.map(step => ({
            id: step.id, label: step.label, label_i18n: {}, color_theme: step.color_theme, sort_order: step.sort_order,
            system_prompt_mode: step.system_prompt_mode, system_prompt_key: step.system_prompt_key,
            follow_up_mode: step.system_prompt_mode, fixed: false,
            entries: [
                stepField(step, 'label', step.label, 'student', 'student'),
                stepField(step, 'color_theme', step.color_theme, 'student', 'student'),
                stepField(step, 'system_prompt_mode', step.system_prompt_mode, 'context_filter', 'entry'),
                stepField(step, 'prompt', step.prompt, 'model', 'entry'),
            ],
            refs: [{ key: step.system_prompt_key, level: 'instrument', role: 'system_prompt', when: 'every_turn' }],
        })),
    },
};

async function fixture() {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const saved = [];
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        let data = [];
        if (url.pathname === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (url.pathname === '/api/admin/config/env-status') data = {};
        if (url.pathname === '/api/admin/config' && request.method() === 'GET') data = configs;
        if (url.pathname === '/api/admin/config' && request.method() === 'POST') {
            data = request.postDataJSON();
            saved.push(data);
        }
        if (url.pathname === '/api/admin/guided-steps') data = steps;
        if (url.pathname === '/api/admin/guided-steps/modes') data = modes;
        if (url.pathname === '/api/admin/prompt-map/instruments') data = promptMap.instruments;
        if (url.pathname === '/api/admin/prompt-map') data = promptMap;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/admin?section=prompt-map&instrument=OBIETTIVO_STUDIO`);
    return { page, saved, close: async () => { await context.close(); await browser.close(); } };
}

const systemPromptBlock = (page, key) => page.locator(`[data-entry-key="${key}"]`);

test('step prompt panel shows and saves the backend-resolved system prompt key', async () => {
    const f = await fixture();
    try {
        const { page, saved } = f;
        const block = systemPromptBlock(page, 'prompt_obiettivo_interview');
        await block.waitFor();
        assert.match(await block.innerText(), /Testo della conversazione Obiettivo/);
        assert.equal(await systemPromptBlock(page, 'prompt_generic').count(), 0);

        await block.getByRole('button', { name: 'Modifica' }).click();
        await block.locator('textarea').fill('Conversazione Obiettivo aggiornata');
        const posted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/admin/config');
        await block.getByRole('button', { name: 'Salva', exact: true }).click();
        await posted;
        assert.deepEqual(saved.map(item => item.key), ['prompt_obiettivo_interview']);
    } finally { await f.close(); }
});

test('guided steps mode select uses the backend modes and keeps the real mode', async () => {
    const f = await fixture();
    try {
        const { page } = f;
        await page.locator('#pm-step-obbstudio-patto > div button[aria-expanded]').first().click();
        for (const step of steps) {
            const card = page.locator(`[data-entry-key="guided_step:${step.id}:system_prompt_mode"]`);
            await card.getByRole('button', { name: 'Modifica' }).click();
        }
        await page.locator('select option[value="idea-focus"]').first().waitFor({ state: 'attached' });
        const selects = await page.evaluate(() => [...document.querySelectorAll('select')]
            .filter(select => [...select.options].some(option => option.value === 'idea-focus'))
            .map(select => ({ value: select.value, options: [...select.options].map(option => option.value) })));
        assert.deepEqual(selects.map(select => select.value), ['intro', 'obiettivo-interview']);
        for (const select of selects) {
            assert.deepEqual(select.options, modes.map(item => item.mode));
        }
    } finally { await f.close(); }
});
