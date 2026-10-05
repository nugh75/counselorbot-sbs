import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

// Vista admin "Mappa dei prompt": livelli dal comune al particolare, modifica
// sul posto tramite le API esistenti, conferma per i testi condivisi e popup
// della persona del counselor. API intercettate, nessun DB.
const origin = process.env.PROMPT_MAP_BASE_URL || 'http://127.0.0.1:3107';
const captureDir = process.env.PROMPT_MAP_SCREENSHOT_DIR;
const capture = async (page, name) => {
    if (!captureDir) return;
    // Wait for the existing page entrance animation before taking documentation images.
    await page.waitForTimeout(600);
    const options = { path: `${captureDir}/${name}.png` };
    if (['admin-prompt-map-1440', 'admin-prompt-map-390'].includes(name)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ ...options, fullPage: true });
    } else await page.screenshot(options);
};

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

const questionsEntry = (stepId, value) => ({
    key: `guided_step_questions:QSA:${stepId}`, kind: 'step_questions', field: 'suggested_questions', role: 'suggested_questions', level: 'step',
    destination: 'student', when: 'student', value, stored: true, shared: false, used_by: { instruments: ['QSA'], steps: users([stepId]) },
    editor: { method: 'POST', path: '/admin/guided-step-questions', panel: 'guided-step-questions', questionnaire_type: 'QSA', step_id: stepId }, read_only: false,
});
const question = (id, language, text, sort_order) => ({
    id, questionnaire_type: 'QSA', step_id: 'cognitive', language, text, sort_order, is_active: true, created_at: '2026-10-05T00:00:00Z', updated_at: null,
});
const questions = [
    question(1, 'it', 'Cosa misura?', 0), question(2, 'it', 'Come miglioro?', 1), question(3, 'en', 'What does it measure?', 0),
    { ...question(4, 'it', 'Altro step', 0), step_id: 'affective' },
];

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
                used_by: { instruments: ['QSA', 'IDEA'], steps: ['QSA', 'IDEA'].map(instrument => ({ instrument, step_id: 'conclusion', label: 'conclusion', fixed: true })) },
            })],
        }, {
            instruments: ['QSA', 'ZTPI', 'EVENTO_STUDIO'],
            entries: [config('label_guided_questions', 'Domande', {
                role: 'phase_label', level: 'group', destination: 'student', when: 'student', shared: true,
                used_by: { instruments: ['QSA', 'ZTPI', 'EVENTO_STUDIO'], steps: [
                    { instrument: 'QSA', step_id: 'questions', label: 'questions', fixed: true },
                    { instrument: 'EVENTO_STUDIO', step_id: 'evento', label: "L'evento", label_i18n: { en: 'The event' } },
                ] },
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
                    config('prompt_components_QSA_cognitive', '{"learner_profile":true,"history":true}', { role: 'components', level: 'step', destination: 'context_filter', effective: { learner_profile: true, history: true }, used_by: { instruments: ['QSA'], steps: users(['cognitive']) } }),
                    questionsEntry('cognitive', { it: ['Cosa misura?', 'Come miglioro?'], en: ['What does it measure?'] }),
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

async function until(condition, timeout = 5000) {
    const started = Date.now();
    while (!condition()) {
        if (Date.now() - started > timeout) throw new Error('timeout');
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}

/** Apre o chiude una sezione della mappa dall'intestazione (livello o step). */
async function toggleSection(page, anchor) {
    await page.locator(`#${anchor} > div button[aria-expanded]`).first().click();
}

async function fixture(width = 1440, { failReorder = false, failUsage = false, failDelete = false } = {}) {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const writes = [];
    const previews = [];
    const map = structuredClone(promptMap);
    await page.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        let data = [];
        if (url.pathname === '/api/auth/me') data = { username: 'fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (url.pathname === '/api/admin/config/env-status') data = {};
        if (url.pathname === '/api/admin/presets') data = [{ id: 21, name: 'Fixture small', provider: 'ollama', model: 'fixture-small', is_active: true }];
        if (url.pathname === '/api/admin/prompt-map/instruments') data = promptMap.instruments;
        if (url.pathname === '/api/admin/prompt-map') data = { ...map, instrument: url.searchParams.get('instrument') };
        if (url.pathname === '/api/admin/guided-step-questions' && request.method() === 'GET') data = questions;
        if (url.pathname === '/api/admin/guided-steps/modes') data = [{ mode: 'intro', system_prompt_key: null }, { mode: 'generic', system_prompt_key: 'prompt_generic' }, { mode: 'factor', system_prompt_key: 'prompt_factor' }];
        if (url.pathname.endsWith('/usage')) {
            if (failUsage) return route.fulfill({ status: 503, json: { detail: 'fixture usage failure' } });
            data = { step_id: 'affective', questionnaire_type: 'QSA', sessions: 3, messages: 12, suggested_questions: 1,
                session_details: [{ session_id: 'fixture-s1', messages: 6 }, { session_id: 'fixture-s2', messages: 4 }, { session_id: 'fixture-s3', messages: 2 }],
            };
        }
        if (url.pathname === '/api/admin/prompt-audit/dry-run') {
            const body = request.postDataJSON();
            previews.push(body);
            data = {
                envelope: { system_prompt_final: 'SYSTEM', full_message: 'USER', history: [] },
                components: { system_prompt: 'Analizza i fattori.', step_prompt: body.message, meta_system_prompt: 'Meta QSA', counselor: 'Sei Iride.', guided_path: 'percorso' },
                component_origins: { system_prompt: 'prompt_factor', step_prompt: 'guided_step:cognitive', meta_system_prompt: 'prompt_meta_QSA_cognitive', counselor: 'counselor.persona' },
                component_flags: {}, warnings: [], resolved: { provider: 'p', model: 'm', context_budget: { input_tokens: 120, input_budget: 800, blocks: { instructions_and_contracts: 80, current_message: 40, history: 0 } } },
            };
        } else if (['POST', 'PUT', 'PATCH'].includes(request.method())) {
            data = request.postDataJSON();
            writes.push({ method: request.method(), path: url.pathname, body: data });
            if (url.pathname === '/api/admin/guided-steps' && request.method() === 'POST') {
                map.levels.steps.splice(map.levels.steps.findIndex(step => step.fixed), 0, { ...data, fixed: false, label_i18n: {}, entries: [stepField(data.id, 'label', data.label, 'student', 'student')], refs: [] });
            }
            if (url.pathname === '/api/admin/guided-steps/reorder') {
                if (failReorder) return route.fulfill({ status: 503, json: { detail: 'fixture reorder failure' } });
                for (const item of data) map.levels.steps.find(step => step.id === item.id).sort_order = item.sort_order;
                map.levels.steps.sort((a, b) => Number(a.fixed) - Number(b.fixed) || a.sort_order - b.sort_order);
            }
        } else if (request.method() === 'DELETE') {
            data = { ok: true };
            writes.push({ method: 'DELETE', path: url.pathname });
            if (url.pathname.startsWith('/api/admin/guided-steps/')) {
                if (failDelete) return route.fulfill({ status: 503, json: { detail: 'fixture delete failure' } });
                map.levels.steps = map.levels.steps.filter(step => step.id !== url.pathname.split('/').at(-1));
            }
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    try {
        await page.goto(`${origin}/admin?section=prompt-map&instrument=QSA`);
        await page.locator('[data-entry-key="prompt_factor"]').waitFor();
    } catch (error) {
        await browser.close();
        throw error;
    }
    return { page, writes, previews, close: async () => { await context.close(); await browser.close(); } };
}

test('levels go from shared to step and inherited texts link to their level', async () => {
    const f = await fixture();
    try {
        const { page } = f;
        await capture(page, 'admin-prompt-map-1440');
        const headings = await page.locator('section[aria-labelledby="prompt-map-title"] h4').allInnerTexts();
        assert.deepEqual(headings.map(text => text.replace(/\s+/g, ' ').trim().toLowerCase()), [
            '1 comune a tutte le chat guidate 2 voci', '2 gruppi 2 voci', '3 strumento questionario sulle strategie di apprendimento 2 voci', '4 step 3 step',
        ]);
        // Comune e Gruppi chiusi, Strumento e Step aperti; degli step solo il primo.
        const open = await page.locator('[data-section-open]').evaluateAll(nodes => nodes.map(node => `${node.id}:${node.dataset.sectionOpen}`));
        assert.deepEqual(open, [
            'pm-level-common:false', 'pm-level-group:false', 'pm-level-instrument:true', 'pm-level-step:true',
            'pm-step-cognitive:true', 'pm-step-affective:false', 'pm-step-conclusion:false',
        ]);
        assert.equal(await page.locator('[data-entry-key="text_guided_conclusion"]').count(), 0);
        assert.equal(await page.getByRole('navigation').filter({ hasText: 'Comune' }).count(), 0);
        assert.match(page.url(), /section=prompt-map/);
        assert.match(page.url(), /instrument=QSA/);

        // Lo step mostra il prompt di sistema condiviso come ereditato, non come voce propria.
        const step = page.locator('#pm-step-cognitive');
        assert.equal(await step.locator('[data-entry-key="prompt_factor"]').count(), 0);
        assert.deepEqual(await step.locator('[data-entry-key]').evaluateAll(nodes => nodes.slice(0, 4).map(node => node.dataset.entryKey)), ['guided_step:cognitive:label', 'guided_step:cognitive:color_theme', 'guided_step:cognitive:prompt', 'prompt_components_QSA_cognitive']);
        await step.getByRole('button', { name: /vai/ }).first().click();
        await page.waitForFunction(() => document.querySelector('[data-entry-key="prompt_factor"]')?.className.includes('ring-2'));

        await toggleSection(page, 'pm-step-conclusion');
        const conclusion = page.locator('#pm-step-conclusion');
        assert.match(await conclusion.innerText(), /text_guided_conclusion/);
        // "vai" verso un livello chiuso lo apre e ci scorre.
        await conclusion.getByRole('button', { name: /vai/ }).click();
        await page.waitForFunction(() => document.querySelector('[data-entry-key="text_guided_conclusion"]')?.className.includes('ring-2'));
        assert.equal(await page.locator('#pm-level-group').getAttribute('data-section-open'), 'true');
        assert.match(await page.locator('[data-entry-key="text_guided_conclusion"]').innerText(), /usato da 2 strumenti/);
    } finally { await f.close(); }
});

test('each group names its instruments, highlights the selected one and the warnings cite them', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        await toggleSection(page, 'pm-level-group');
        const groups = page.locator('#pm-level-group [data-group]');
        assert.equal(await groups.count(), 2);
        const first = groups.nth(0);
        const members = group => group.getByRole('list', { name: 'Strumenti del gruppo' }).getByRole('listitem');
        assert.deepEqual(await members(first).allInnerTexts(), ['QSA', 'IDEA']);
        assert.equal(await first.locator('[aria-current="true"]').innerText(), 'QSA');
        assert.match(await first.innerText(), /Modificare qui cambia tutti gli strumenti del gruppo: QSA · IDEA\./);
        const second = groups.nth(1);
        assert.deepEqual(await members(second).allInnerTexts(), ['QSA', 'ZTPI', 'Evento di studio']);
        assert.equal(await second.locator('[title="Evento significativo di studio"]').count(), 1);

        // "Usato da" nomina gli strumenti e, aperto, gli step di ciascuno.
        const card = page.locator('[data-entry-key="label_guided_questions"]');
        assert.match(await card.innerText(), /usato da 3 strumenti: QSA · ZTPI · Evento di studio/);
        await card.getByText('2 step', { exact: true }).click();
        const steps = await card.locator('[data-used-by-steps] li').allInnerTexts();
        assert.deepEqual(steps.map(text => text.replace(/\s+/g, ' ').trim()), ['QSA: Domande', "Evento di studio: L'evento"]);

        await card.getByRole('button', { name: 'Modifica' }).click();
        await card.locator('textarea').fill('Le tue domande');
        await card.getByRole('button', { name: 'Salva', exact: true }).click();
        assert.match(await card.getByRole('alert').innerText(), /Condiviso: QSA · ZTPI · Evento di studio \(2 step\)\./);
        assert.equal(writes.length, 0);
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
        await toggleSection(page, 'pm-level-group');
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
        await toggleSection(page, 'pm-level-common');
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

test('mobile layout opens every section without horizontal scroll', async () => {
    const f = await fixture(390);
    try {
        const { page } = f;
        await capture(page, 'admin-prompt-map-390');
        const titleRow = await page.locator('#pm-step-cognitive > div h5').first().boundingBox();
        const actions = await page.getByRole('button', { name: 'Elimina lo step «Fattori cognitivi»' }).boundingBox();
        assert.ok(actions.y >= titleRow.y + titleRow.height - 1, 'structure actions have their own row on mobile');
        for (const anchor of ['pm-level-common', 'pm-level-group', 'pm-step-affective', 'pm-step-conclusion']) await toggleSection(page, anchor);
        await page.locator('[data-entry-key="guided_step:affective:prompt"]').waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.equal(overflow, 0);
    } finally { await f.close(); }
});

test('open and closed sections are remembered for the viewer', async () => {
    const f = await fixture();
    try {
        const { page } = f;
        await toggleSection(page, 'pm-level-common');
        await toggleSection(page, 'pm-step-cognitive');
        await page.reload();
        await page.locator('[data-entry-key="prompt_factor"]').waitFor();
        assert.equal(await page.locator('#pm-level-common').getAttribute('data-section-open'), 'true');
        assert.equal(await page.locator('#pm-step-cognitive').getAttribute('data-section-open'), 'false');
        assert.equal(await page.locator('[data-entry-key="guided_step:cognitive:prompt"]').count(), 0);
        // Chiave illeggibile: si torna ai default, la pagina funziona.
        await page.evaluate(() => localStorage.setItem('cb_prompt_map_sections', '{oops'));
        await page.reload();
        await page.locator('[data-entry-key="guided_step:cognitive:prompt"]').waitFor();
        assert.equal(await page.locator('#pm-level-common').getAttribute('data-section-open'), 'false');
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

        const selected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/prompt-audit/dry-run'
            && response.request().postDataJSON().model_preset_id === 21);
        await preview.getByLabel('Configurazione del modello', { exact: true }).selectOption('21');
        await selected;
        assert.equal(previews.at(-1).model_preset_id, 21);
        await preview.locator('[data-context-token-report]').waitFor();
        assert.match(await preview.locator('[data-context-token-report]').innerText(), /120.*800/);

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

test('suggested questions are edited per language in a popup with the guided step questions API', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        const card = page.locator('[data-entry-key="guided_step_questions:QSA:cognitive"]');
        assert.match(await card.innerText(), /IT 2 · EN 1/);
        assert.doesNotMatch(await card.innerText(), /SOLA LETTURA/);
        await card.getByRole('button', { name: 'Modifica domande' }).click();
        const dialog = page.getByRole('dialog', { name: 'Domande suggerite · Fattori cognitivi' });
        const rows = dialog.getByRole('list', { name: 'Domande suggerite' }).getByRole('listitem');
        await rows.first().waitFor();
        // Solo le domande di questo step e di questa lingua.
        assert.equal(await rows.count(), 2);
        assert.equal(await dialog.getByRole('button', { name: 'IT 2' }).getAttribute('aria-pressed'), 'true');

        await rows.nth(1).getByRole('button', { name: 'Sposta su' }).click();
        await until(() => writes.length === 2);
        assert.deepEqual(writes.splice(0), [
            { method: 'PUT', path: '/api/admin/guided-step-questions/2', body: { sort_order: 0 } },
            { method: 'PUT', path: '/api/admin/guided-step-questions/1', body: { sort_order: 1 } },
        ]);

        await rows.nth(0).getByRole('button', { name: 'Modifica' }).click();
        await dialog.getByRole('textbox', { name: 'Modifica' }).fill('Cosa misura il QSA?');
        await dialog.getByRole('button', { name: 'Salva', exact: true }).click();
        await until(() => writes.length === 1);
        assert.deepEqual(writes.splice(0), [{ method: 'PUT', path: '/api/admin/guided-step-questions/1', body: { text: 'Cosa misura il QSA?' } }]);

        await rows.nth(1).getByRole('button', { name: 'Elimina la domanda' }).click();
        assert.equal(writes.length, 0);
        await rows.nth(1).getByRole('button', { name: 'Conferma eliminazione' }).click();
        await until(() => writes.length === 1);
        assert.deepEqual(writes.splice(0), [{ method: 'DELETE', path: '/api/admin/guided-step-questions/2' }]);

        await dialog.getByRole('button', { name: 'EN 1' }).click();
        assert.equal(await rows.count(), 1);
        await dialog.getByLabel('Nuova domanda (EN)').fill('How do I improve?');
        await dialog.getByRole('button', { name: 'Aggiungi' }).click();
        await until(() => writes.length === 1);
        assert.deepEqual(writes.splice(0), [{ method: 'POST', path: '/api/admin/guided-step-questions', body: {
            questionnaire_type: 'QSA', step_id: 'cognitive', language: 'en', text: 'How do I improve?', sort_order: 1, is_active: true,
        } }]);

        const reloads = page.waitForRequest(request => new URL(request.url()).pathname === '/api/admin/prompt-map');
        await dialog.getByRole('button', { name: 'Chiudi' }).last().click();
        await dialog.waitFor({ state: 'detached' });
        await reloads;
    } finally { await f.close(); }
});

test('steps move up and down through the reorder API; fixed phases have no structure buttons', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        assert.equal(await page.getByRole('button', { name: 'Sposta su «Fattori cognitivi»' }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Sposta giù «Fattori affettivi»' }).isDisabled(), true);
        assert.equal(await page.locator('#pm-step-conclusion').getByRole('button', { name: /Sposta|Elimina/ }).count(), 0);
        await page.getByRole('button', { name: 'Sposta giù «Fattori cognitivi»' }).click();
        await until(() => writes.length === 1);
        assert.deepEqual(writes, [{ method: 'PATCH', path: '/api/admin/guided-steps/reorder', body: [
            { id: 'affective', sort_order: 1 }, { id: 'cognitive', sort_order: 2 },
        ] }]);
    } finally { await f.close(); }
});

test('a new step is created with the guided steps API and placed at the chosen position', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        await page.getByRole('button', { name: 'Aggiungi step' }).click();
        const form = page.getByRole('form', { name: 'Nuovo step' });
        await form.getByLabel('Id').fill('cognitive');
        await form.getByLabel('Nome', { exact: true }).fill('Nuovo');
        await form.getByRole('button', { name: 'Crea step' }).click();
        assert.match(await form.getByRole('alert').innerText(), /Esiste già uno step con questo id/);
        assert.equal(writes.length, 0);

        await form.getByLabel('Id').fill('QSA Nuovo!');
        assert.equal(await form.getByLabel('Id').inputValue(), 'qsa-nuovo-');
        await form.getByLabel('Tipo (mode)').selectOption('factor');
        await form.getByLabel('Posizione').selectOption({ label: 'Prima di «Fattori affettivi»' });
        await form.getByRole('button', { name: 'Crea step' }).click();
        await until(() => writes.length === 2);
        assert.deepEqual(writes, [
            { method: 'POST', path: '/api/admin/guided-steps', body: {
                id: 'qsa-nuovo', sort_order: 3, label: 'Nuovo', prompt: '', system_prompt_mode: 'factor', color_theme: 'blue', questionnaire_type: 'QSA',
            } },
            { method: 'PATCH', path: '/api/admin/guided-steps/reorder', body: [{ id: 'qsa-nuovo', sort_order: 2 }, { id: 'affective', sort_order: 3 }] },
        ]);
        await form.waitFor({ state: 'detached' });
    } finally { await f.close(); }
});

test('deleting a step shows student usage and needs the step id typed', async () => {
    const f = await fixture();
    try {
        const { page, writes } = f;
        await page.getByRole('button', { name: 'Elimina lo step «Fattori affettivi»' }).click();
        const dialog = page.getByRole('dialog', { name: 'Eliminare lo step «Fattori affettivi»?' });
        await dialog.locator('[data-step-usage]').waitFor();
        await capture(page, 'admin-prompt-map-delete-step');
        assert.match(await dialog.innerText(), /3 sessioni · 12 messaggi registrati/);
        assert.deepEqual(await dialog.locator('[data-session-id]').allTextContents(), ['fixture-s1', 'fixture-s2', 'fixture-s3']);
        assert.match(await dialog.innerText(), /1 domande suggerite restano salvate/);
        assert.match(await dialog.innerText(), /storico delle revisioni non vengono toccati/);
        const confirm = dialog.getByRole('button', { name: 'Elimina step' });
        assert.equal(await confirm.isDisabled(), true);
        await dialog.getByLabel('Digita «affective» per confermare').fill('Fattori affettivi');
        assert.equal(await confirm.isDisabled(), true);
        await dialog.getByLabel('Digita «affective» per confermare').fill('affective');
        await confirm.click();
        await dialog.waitFor({ state: 'detached' });
        assert.deepEqual(writes, [{ method: 'DELETE', path: '/api/admin/guided-steps/affective' }]);
    } finally { await f.close(); }
});


test('creation keeps the new step and reports a failed position without offering duplicate creation', async () => {
    const f = await fixture(1440, { failReorder: true });
    try {
        const { page, writes } = f;
        await page.getByRole('button', { name: 'Aggiungi step' }).click();
        const form = page.getByRole('form', { name: 'Nuovo step' });
        await form.getByLabel('Id').fill('qsa-new');
        await form.getByLabel('Nome', { exact: true }).fill('Nuovo');
        await form.getByLabel('Posizione').selectOption('affective');
        await form.getByRole('button', { name: 'Crea step' }).click();
        await form.waitFor({ state: 'detached' });
        await page.locator('#pm-step-qsa-new').waitFor();
        assert.match(await page.locator('section[aria-labelledby="prompt-map-title"]').getByRole('alert').innerText(), /Step creato in fondo.*spostamento.*non riuscito/i);
        assert.equal(writes.filter(item => item.method === 'POST').length, 1);
        assert.deepEqual(await page.locator('[id^="pm-step-"]').evaluateAll(nodes => nodes.map(node => node.id)), ['pm-step-cognitive', 'pm-step-affective', 'pm-step-qsa-new', 'pm-step-conclusion']);
    } finally { await f.close(); }
});

test('failed usage blocks deletion and cancelling sends no write', async () => {
    const f = await fixture(390, { failUsage: true });
    try {
        const { page, writes } = f;
        await page.getByRole('button', { name: 'Elimina lo step «Fattori affettivi»' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('alert').waitFor();
        await dialog.getByLabel('Digita «affective» per confermare').fill('affective');
        assert.equal(await dialog.getByRole('button', { name: 'Elimina step' }).isDisabled(), true);
        await dialog.getByRole('button', { name: 'Annulla' }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.deepEqual(writes, []);
    } finally { await f.close(); }
});

test('failed deletion preserves the session list, confirmation and step', async () => {
    const f = await fixture(390, { failDelete: true });
    try {
        const { page, writes } = f;
        await page.getByRole('button', { name: 'Elimina lo step «Fattori affettivi»' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.locator('[data-step-usage]').waitFor();
        await capture(page, 'admin-prompt-map-delete-step-390');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await dialog.getByLabel('Digita «affective» per confermare').fill('affective');
        await dialog.getByRole('button', { name: 'Elimina step' }).click();
        await dialog.getByRole('alert').waitFor();
        assert.equal(await dialog.locator('[data-session-id]').count(), 3);
        assert.equal(await dialog.getByLabel('Digita «affective» per confermare').inputValue(), 'affective');
        assert.equal(await page.locator('#pm-step-affective').count(), 1);
        assert.deepEqual(writes, [{ method: 'DELETE', path: '/api/admin/guided-steps/affective' }]);
    } finally { await f.close(); }
});

for (const width of [1440, 390]) test(`manual model context settings preserve drafts and save explicitly at ${width}px`, async () => {
    const f = await fixture(width);
    try {
        const level = { label: 'Totale', directives_tokens: null, persona_tokens: null, profile_tokens: null, knowledge_tokens: null, knowledge_top_n: null, history_turns: null, meta: true, short_prompt: false };
        await f.page.route('**/api/admin/model-context-levels', route => route.fulfill({ json: {
            levels: { totale: level, ristretto: { ...level, label: 'Ristretto', meta: false, short_prompt: true } },
            profiles: { 'ollama/fixture-small': { level: 'ristretto', context_tokens: 16384 } },
        } }));
        await f.page.goto(`${origin}/admin?section=general`);
        const settings = f.page.getByRole('region', { name: 'Contesto per modello' });
        await settings.waitFor();
        assert.equal(f.writes.length, 0);
        await settings.locator('summary').filter({ hasText: 'Ristretto' }).click();
        await settings.getByRole('textbox', { name: 'Nome del livello ristretto', exact: true }).fill('Breve locale');
        await settings.getByRole('spinbutton', { name: 'Persona: tetto token ristretto', exact: true }).fill('222');
        assert.equal(f.writes.length, 0);
        await settings.getByRole('button', { name: 'Salva livelli', exact: true }).click();
        await until(() => f.writes.length === 1);
        assert.equal(f.writes[0].body.key, 'model_context_levels');
        assert.equal(JSON.parse(f.writes[0].body.value).ristretto.persona_tokens, 222);
        assert.equal(JSON.parse(f.writes[0].body.value).ristretto.label, 'Breve locale');
        await settings.getByRole('combobox', { name: 'Livello 1', exact: true }).selectOption('totale');
        assert.equal(f.writes.length, 1);
        await settings.getByRole('button', { name: 'Salva assegnazioni', exact: true }).click();
        await until(() => f.writes.length === 2);
        assert.equal(JSON.parse(f.writes[1].body.value)['ollama/fixture-small'].level, 'totale');
        assert.equal(JSON.parse(f.writes[1].body.value)['ollama/fixture-small'].context_tokens, 16384);
        await f.page.route('**/api/admin/config', route => route.fulfill({ status: 500, json: { detail: 'fixture failure' } }));
        await settings.getByRole('spinbutton', { name: 'Persona: tetto token ristretto', exact: true }).fill('333');
        await settings.getByRole('button', { name: 'Salva livelli', exact: true }).click();
        await settings.getByRole('alert').waitFor();
        assert.equal(await settings.getByRole('spinbutton', { name: 'Persona: tetto token ristretto', exact: true }).inputValue(), '333');
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await capture(f.page, `model-context-${width}`);
    } finally { await f.close(); }
});

test('short prompt is administrator-owned, counts its draft and preserves shared confirmation', async () => {
    const f = await fixture();
    try {
        await f.page.route('**/api/admin/prompt-map?*', route => {
            const map = structuredClone(promptMap);
            map.levels.instrument.push(config('prompt_factor__short', '', { role: 'system_prompt_short', shared: true, used_by: { instruments: ['QSA'], steps: users(['cognitive', 'affective']) } }));
            return route.fulfill({ json: map });
        });
        await f.page.reload();
        const card = f.page.locator('[data-entry-key="prompt_factor__short"]');
        await card.waitFor();
        await card.getByRole('button', { name: 'Modifica', exact: true }).click();
        await card.getByRole('textbox', { name: 'prompt_factor__short', exact: true }).fill('Testo breve scritto dall’amministratore.');
        assert.ok(await card.locator('[data-token-estimate]').count() >= 2);
        assert.equal(f.writes.length, 0);
        await card.getByRole('button', { name: 'Salva', exact: true }).click();
        assert.equal(f.writes.length, 0);
        await card.getByRole('button', { name: 'Conferma: salva per tutti', exact: true }).click();
        await until(() => f.writes.length === 1);
        assert.equal(f.writes[0].body.key, 'prompt_factor__short');
        assert.equal(f.writes[0].body.value, 'Testo breve scritto dall’amministratore.');
    } finally { await f.close(); }
});
