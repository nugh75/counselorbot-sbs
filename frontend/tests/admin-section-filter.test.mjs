import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3107';
const labels = {
    it: ['Sezione', 'Impostazioni', 'Strumenti', 'Cerca sezione…', 'Nessuna sezione trovata', 'Generale'],
    en: ['Section', 'Settings', 'Tools', 'Search sections…', 'No sections found', 'General'],
    es: ['Sección', 'Ajustes', 'Herramientas', 'Buscar sección…', 'No se encontró ninguna sección', 'General'],
    fr: ['Section', 'Paramètres', 'Outils', 'Rechercher une section…', 'Aucune section trouvée', 'Général'],
    de: ['Bereich', 'Einstellungen', 'Werkzeuge', 'Bereich suchen…', 'Kein Bereich gefunden', 'Allgemein'],
    sv: ['Avsnitt', 'Inställningar', 'Verktyg', 'Sök avsnitt…', 'Inga avsnitt hittades', 'Allmänt'],
};

async function fixture(language, { width = 1440, path = '/admin' } = {}) {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(language => localStorage.setItem('cb_lang', language), language);
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (url.pathname === '/api/admin/config/env-status') data = {};
        if (url.pathname === '/api/admin/guided-steps') data = [{ id: 'fixture', questionnaire_type: 'QSA', label: 'Fixture step', sort_order: 0, prompt: 'Fixture prompt', system_prompt_mode: 'generic', color_theme: 'blue' }];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}${path}`);
    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.waitFor();
    return { page, trigger, close: async () => { await context.close(); await browser.close(); } };
}

const sectionParam = page => page.evaluate(() => new URLSearchParams(window.location.search).get('section'));

for (const language of Object.keys(labels)) {
    test(`grouped, searchable section filter in ${language} at 390px`, async () => {
        const [label, settings, tools, search, empty, general] = labels[language];
        const f = await fixture(language, { width: 390 });
        try {
            const { page, trigger } = f;
            await page.getByRole('button', { name: `${label} ${general}`, exact: true }).waitFor();
            await trigger.click();
            const listbox = page.getByRole('listbox', { name: label });
            await listbox.getByRole('group', { name: settings, exact: true }).getByRole('option', { name: general, exact: true }).waitFor();
            assert.equal(await listbox.getByRole('group', { name: tools, exact: true }).getByRole('option').count(), 11);
            assert.equal(await listbox.getByRole('option').count(), 13);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
            const input = page.getByRole('combobox', { name: search });
            await input.fill('zzz');
            await listbox.getByText(empty, { exact: true }).waitFor();
            assert.equal(await listbox.getByRole('option').count(), 0);
            await input.press('Escape');
            assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
        } finally { await f.close(); }
    });
}

test('search by full name, keyboard choice and URL persistence', async () => {
    const f = await fixture('it');
    try {
        const { page, trigger } = f;
        await trigger.click();
        const input = page.getByRole('combobox', { name: 'Cerca sezione…' });
        // The full name is searchable even though the option shows only the acronym.
        await input.fill('zimbardo');
        assert.deepEqual(await page.getByRole('listbox', { name: 'Sezione' }).getByRole('option').allTextContents(), ['ZTPI']);
        await input.press('Enter');
        await page.getByRole('heading', { name: /^ZTPI — / }).waitFor();
        assert.equal(await sectionParam(page), 'ztpi');

        await trigger.focus();
        await trigger.press('ArrowDown');
        await page.getByRole('combobox', { name: 'Cerca sezione…' }).fill('qsa');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: /^QSAr — / }).waitFor();
        assert.equal(await sectionParam(page), 'qsar');

        await page.reload();
        await page.getByRole('heading', { name: /^QSAr — / }).waitFor();

        await trigger.click();
        await page.getByRole('listbox', { name: 'Sezione' }).getByRole('option', { name: 'Generale', exact: true }).click();
        assert.equal(await sectionParam(page), null);
    } finally { await f.close(); }
});

test('shared link opens its section, other tabs drop it, unknown section falls back to general', async () => {
    let f = await fixture('it', { path: '/admin?section=qap' });
    try {
        await f.page.getByRole('heading', { name: /^QAP — / }).waitFor();
        await f.page.getByRole('button', { name: 'Log Conversazioni', exact: true }).click();
        assert.equal(await sectionParam(f.page), null);
    } finally { await f.close(); }
    f = await fixture('it', { path: '/admin?section=removed' });
    try {
        assert.match(await f.trigger.textContent(), /Generale/);
    } finally { await f.close(); }
});
