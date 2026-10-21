import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const origin = process.env.MODEL_SEARCH_BASE_URL || 'http://127.0.0.1:3153';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); });
after(async () => { await browser?.close(); });

async function fixture({ width = 1440, lang = 'it', dark = false, unavailable = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(15000);
    const writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const preset = { id: 1, name: 'Fixture', provider: 'openrouter', model: 'saved/custom-model', temperature: 0.4, max_tokens: 512, reasoning_budget: 3000, reasoning_effort: null, disable_thinking: false, notes: 'keep notes', is_active: true, provider_configured: true, reasoning_mandatory: false };
    const catalogs = { openrouter: ['google/gemini-3.8-flash', 'anthropic/claude-sonnet-5.5', 'vendor/other:free'], mistral: ['mistral-large-latest'] };
    await page.addInitScript(({ lang, dark }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { lang, dark });
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        let data = [];
        if (path === '/api/auth/me') data = { username: 'model-fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (path === '/api/orientation/status') data = { required: false, completed: true };
        if (path === '/api/admin/config/env-status') data = {};
        if (path === '/api/admin/api-keys') data = ['openrouter', 'mistral'].map(provider => ({ provider, configured: true, source: 'environment', editable: false }));
        if (path === '/api/admin/config') data = [{ key: 'active_provider', value: 'openrouter' }, { key: 'model_name', value: preset.model }];
        if (path === '/api/admin/presets') data = [preset];
        if (path === '/api/admin/models') {
            if (unavailable) return route.fulfill({ status: 503, json: { detail: 'synthetic unavailable' } });
            data = {
                models: catalogs[url.searchParams.get('provider')] || [],
                capabilities: {
                    'google/gemini-3.8-flash': { mandatory: true, supported_efforts: ['low', 'medium', 'high'], default_effort: 'medium', supports_reasoning: true },
                    'anthropic/claude-sonnet-5.5': { mandatory: true, supported_efforts: ['low', 'medium', 'high'], default_effort: 'high', supports_reasoning: true },
                },
            };
        }
        if (['POST', 'PUT'].includes(request.method())) {
            data = request.postDataJSON();
            writes.push({ path, body: data });
            if (path === '/api/admin/presets/1') Object.assign(preset, data);
        }
        await route.fulfill({ json: data });
    });
    return { page, context, writes, errors, preset };
}

for (const width of [390, 1440]) test(`presets ${width}px: searching preserves the selected model and all saved parameters`, async () => {
    const f = await fixture({ width, dark: width === 390 });
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).click();
        const search = f.page.locator('#preset_model_search'), select = f.page.locator('#preset_model');
        await f.page.locator('#preset_model_status').filter({ hasText: '4 di 4' }).waitFor();
        if (process.env.MODEL_SEARCH_SCREENSHOT_DIR) {
            await mkdir(process.env.MODEL_SEARCH_SCREENSHOT_DIR, { recursive: true });
            await f.page.screenshot({ path: `${process.env.MODEL_SEARCH_SCREENSHOT_DIR}/presets-${width}.png`, fullPage: true });
        }
        await search.fill('  GEMINI ');
        await f.page.locator('#preset_model_status').filter({ hasText: '1 di 4' }).waitFor();
        assert.equal(await select.inputValue(), f.preset.model);
        assert.deepEqual(f.writes, []);
        await search.fill('no-such-model');
        await f.page.locator('#preset_model_status').filter({ hasText: 'Nessun modello' }).waitFor();
        assert.equal(await select.inputValue(), f.preset.model);
        await search.press('Escape');
        assert.equal(await search.inputValue(), '');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).waitFor();
        assert.deepEqual(f.writes[0].body, { name: 'Fixture', provider: 'openrouter', model: 'saved/custom-model', temperature: 0.4, max_tokens: 512, disable_thinking: false, reasoning_budget: 3000, reasoning_effort: null, notes: 'keep notes', is_active: true });
        assert.deepEqual(f.errors, []);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await f.context.close(); }
});

test('preset: a late catalog response cannot replace the newly selected provider catalog', async () => {
    const f = await fixture();
    let release, started;
    const held = new Promise(resolve => { release = resolve; });
    const pending = new Promise(resolve => { started = resolve; });
    await f.page.route('**/api/admin/models?provider=openrouter', async route => {
        started();
        await held;
        try { await route.fulfill({ json: { models: ['late/wrong-model'] } }); } catch { /* request was aborted */ }
    });
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).click();
        await pending;
        await f.page.getByLabel('Provider', { exact: true }).selectOption('mistral');
        await f.page.locator('#preset_model option[value="mistral-large-latest"]').waitFor({ state: 'attached' });
        release();
        await f.page.locator('#preset_model').selectOption('mistral-large-latest');
        assert.equal(await f.page.locator('#preset_model option[value="late/wrong-model"]').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { release(); await f.context.close(); }
});

test('preset: a filtered model can be saved; provider changes clear the old model and search', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).click();
        await f.page.locator('#preset_model_search').fill('gemini');
        await f.page.locator('#preset_model option[value="google/gemini-3.8-flash"]').waitFor({ state: 'attached' });
        await f.page.locator('#preset_model').selectOption('google/gemini-3.8-flash');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).click();
        assert.equal(f.writes[0].body.model, 'google/gemini-3.8-flash');
        await f.page.getByLabel('Provider', { exact: true }).selectOption('mistral');
        await f.page.locator('#preset_model option[value="mistral-large-latest"]').waitFor({ state: 'attached' });
        assert.equal(await f.page.locator('#preset_model').inputValue(), '');
        assert.equal(await f.page.locator('#preset_model_search').inputValue(), '');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('preset: token advice, positive integer validation and empty automatic budgets', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).click();
        await f.page.getByText('Un limite sotto 2000 token', { exact: false }).waitFor();
        const tokens = f.page.getByLabel('Max token', { exact: true });
        await tokens.fill('-1');
        assert.equal(await f.page.getByRole('button', { name: 'Salva', exact: true }).isDisabled(), true);
        await tokens.fill('1.5');
        assert.equal(await f.page.getByRole('button', { name: 'Salva', exact: true }).isDisabled(), true);
        await tokens.fill('');
        await f.page.getByLabel('Budget reasoning', { exact: true }).fill('');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).waitFor();
        assert.equal(f.writes[0].body.max_tokens, null);
        assert.equal(f.writes[0].body.reasoning_budget, null);
        assert.equal(f.writes[0].body.reasoning_effort, null);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('preset: unavailable catalog still permits a manual model ID', async () => {
    const f = await fixture({ unavailable: true });
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).click();
        await f.page.getByRole('button', { name: 'Inserisci modello manualmente', exact: true }).click();
        await f.page.locator('#preset_model').fill('vendor/new-model');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('button', { name: 'Modifica Fixture', exact: true }).waitFor();
        assert.equal(f.writes[0].body.model, 'vendor/new-model');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('new preset: search selects a live model and empty budgets remain automatic', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        await f.page.getByRole('button', { name: 'Nuovo preset', exact: true }).click();
        await f.page.getByLabel('Nome', { exact: true }).fill('New fixture');
        await f.page.getByLabel('Provider', { exact: true }).selectOption('openrouter');
        await f.page.locator('#preset_model_search').fill('claude');
        await f.page.locator('#preset_model option[value="anthropic/claude-sonnet-5.5"]').waitFor({ state: 'attached' });
        await f.page.locator('#preset_model').selectOption('anthropic/claude-sonnet-5.5');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('button', { name: 'Nuovo preset', exact: true }).waitFor();
        assert.equal(f.writes[0].path, '/api/admin/presets');
        assert.equal(f.writes[0].body.model, 'anthropic/claude-sonnet-5.5');
        assert.equal(f.writes[0].body.max_tokens, null);
        assert.equal(f.writes[0].body.reasoning_budget, null);
        assert.equal(f.writes[0].body.reasoning_effort, null);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('preset: mandatory catalog model locks off and limits effort choices', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        await f.page.getByRole('button', { name: 'Nuovo preset', exact: true }).click();
        await f.page.getByLabel('Nome', { exact: true }).fill('Mandatory fixture');
        await f.page.getByLabel('Provider', { exact: true }).selectOption('openrouter');
        await f.page.locator('#preset_model_search').fill('claude');
        await f.page.locator('#preset_model option[value="anthropic/claude-sonnet-5.5"]').waitFor({ state: 'attached' });
        await f.page.locator('#preset_model').selectOption('anthropic/claude-sonnet-5.5');
        const off = f.page.getByLabel('No reasoning', { exact: true });
        assert.equal(await off.isDisabled(), true);
        assert.equal(await f.page.getByText('Questo modello impone il ragionamento', { exact: false }).count(), 1);
        const effort = f.page.locator('#preset_effort');
        assert.deepEqual(await effort.locator('option').allTextContents(), ['Auto (modello)', 'low', 'medium', 'high']);
        await effort.selectOption('high');
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByRole('button', { name: 'Nuovo preset', exact: true }).waitFor();
        assert.equal(f.writes[0].body.reasoning_effort, 'high');
        assert.equal(f.writes[0].body.disable_thinking, false);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

for (const [lang, phrase] of [['en', 'preset limit'], ['es', 'límite del preset'], ['fr', 'limite du préréglage'], ['de', 'Preset-Limit'], ['sv', 'Förinställningens gräns']]) test(`preset: token advice and empty search results are translated in ${lang}`, async () => {
    const f = await fixture({ lang });
    try {
        await f.page.goto(`${origin}/admin?tab=presets`);
        const actions = f.page.locator('tbody tr').getByRole('button');
        await actions.nth(0).waitFor();
        assert.equal(await actions.count(), 2);
        await actions.nth(0).click();
        await f.page.locator('#preset_token_help').filter({ hasText: phrase }).waitFor();
        await f.page.locator('#preset_model_search').fill('no-such-model');
        await f.page.locator('#preset_model_status').filter({ hasText: 'no-such-model' }).waitFor();
        assert.equal((await f.page.locator('#preset_token_help').textContent()).includes('admin.presets.'), false);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

for (const width of [390, 1440]) test(`system model ${width}px: search never writes config and unavailable recommendations are hidden`, async () => {
    const f = await fixture({ width });
    try {
        await f.page.goto(`${origin}/admin`);
        await f.page.locator('[data-testid="system-ai-fallback-section"] > summary').click();
        await f.page.locator('#system_ai_model_search').fill('  GEMINI ');
        await f.page.locator('#system_ai_model_status').filter({ hasText: '1 di 4' }).waitFor();
        assert.equal(await f.page.locator('#system_ai_model').inputValue(), f.preset.model);
        assert.deepEqual(f.writes, []);
        assert.equal(await f.page.getByRole('button', { name: /Gemini 3.8 Flash/ }).count(), 1);
        assert.equal(await f.page.getByRole('button', { name: /DeepSeek V4.1 Flash/ }).count(), 0);
        await f.page.locator('#system_ai_model').selectOption('google/gemini-3.8-flash');
        await f.page.getByText('Salvato', { exact: true }).waitFor();
        assert.equal(f.writes.at(-1).body.value, 'google/gemini-3.8-flash');
        assert.deepEqual(f.errors, []);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await f.context.close(); }
});
