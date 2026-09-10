import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { promptLabContextCopy } from '../src/components/admin/prompt-lab-context-copy.ts';
import { promptLabCopy } from '../src/components/admin/prompt-lab-copy.ts';

const origin = process.env.PROMPT_LAB_BASE_URL || 'http://127.0.0.1:3000';
const base = '/api/admin/prompt-experiments';
const hash = 'a'.repeat(64);
const presets = [1, 2, 3].map((id) => ({ id, name: `Locale ${id}`, provider: 'ollama', model: `fixture:${id}`, temperature: 0, max_tokens: 300, disable_thinking: true }));
const cases = ['validation', 'final'].flatMap((split) => [1, 2].map((i) => ({ id: `${split}-${i}`, group_id: `${split}-${i}`, split, language: 'it', message: `Caso ${split} ${i}`, expected: 'Una sola domanda', history: [] })));
const payload = { title: 'Prova sintetica', purpose: 'verification', target_key: 'intro', goals: [{ text: 'Una domanda', criterion: 'Una sola domanda focalizzata' }], languages: ['it'], designer_preset_id: 1, proposer_preset_id: null, judge_preset_id: 2, tested_preset_ids: [1, 2], max_calls: 30, max_minutes: 2 };
function experiment(overrides = {}) {
    return { id: 'fixture', title: payload.title, purpose: payload.purpose, target_key: 'intro', state: 'ready', created_at: '2026-09-10T08:00:00Z', payload: structuredClone(payload), snapshot: { baseline: 'Prima', render_data: { steps: [{ id: 'intro', label: 'Introduzione registrata', sort_order: 0, prompt: 'Prima', system_prompt_mode: 'qsa-intro' }, { id: 'summary', label: 'Sintesi registrata', sort_order: 1, system_prompt_mode: 'qsa-summary' }] }, presets: { designer: presets[0], proposer: null, judge: presets[1], tested: presets.slice(0, 2) }, limits: ['Casi sintetici'], model_digests: { 'fixture:1': 'abc' } }, cases: structuredClone(cases), candidates: [], runs: [], results: [], summary: null, decision: null, manifest_hash: hash, approval_blockers: ['Copertura sintetica'], ...overrides };
}
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); await mkdir('/tmp/prompt-lab-dev/screenshots', { recursive: true }); });
after(async () => { await browser?.close(); });

async function setup({ lang = 'it', width = 1366, dark = false, initial = experiment(), enabled = true } = {}) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(8000);
    const errors = [], writes = [];
    let current = initial;
    const C = promptLabCopy(lang);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ lang, dark }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { lang, dark });
    await page.route('**/*', async (route) => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname;
        if (url.origin !== origin) return route.abort();
        if (!path.startsWith('/api/')) return route.continue();
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, is_admin: true, username: 'fixture', name: 'Test', groups: ['admins'] };
        else if (path === '/api/counselors') data = [];
        else if (path === base + '/options') data = { enabled, reason: enabled ? null : 'Servizi non attivi', presets, targets: [{ id: 'intro', label: 'Introduzione attuale', prompt: 'Testo attuale intro', system_prompt_mode: 'qsa-intro' }, { id: 'cognitive', label: 'Processi cognitivi', prompt: 'Testo attuale cognitivo', system_prompt_mode: 'qsa-cognitive' }], languages: ['it', 'en', 'es', 'fr', 'de', 'sv'] };
        else if (req.method() !== 'GET') {
            const body = req.postDataJSON(); writes.push({ path, body, method: req.method() });
            if (path === base) current = experiment({ title: body.title, purpose: body.purpose, payload: body });
            if (path.endsWith('/cases')) current.cases = body.cases;
            if (path.endsWith('/run')) {
                current.state = 'completed';
                current.runs = [{ id: 'run-1', kind: 'evaluate', state: 'completed', calls: 10, created_at: '2026-09-10T08:00:00Z', started_at: '2026-09-10T08:00:00Z', finished_at: '2026-09-10T08:01:00Z', summary: { calibration: 'fixture' } }];
                current.summary = { eligibility: 'not_applicable', selected_candidate_id: null, metrics: [], goals: [], reason: 'Verifica conclusa', completed_calls: 10 };
                current.results = [{ id: 'partial', case_id: cases[0].id, preset_id: 1, variant_id: 'baseline', repetition: 1, response: 'Risposta conservata prima del timeout.', judgment: null, error: 'judgment incomplete: timeout', duration_s: 1 }];
            }
            if (path.endsWith('/decision')) { current.state = body.action === 'accept' ? 'activated' : 'rejected'; current.decision = { action: body.action, revision_id: '1' }; }
            if (path.endsWith('/restore')) { current.state = 'reverted'; current.decision = { action: 'restore', revision_id: '2' }; }
            data = current;
        } else if (path === base) data = [current];
        else if (path.startsWith(base + '/')) data = current;
        else if (path.startsWith('/api/admin/presets')) data = [];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(origin + '/admin', { waitUntil: 'networkidle' });
    if (await page.locator('#admin-section').isVisible()) await page.locator('#admin-section').selectOption('promptExperiments');
    else await page.locator('button').filter({ hasText: { it: 'Esperimenti sui prompt', en: 'Prompt experiments', es: 'Experimentos de prompts', fr: 'Expériences sur les prompts', de: 'Prompt-Experimente', sv: 'Promptexperiment' }[lang] }).click();
    await page.getByRole('heading', { name: C.title, exact: true }).waitFor();
    return { page, C, writes, errors };
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`admin lab ${lang}: desktop/mobile, theme and disabled activation`, async () => {
        const width = lang === 'it' || lang === 'sv' ? 390 : 1366;
        const { page, C, errors, writes } = await setup({ lang, width, dark: ['it', 'de', 'sv'].includes(lang) });
        try {
            await page.getByRole('button', { name: C.open, exact: true }).click();
            await page.getByRole('heading', { name: 'Prova sintetica' }).waitFor();
            await page.getByRole('region', { name: promptLabContextCopy[lang].location }).waitFor();
            assert.equal(await page.getByRole('button', { name: C.startEval, exact: true }).isDisabled(), true);
            await page.getByLabel(C.reviewedLabel, { exact: true }).check();
            await page.getByRole('button', { name: C.startEval, exact: true }).click();
            await page.getByText('Risposta conservata prima del timeout.', { exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: C.accept, exact: true }).isDisabled(), true);
            assert.equal(writes.filter((r) => r.path.endsWith('/run'))[0].body.cases_reviewed, true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page overflow');
            assert.deepEqual(errors, []);
            await page.screenshot({ path: `/tmp/prompt-lab-dev/screenshots/lab-${lang}.png`, fullPage: true });
        } finally { await page.close(); }
    });
}

test('manual goals, designer/judge and two tested models are submitted separately', async () => {
    const { page, C, writes, errors } = await setup();
    try {
        await page.getByRole('button', { name: C.newExperiment, exact: true }).click();
        await page.getByLabel(C.experimentTitle, { exact: true }).fill('Obiettivi specifici');
        await page.getByLabel(C.designer, { exact: true }).selectOption('1');
        await page.getByLabel(C.judge, { exact: true }).selectOption('3');
        await page.getByLabel(C.goalText, { exact: true }).fill('Una domanda');
        await page.getByLabel(C.goalCriterion, { exact: true }).fill('Massimo una domanda pertinente');
        await page.getByRole('button', { name: C.addGoal, exact: true }).click();
        await page.getByLabel(C.goalText, { exact: true }).nth(1).fill('Non ripetere');
        await page.getByLabel(C.goalCriterion, { exact: true }).nth(1).fill('Non chiedere dati già forniti');
        await page.getByRole('checkbox', { name: /Locale 1/ }).check();
        await page.getByRole('checkbox', { name: /Locale 2/ }).check();
        await page.getByRole('button', { name: C.create, exact: true }).click();
        await page.getByRole('heading', { name: 'Obiettivi specifici', exact: true }).waitFor();
        const body = writes.find((r) => r.path === base).body;
        assert.equal(body.designer_preset_id, 1); assert.equal(body.judge_preset_id, 3);
        assert.deepEqual(body.tested_preset_ids, [1, 2]); assert.equal(body.goals.length, 2);
        assert.equal(body.proposer_preset_id, null);
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

for (const action of ['accept', 'reject']) {
    test(`reviewed proposal: ${action} has explicit hash and note`, async () => {
        const initial = experiment({ purpose: 'improvement', state: 'completed', approval_blockers: [], candidates: [{ id: 'candidate-1', text: 'Dopo', reason: 'Una domanda', expected: 'Meno ripetizioni' }], summary: { eligibility: 'eligible', selected_candidate_id: 'candidate-1', metrics: [], goals: [], reason: 'Fixture with complete coverage', completed_calls: 30 } });
        const { page, C, writes } = await setup({ initial });
        try {
            await page.getByRole('button', { name: C.open, exact: true }).click();
            await page.getByLabel(C.decisionNote, { exact: true }).fill('Ho verificato le risposte');
            await page.getByLabel(C.decisionCandidate, { exact: true }).selectOption('candidate-1');
            await page.getByRole('button', { name: C[action], exact: true }).click();
            await page.getByRole('group', { name: C[action + 'Confirm'], exact: true }).getByRole('button', { name: 'Sì', exact: true }).click();
            await page.getByText(C.decisionRecorded, { exact: false }).waitFor();
            const body = writes.find((r) => r.path.endsWith('/decision')).body;
            assert.equal(body.expected_hash, hash); assert.equal(body.action, action); assert.ok(body.note);
        } finally { await page.close(); }
    });
}


test('target preview follows selection; saved trial shows frozen location and balanced report', async () => {
    const metrics = [
        { preset_id: 1, variant_id: 'baseline', language: 'it', split: 'final', passed: 1, total: 4, errors: 0 },
        { preset_id: 1, variant_id: 'candidate-1', language: 'it', split: 'final', passed: 3, total: 4, errors: 0 },
        { preset_id: 2, variant_id: 'baseline', language: 'it', split: 'final', passed: 4, total: 4, errors: 0 },
        { preset_id: 2, variant_id: 'candidate-1', language: 'it', split: 'final', passed: 2, total: 4, errors: 0 },
    ];
    const initial = experiment({ purpose: 'improvement', state: 'completed', candidates: [{ id: 'candidate-1', text: 'Dopo', reason: 'Una domanda', expected: 'Meno ripetizioni' }], summary: { eligibility: 'not_eligible', selected_candidate_id: null, metrics, goals: [], reason: 'Regressione sul secondo modello', completed_calls: 32 } });
    const { page, C, errors } = await setup({ initial, width: 390, dark: true });
    const X = promptLabContextCopy.it;
    try {
        await page.getByRole('button', { name: C.newExperiment, exact: true }).click();
        await page.getByLabel(C.target, { exact: true }).selectOption('cognitive');
        await page.getByText('Testo attuale cognitivo', { exact: true }).waitFor();
        // Reopen the page to leave the draft without writing any data.
        await page.reload({ waitUntil: 'networkidle' });
        if (await page.locator('#admin-section').isVisible()) await page.locator('#admin-section').selectOption('promptExperiments');
        else await page.getByRole('button', { name: 'Esperimenti sui prompt', exact: true }).click();
        await page.getByRole('button', { name: C.open, exact: true }).click();
        const context = page.getByRole('region', { name: X.location });
        assert.match(await context.innerText(), /Introduzione registrata/);
        assert.doesNotMatch(await context.innerText(), /Introduzione attuale/);
        assert.equal(await context.locator('[aria-current="step"]').innerText(), 'Introduzione registrata');
        await context.getByText('Prima', { exact: true }).waitFor();
        const report = page.getByRole('region', { name: X.report });
        assert.match(await report.innerText(), /1\/4 → 3\/4/);
        assert.match(await report.innerText(), /4\/4 → 2\/4/);
        await report.getByText(X.expected, { exact: false }).waitFor();
        await report.getByText(X.synthetic, { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: C.accept, exact: true }).isDisabled(), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        await page.screenshot({ path: '/tmp/prompt-lab-dev/screenshots/context-report.png', fullPage: true });
        await report.screenshot({ path: '/tmp/prompt-lab-dev/screenshots/report-mobile.png' });
        await page.setViewportSize({ width: 1366, height: 900 });
        await context.screenshot({ path: '/tmp/prompt-lab-dev/screenshots/context-desktop.png' });
        await report.screenshot({ path: '/tmp/prompt-lab-dev/screenshots/report-desktop.png' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await page.close(); }
});
