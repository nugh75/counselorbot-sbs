import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.PROMPT_PREVIEW_BASE_URL || 'http://127.0.0.1:3107';
const labels = {
    it: ['Sezione', 'Impostazioni', 'Strumenti — vista classica', 'Cerca sezione…', 'Nessuna sezione trovata', 'Generale'],
    en: ['Section', 'Settings', 'Tools — classic view', 'Search sections…', 'No sections found', 'General'],
    es: ['Sección', 'Ajustes', 'Herramientas — vista clásica', 'Buscar sección…', 'No se encontró ninguna sección', 'General'],
    fr: ['Section', 'Paramètres', 'Outils — vue classique', 'Rechercher une section…', 'Aucune section trouvée', 'Général'],
    de: ['Bereich', 'Einstellungen', 'Werkzeuge — klassische Ansicht', 'Bereich suchen…', 'Kein Bereich gefunden', 'Allgemein'],
    sv: ['Avsnitt', 'Inställningar', 'Verktyg — klassisk vy', 'Sök avsnitt…', 'Inga avsnitt hittades', 'Allmänt'],
};
// [prompt map, global directives, student AI title, student AI intro, platform API keys intro]
const generalLabels = {
    it: ['Mappa dei prompt', 'Direttive Globali', 'API personali e ChatGPT', 'Cosa studenti e docenti possono collegare nell’Area studente o nell’Area docenti e come vengono protetti i dati inviati ai provider esterni.', 'Stato, origine e verifica delle credenziali usate dai provider esterni.'],
    en: ['Prompt map', 'Global Directives', 'Personal APIs and ChatGPT', 'What students and teachers can connect in the Student area or Teacher area, and how data sent to external providers is protected.', 'Status, source, and verification of credentials used by external providers.'],
    es: ['Mapa de prompts', 'Directivas Globales', 'API personales y ChatGPT', 'Qué pueden conectar estudiantes y docentes en el Área del estudiante o el Área docente y cómo se protegen los datos enviados a proveedores externos.', 'Estado, origen y verificación de las credenciales de proveedores externos.'],
    fr: ['Carte des prompts', 'Directives Globales', 'API personnelles et ChatGPT', 'Ce que les élèves et les enseignants peuvent connecter dans l’Espace élève ou l’Espace enseignant, et comment les données envoyées aux prestataires externes sont protégées.', 'État, origine et vérification des identifiants des prestataires externes.'],
    de: ['Prompt-Karte', 'Globale Direktiven', 'Eigene APIs und ChatGPT', 'Was Lernende und Lehrkräfte im Bereich für Lernende oder im Lehrkräftebereich verbinden können und wie an externe Anbieter gesendete Daten geschützt werden.', 'Status, Quelle und Prüfung der Zugangsdaten externer Anbieter.'],
    sv: ['Promptkarta', 'Globala Direktiv', 'Egna API:er och ChatGPT', 'Vad elever och lärare kan koppla i elevområdet eller lärarområdet och hur data som skickas till externa leverantörer skyddas.', 'Status, källa och verifiering av inloggningsuppgifter för externa leverantörer.'],
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
        if (url.pathname === '/api/admin/chatgpt/settings') data = { enabled: false, ready: false, reason: 'notConfigured', key_source: 'managed' };
        if (url.pathname === '/api/admin/personal-api-policy') data = { enabled: false, encryption_ready: true, reason: null };
        if (url.pathname === '/api/admin/external-privacy') data = { mode: 'local', local_model: 'fixture-model' };
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
            // Impostazioni: Generale first, then Mappa dei prompt, then Direttive globali.
            const [promptMap, directives] = generalLabels[language];
            const settingsOptions = await listbox.getByRole('group', { name: settings, exact: true }).getByRole('option').allTextContents();
            assert.deepEqual(settingsOptions.map(text => text.startsWith(promptMap) ? promptMap : text), [general, promptMap, directives]);
            assert.equal(await listbox.getByRole('option').count(), 14);
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

for (const language of Object.keys(labels)) {
    for (const width of [390, 1440]) {
        test(`student AI settings form one block in ${language} at ${width}px`, async () => {
            const f = await fixture(language, { width });
            try {
                const { page } = f;
                const [, , title, intro, apiKeysIntro] = generalLabels[language];
                const block = page.getByRole('region', { name: title, exact: true });
                await block.getByText(intro, { exact: true }).waitFor();
                await block.getByTestId('chatgpt-settings').getByRole('button').first().waitFor();
                // Order inside the block: personal APIs, ChatGPT, external-provider privacy.
                const order = await block.locator('[data-testid="personal-api-settings"], [data-testid="chatgpt-settings"], [data-testid="external-privacy-settings"]').evaluateAll(nodes => nodes.map(node => node.dataset.testid));
                assert.deepEqual(order, ['personal-api-settings', 'chatgpt-settings', 'external-privacy-settings']);
                // The platform API keys belong to the administrator and stay outside the block.
                assert.equal(await block.getByText(apiKeysIntro, { exact: true }).count(), 0);
                await page.getByText(apiKeysIntro, { exact: true }).waitFor();
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
                if (language === 'it') await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/admin-general-${width}.png`, fullPage: true });
            } finally { await f.close(); }
        });
    }
}
