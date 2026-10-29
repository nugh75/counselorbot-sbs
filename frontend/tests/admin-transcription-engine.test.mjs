import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

// Admin → Audio transcription against a frontend dev server; the API is simulated.
const origin = process.env.TRANSCRIPTION_ENGINE_BASE_URL || 'http://127.0.0.1:3163';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); });
after(async () => { await browser?.close(); });

async function fixture({ width = 1440, lang = 'it', saved = { engine: 'faster-whisper', model: 'large-v3-turbo' }, reachable = true } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(15000);
    const writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(lang => localStorage.setItem('cb_lang', lang), lang);
    const available = [
        { id: 'small', engine: 'faster-whisper', loaded: true, bytes: 483000000 },
        { id: 'large-v3-turbo', engine: 'faster-whisper', loaded: true, bytes: 1620000000 },
        { id: 'large-v3', engine: 'faster-whisper', loaded: false, bytes: 3090000000 },
        { id: 'base', engine: 'whisper.cpp', loaded: false, bytes: 59707625 },
        { id: 'small', engine: 'whisper.cpp', loaded: false, bytes: 190085487 },
        { id: 'large-v3-turbo', engine: 'whisper.cpp', loaded: false, bytes: 574041195 },
    ];
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { username: 'audio-fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (path === '/api/orientation/status') data = { required: false, completed: true };
        if (path === '/api/admin/config/env-status') data = {};
        if (path === '/api/audio/models') data = {
            active: saved.model, default: 'large-v3-turbo', key: 'transcription_model',
            engine: saved.engine, default_engine: 'faster-whisper', engine_key: 'transcription_engine',
            default_models: { 'faster-whisper': 'large-v3-turbo', 'whisper.cpp': 'small' },
            available: reachable ? available : [], reachable,
        };
        if (path === '/api/admin/config' && request.method() === 'POST') {
            data = request.postDataJSON();
            writes.push(data);
            if (data.key === 'transcription_engine') saved.engine = data.value;
            if (data.key === 'transcription_model') saved.model = data.value;
        }
        await route.fulfill({ json: data });
    });
    return { page, context, writes, errors };
}

const radio = (page, group, value) => page.locator(`input[name="${group}"][value="${value}"]`);

for (const width of [390, 1440]) test(`${width}px: switching to whisper.cpp offers its own models and saves both keys`, async () => {
    const f = await fixture({ width });
    try {
        await f.page.goto(`${origin}/admin?tab=audio`);
        await f.page.getByText('Motore di trascrizione').waitFor();
        assert.ok(await radio(f.page, 'transcription-engine', 'faster-whisper').isChecked());
        assert.equal(await f.page.locator('input[name="transcription-model"]').count(), 3);
        assert.ok(await radio(f.page, 'transcription-model', 'large-v3-turbo').isChecked());
        assert.ok(await f.page.getByRole('button', { name: 'Salva', exact: true }).isDisabled());

        await radio(f.page, 'transcription-engine', 'whisper.cpp').check();
        const offered = await f.page.locator('input[name="transcription-model"]').evaluateAll(inputs => inputs.map(input => input.value));
        assert.deepEqual(offered, ['base', 'small', 'large-v3-turbo']);
        // large-v3-turbo exists on both engines, so the choice survives the switch.
        assert.ok(await radio(f.page, 'transcription-model', 'large-v3-turbo').isChecked());
        await f.page.getByText('Il più leggero, adatto a PC modesti').waitFor();
        await f.page.getByText(/60 MB · RAM ~0\.3 GB · CPU bassa · caricato a ogni richiesta/).waitFor();
        await radio(f.page, 'transcription-model', 'base').check();
        await f.page.getByRole('button', { name: 'Salva', exact: true }).click();
        await f.page.getByText('Salvato', { exact: true }).waitFor();
        assert.deepEqual(f.writes, [{ key: 'transcription_engine', value: 'whisper.cpp' }, { key: 'transcription_model', value: 'base' }]);
        assert.deepEqual(f.errors, []);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await f.context.close(); }
});

test('a model the new engine lacks falls back to that engine default', async () => {
    const f = await fixture({ lang: 'en', saved: { engine: 'faster-whisper', model: 'large-v3' } });
    try {
        await f.page.goto(`${origin}/admin?tab=audio`);
        await f.page.getByText('Transcription engine').waitFor();
        await radio(f.page, 'transcription-engine', 'whisper.cpp').check();
        assert.ok(await radio(f.page, 'transcription-model', 'small').isChecked());
        await f.page.getByText('Recommended on weak CPUs').waitFor();
        await radio(f.page, 'transcription-engine', 'faster-whisper').check();
        assert.ok(await radio(f.page, 'transcription-model', 'small').isChecked());
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('an unreachable service still shows the saved engine and model', async () => {
    const f = await fixture({ reachable: false, saved: { engine: 'whisper.cpp', model: 'base' } });
    try {
        await f.page.goto(`${origin}/admin?tab=audio`);
        await f.page.getByRole('alert').filter({ hasText: 'non raggiungibile' }).waitFor();
        assert.ok(await radio(f.page, 'transcription-engine', 'whisper.cpp').isChecked());
        assert.ok(await radio(f.page, 'transcription-model', 'base').isChecked());
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
