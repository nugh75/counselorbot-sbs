import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

// Vista admin "Mappa dei prompt": livelli dal comune al particolare, modifica
// sul posto tramite le API esistenti, conferma per i testi condivisi e popup
// della persona del counselor. API intercettate, nessun DB.
const origin = process.env.PROMPT_MAP_BASE_URL || 'http://127.0.0.1:3107';

const users = (ids) => ids.map(id => ({ instrument: 'QSA', step_id: id, label: id }));
const config = (key, value, extra = {}) => ({
    key, kind: 'config', role: 'system_prompt', level: 'instrument', destination: 'model', when: 'every_turn',
    label: '', description: key, value, stored: true, default: value, shared: false,
    used_by: { instruments: ['QSA'], steps: [] }, editor: { method: 'POST', path: '/admin/config' }, read_only: false, ...extra,
});
const stepField = (stepId, field, value, destination, when) => ({
    key: `guided_step:${stepId}:${field}`, kind: 'guided_step', field, role: 'step_field', level: 'step', destination, when,
    value, stored: true, shared: false, used_by: { instruments: ['QSA'], steps: users([stepId]) },
    editor: { method: 'PUT', path: `/admin/guided-steps/${stepId}`, field }, read_only: false,
    ...(field === 'label' ? { translations: { en: 'Cognitive factors' } } : {}),
});

const promptMap = {
    instrument: 'QSA',
    instruments: [{ id: 'QSA', step_count: 2 }, { id: 'EVENTO_STUDIO', step_count: 9 }],
    levels: {
        common: [
            {
                key: 'counselor_persona', kind: 'counselor_persona', role: 'persona', level: 'common', destination: 'model', when: 'every_turn',
                value: [{ id: 7, name: 'Iride', persona: 'Sei Iride.' }], stored: true, shared: true,
                used_by: { instruments: ['QSA'], steps: [] }, editor: { method: 'PUT', path: '/admin/counselors/{id}', field: 'persona' }, read_only: true,
            },
            config('directive_context', '[CONTEXT] Piattaforma.', { role: 'directive', level: 'common', used_by: { instruments: ['QSA', 'EVENTO_STUDIO'], steps: [] } }),
        ],
        groups: [{
            instruments: ['QSA', 'IDEA'],
            entries: [config('text_guided_conclusion', 'Hai completato il percorso.', {
                role: 'phase_text', level: 'group', destination: 'student', when: 'student', shared: true, translations: { en: 'Done.' },
                used_by: { instruments: ['QSA', 'IDEA'], steps: [] },
            })],
        }],
        instrument: [
            config('prompt_meta_QSA', 'Meta QSA', { role: 'meta' }),
            config('prompt_factor', 'Analizza i fattori.', { when: 'entry', shared: true, used_by: { instruments: ['QSA'], steps: users(['cognitive', 'affective']) } }),
        ],
        steps: [
            {
                id: 'cognitive', label: 'Fattori cognitivi', label_i18n: { en: 'Cognitive factors' }, color_theme: 'blue', sort_order: 1,
                system_prompt_mode: 'factor', system_prompt_key: 'prompt_factor', follow_up_mode: 'factor-qa', fixed: false,
                entries: [
                    stepField('cognitive', 'label', 'Fattori cognitivi', 'student', 'student'),
                    stepField('cognitive', 'color_theme', 'blue', 'student', 'student'),
                    stepField('cognitive', 'prompt', 'Analizza i fattori cognitivi.', 'model', 'entry'),
                ],
                refs: [
                    { key: 'prompt_factor', level: 'instrument', role: 'system_prompt', when: 'entry' },
                    { key: 'prompt_meta_QSA', level: 'instrument', role: 'meta', when: 'every_turn', override_key: 'prompt_meta_QSA_cognitive' },
                ],
            },
            {
                id: 'affective', label: 'Fattori affettivi', label_i18n: {}, color_theme: 'purple', sort_order: 2,
                system_prompt_mode: 'factor', system_prompt_key: 'prompt_factor', follow_up_mode: 'factor-qa', fixed: false,
                entries: [stepField('affective', 'prompt', 'Analizza i fattori affettivi.', 'model', 'entry')],
                refs: [{ key: 'prompt_factor', level: 'instrument', role: 'system_prompt', when: 'entry' }],
            },
            {
                id: 'conclusion', label: 'conclusion', label_i18n: {}, color_theme: null, sort_order: null, system_prompt_mode: null,
                system_prompt_key: null, follow_up_mode: null, fixed: true, entries: [],
                refs: [{ key: 'text_guided_conclusion', level: 'group', role: 'phase_text', when: 'student' }],
            },
        ],
    },
};

async function fixture(width = 1440) {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const writes = [];
    const previews = [];
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        let data = [];
        if (url.pathname === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (url.pathname === '/api/admin/config/env-status') data = {};
        if (url.pathname === '/api/admin/prompt-map/instruments') data = promptMap.instruments;
        if (url.pathname === '/api/admin/prompt-map') data = { ...promptMap, instrument: url.searchParams.get('instrument') };
        if (url.pathname === '/api/admin/prompt-audit/dry-run') {
            const body = request.postDataJSON();
            previews.push(body);
            data = {
                envelope: { system_prompt_final: 'SYSTEM', full_message: 'USER', history: [] },
                components: { system_prompt: 'Analizza i fattori.', step_prompt: body.message, meta_system_prompt: 'Meta QSA', counselor: 'Sei Iride.', guided_path: 'percorso' },
                component_origins: { system_prompt: 'prompt_factor', step_prompt: 'guided_step:cognitive', meta_system_prompt: 'prompt_meta_QSA_cognitive', counselor: 'counselor.persona' },
                component_flags: {}, warnings: [], resolved: { provider: 'p', model: 'm' },
            };
        } else if (['POST', 'PUT'].includes(request.method())) {
            data = request.postDataJSON();
            writes.push({ method: request.method(), path: url.pathname, body: data });
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/admin?section=prompt-map&instrument=QSA`);
    await page.locator('[data-entry-key="prompt_factor"]').waitFor();
    return { page, writes, previews, close: async () => { await context.close(); await browser.close(); } };
}

test('levels go from shared to step and inherited texts link to their level', async () => {
    const f = await fixture();
    try {
        const { page } = f;
        const headings = await page.locator('section[aria-labelledby="prompt-map-title"] h4').allInnerTexts();
        assert.deepEqual(headings.map(text => text.replace(/^\d\s*/, '').trim().toLowerCase()), [
            'comune a tutte le chat guidate', 'gruppi', 'strumento questionario sulle strategie di apprendimento', 'step',
        ]);
        assert.match(await page.locator('[data-entry-key="text_guided_conclusion"]').innerText(), /usato da 2 strumenti/);
        assert.match(page.url(), /section=prompt-map/);
        assert.match(page.url(), /instrument=QSA/);

        // Lo step mostra il prompt di sistema condiviso come ereditato, non come voce propria.
        const step = page.locator('#pm-step-cognitive');
        assert.equal(await step.locator('[data-entry-key="prompt_factor"]').count(), 0);
        await step.getByRole('button', { name: /vai/ }).first().click();
        await page.waitForFunction(() => document.querySelector('[data-entry-key="prompt_factor"]')?.className.includes('ring-2'));

        await page.getByRole('navigation', { name: 'Livelli' }).last().getByRole('button', { name: 'Conclusione' }).click();
        await page.locator('#pm-step-conclusion').waitFor();
        assert.match(await page.locator('#pm-step-conclusion').innerText(), /text_guided_conclusion/);
    } finally { await f.close(); }
});

test('editing a step instruction saves through the guided step API', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        const card = page.locator('[data-entry-key="guided_step:cognitive:prompt"]');
        await card.getByRole('button', { name: 'Modifica' }).click();
        await card.locator('textarea').fill('Nuova istruzione');
        await card.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('[data-entry-key="guided_step:cognitive:prompt"] textarea'));
        assert.deepEqual(writes, [{ method: 'PUT', path: '/api/admin/guided-steps/cognitive', body: { prompt: 'Nuova istruzione' } }]);
    } finally { await f.close(); }
});

test('a shared prompt asks for confirmation before saving for all its users', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        const card = page.locator('[data-entry-key="prompt_factor"]');
        await card.getByRole('button', { name: 'Modifica' }).click();
        await card.locator('textarea').fill('Analisi aggiornata');
        await card.getByRole('button', { name: 'Salva', exact: true }).click();
        assert.match(await card.getByRole('alert').innerText(), /Condiviso: cognitive · affective/);
        assert.equal(writes.length, 0);
        await card.getByRole('button', { name: 'Conferma: salva per tutti' }).click();
        await page.waitForFunction(() => !document.querySelector('[data-entry-key="prompt_factor"] textarea'));
        assert.deepEqual(writes, [{ method: 'POST', path: '/api/admin/config', body: { key: 'prompt_factor', value: 'Analisi aggiornata', description: 'prompt_factor' } }]);
    } finally { await f.close(); }
});

test('student texts save per language with the suffixed key', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        const card = page.locator('[data-entry-key="text_guided_conclusion"]');
        await card.getByRole('button', { name: 'Modifica' }).click();
        await card.getByLabel('Lingua del testo').selectOption('en');
        assert.equal(await card.locator('textarea').inputValue(), 'Done.');
        await card.locator('textarea').fill('All done.');
        await card.getByRole('button', { name: 'Salva', exact: true }).click();
        await card.getByRole('button', { name: 'Conferma: salva per tutti' }).click();
        await page.waitForFunction(() => !document.querySelector('[data-entry-key="text_guided_conclusion"] textarea'));
        assert.equal(writes[0].body.key, 'text_guided_conclusion__en');
    } finally { await f.close(); }
});

test('counselor persona is read-only and edited in a popup with the counselor API', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        const card = page.locator('[data-entry-key="counselor_persona"]');
        assert.match(await card.innerText(), /SOLA LETTURA/);
        assert.equal(await card.locator('textarea').count(), 0);
        await card.getByRole('button', { name: 'Modifica · Iride' }).click();
        const dialog = page.getByRole('dialog', { name: 'Persona del counselor · Iride' });
        await dialog.locator('textarea').fill('Sei Iride, aggiornata.');
        await dialog.getByRole('button', { name: 'Salva', exact: true }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.deepEqual(writes, [{ method: 'PUT', path: '/api/admin/counselors/7', body: { persona: 'Sei Iride, aggiornata.' } }]);
    } finally { await f.close(); }
});

test('mobile layout has a level bar, a step select and no horizontal scroll', async () => {
    const f = await fixture(390);
    try {
        const { page } = f;
        await page.getByRole('combobox', { name: 'Step', exact: true }).selectOption('affective');
        await page.locator('#pm-step-affective').waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.equal(overflow, 0);
    } finally { await f.close(); }
});

test('step preview asks the dry run for the step and colours blocks by level of origin', async () => {
    const f = await fixture();
    try {
        const { page, previews } = f;
        await page.getByRole('button', { name: 'Anteprima di ciò che riceve il modello' }).click();
        const preview = page.locator('section.prompt-request-preview');
        await preview.locator('details', { hasText: 'Prompt di sistema' }).first().waitFor();
        assert.equal(previews[0].phase, 'cognitive');
        assert.equal(previews[0].use_phase_prompt, true);
        assert.equal(previews[0].message, 'Analizza i fattori cognitivi.');
        const classOf = async (text) => preview.locator('details', { hasText: text }).first().getAttribute('class');
        assert.match(await classOf('Prompt di sistema'), /border-l-indigo-500/);
        assert.match(await classOf('Prompt dello step'), /border-l-violet-500/);
        assert.match(await classOf('Persona counselor'), /border-l-slate-500/);
        // Meta prompt dello step non salvato: eredita il livello dello strumento.
        assert.match(await classOf('Meta system prompt'), /border-l-indigo-500/);

        // Turno libero dello studente: mode di follow-up risolto dal backend.
        await preview.getByLabel('Ingresso nello step').selectOption('reply');
        const replied = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/prompt-audit/dry-run'
            && response.request().postDataJSON().message === 'Perché?');
        await preview.getByLabel('Messaggio di prova').fill('Perché?');
        await replied;
        assert.equal(previews.at(-1).mode, 'factor-qa');
        assert.equal(previews.at(-1).use_phase_prompt, false);
    } finally { await f.close(); }
});
