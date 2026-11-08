import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.PROMPT_HEALTH_BASE_URL || 'http://127.0.0.1:3186';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const mixed = {
    id: '1111111111111111', code: 'rule_conflict', severity: 'high',
    prompts: ['code:turn_contract', 'guided_step:sl-social'], editable: ['guided_step:sl-social'],
    factory: ['code:turn_contract'], surfaces: ['QSA · sl-social · entry'], params: { field: 'questions' },
    sentences: [{ prompt: 'code:turn_contract', text: 'Ask one question.' }, { prompt: 'guided_step:sl-social', text: 'Ask three questions.' }],
    sources: [{ id: 'code:turn_contract', kind: 'code', consumer: 'backend.prompt_contract:turn_contract', factory_source: null }], ack: null,
};
const promptOnly = {
    ...mixed, id: '2222222222222222', code: 'number_mismatch', severity: 'low',
    prompts: ['guided_step:sl-intro'], editable: ['guided_step:sl-intro'], factory: ['guided_step:sl-intro'],
    sentences: [{ prompt: 'guided_step:sl-intro', text: 'in five steps' }], sources: [], params: { stated: 5, actual: 7 },
};
const codeOnly = {
    ...mixed, id: '3333333333333333', code: 'llm_contradiction', prompts: ['code:request'], editable: [], factory: ['code:request'],
    sentences: [{ prompt: 'code:request', text: 'Always use a list.' }, { prompt: 'code:request', text: 'Never use a list.' }],
    sources: [{ id: 'code:request', kind: 'code', consumer: null, factory_source: null }], params: { explanation: 'Opposite list rules.' },
};

async function fixture({ width = 1440, lang = 'it', dark = false, clipboardFailure = false, failLoad = false, sourceCase = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(120000);
    const writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ lang, dark, clipboardFailure }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
        window.fixtureClipboard = '';
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => {
            if (clipboardFailure) throw new Error('Synthetic unavailable clipboard');
            window.fixtureClipboard = text;
        } } });
    }, { lang, dark, clipboardFailure });
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        let data = [];
        if (path === '/api/auth/me') data = { username: 'prompt-health-fixture', authenticated: true, is_admin: true, groups: ['admins'] };
        if (path === '/api/orientation/status') data = { required: false, completed: true };
        if (path === '/api/admin/config/env-status') data = {};
        if (path === '/api/admin/prompt-health') {
            if (failLoad) return route.fulfill({ status: 503, json: { detail: 'synthetic failure' } });
            data = { run: { id: 1, created_at: '2026-11-08T10:00:00Z', current: true, counts: { total: 2 },
                findings: [{ ...mixed, number: 12 }, promptOnly, { ...promptOnly, id: '4444444444444444', ack: { note: 'Scelta concordata' } }] } };
        }
        if (path === '/api/admin/prompt-health/map') data = { paths: [{ instrument: 'QSA', steps: [
            { id: 'sl-social', label: 'Collaborazione', label_i18n: { en: 'Collaboration' }, prompts: ['guided_step:sl-social'], surfaces: ['QSA · sl-social · entry'] },
            { id: 'sl-intro', label: 'Presentazione', label_i18n: { en: 'Introduction' }, prompts: ['guided_step:sl-intro'], surfaces: ['QSA · sl-intro · entry'] },
        ] }] };
        if (path === '/api/admin/prompt-health/llm') data = { findings: [sourceCase ? { ...codeOnly, sentences: [
            { prompt: 'code:request', text: 'Do not produce a reasoning block, analysis, plan, checklist or meta-commentary.', code_location: { status: 'matched', more: 0, matches: [
                { file: 'backend/chat_logic.py', line: 532, symbol: 'DEFAULT_NO_REASONING_DIRECTIVE', readers: [{ file: 'backend/chat_logic.py', line: 718, symbol: '_apply_global_directives' }] },
            ] } },
            { prompt: 'code:request', text: 'In EVERY visible reply, weave in one short, natural orientation sentence.', code_location: { status: 'matched', more: 0, matches: [
                { file: 'backend/prompts/guided_choice_directive.md', line: 2, symbol: 'GUIDED_CHOICE_DIRECTIVE', definition: { file: 'backend/prompt_config.py', line: 30, symbol: 'GUIDED_CHOICE_DIRECTIVE' }, readers: [{ file: 'backend/prompt_contract.py', line: 422, symbol: 'turn_contract' }] },
            ] } },
        ] } : codeOnly] };
        if (path === '/api/admin/prompt-health/llm/settings') data = { provider: 'openrouter', model: 'test/fixture', configured: true, providers: ['openrouter'], max_calls_per_run: 20 };
        if (path === '/api/admin/prompt-health/problems') data = { problems: [
            { ...promptOnly, id: '5555555555555555', number: 13, source: 'static', status: 'resolved', first_seen_at: '2026-11-01T10:00:00Z', last_seen_at: '2026-11-05T10:00:00Z', resolved_at: '2026-11-06T10:00:00Z' },
            { ...mixed, number: 12, source: 'static', status: 'open', first_seen_at: '2026-11-01T10:00:00Z', last_seen_at: '2026-11-08T10:00:00Z', resolved_at: null },
        ] };
        if (path === '/api/admin/models') data = { models: ['test/fixture'] };
        if (path === '/api/admin/prompt-health/usage') data = { days: 30, turns: 0, retention_days: 90, tracking_since: null, partial: false, prompts: [], steps: [], never_used: [] };
        if (path === '/api/admin/prompt-health/prompt') data = {
            id: url.searchParams.get('id'), text: 'Ask three questions.', factory: 'Ask one question.', editable: true,
            customised: true, differs_from_factory: true, consumer: 'backend.chat_preparation:prepare_chat_turn', surfaces: mixed.surfaces, findings: [mixed],
        };
        if (path === '/api/admin/prompt-health/evaluate') data = { findings: [mixed], assembled: null };
        if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
        await route.fulfill({ json: data });
    });
    await page.goto(`${origin}/admin?tab=promptHealth`);
    await page.getByRole('heading', { name: lang === 'en' ? 'Issues to review' : 'Problemi da esaminare', exact: true }).waitFor();
    return { page, context, writes, errors };
}

for (const width of [390, 1440]) test(`prompt health ${width}px: human names, evidence and separate code/prompt paths`, async () => {
    const f = await fixture({ width, dark: width === 390 });
    try {
        await f.page.getByText('3 problemi da esaminare', { exact: false }).waitFor();
        assert.ok(await f.page.getByText('2 coinvolgono il codice', { exact: false }).isVisible());
        assert.equal(await f.page.locator('details[name="prompt-health-open"]').count(), 3);
        assert.equal(await f.page.getByRole('button', { name: 'Esamina e correggi il prompt', exact: true }).first().isVisible(), false);
        const issue = f.page.locator('details[name="prompt-health-open"]').first();
        await issue.locator(':scope > summary').click();
        await issue.getByText('Regole del turno di conversazione', { exact: true }).waitFor();
        await issue.getByText('QSA · Collaborazione', { exact: true }).waitFor();
        assert.ok(await issue.getByText('CODICE DELL’APPLICAZIONE', { exact: true }).isVisible());
        assert.ok(await issue.getByText('Origine: prompt · modifica da questa pagina', { exact: true }).isVisible());
        await issue.getByText('Prepara un intervento nel codice', { exact: true }).click();
        await issue.getByRole('button', { name: 'Copia per un agente di sviluppo', exact: true }).click();
        const brief = await f.page.evaluate(() => window.fixtureClipboard);
        for (const expected of ['code:turn_contract', 'guided_step:sl-social', 'Ask one question.', 'Ask three questions.', 'backend.prompt_contract:turn_contract', 'QSA · sl-social · entry']) assert.ok(brief.includes(expected), expected);
        assert.deepEqual(f.writes, []);
        // Opening another problem closes the first, keeping the page focused.
        const next = f.page.locator('details[name="prompt-health-open"]').filter({ hasText: 'Il testo dice 5' });
        await next.locator(':scope > summary').click();
        assert.equal(await issue.getAttribute('open'), null);
        await f.page.getByRole('button', { name: 'Coinvolgono il codice', exact: true }).click();
        assert.equal(await f.page.locator('details[name="prompt-health-open"]').count(), 2);
        const onlyCode = f.page.locator('details[name="prompt-health-open"]').filter({ hasText: 'Opposite list rules.' });
        await onlyCode.locator(':scope > summary').click();
        assert.equal(await onlyCode.getByRole('button', { name: 'Esamina e correggi il prompt', exact: true }).count(), 0);
        assert.ok(await onlyCode.getByText('Nessuna delle istruzioni coinvolte', { exact: false }).isVisible());
        await onlyCode.getByText('Prepara un intervento nel codice', { exact: true }).click();
        assert.match(await onlyCode.getByRole('textbox').inputValue(), /origine precisa non è ancora identificata/);
        await f.page.getByRole('button', { name: 'Solo prompt', exact: true }).click();
        assert.equal(await f.page.locator('details[name="prompt-health-open"]').count(), 1);
        if (process.env.PROMPT_HEALTH_SCREENSHOT_DIR) {
            await f.page.getByRole('button', { name: 'Tutti', exact: true }).click();
            await f.page.locator('details[name="prompt-health-open"]').first().locator(':scope > summary').click();
            await mkdir(process.env.PROMPT_HEALTH_SCREENSHOT_DIR, { recursive: true });
            await f.page.screenshot({ path: `${process.env.PROMPT_HEALTH_SCREENSHOT_DIR}/prompt-health-${width}.png`, fullPage: true });
        }
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('editing opens the saved prompt at the conflicting passage; secondary tools and acknowledgements remain available', async () => {
    const f = await fixture();
    try {
        const issue = f.page.locator('details[name="prompt-health-open"]').first();
        await issue.locator(':scope > summary').click();
        await issue.getByRole('button', { name: 'Esamina e correggi il prompt', exact: true }).click();
        const editor = f.page.locator('#prompt-health-compare');
        await editor.getByRole('heading', { name: 'QSA · Collaborazione', exact: true }).waitFor();
        const textarea = editor.getByRole('textbox', { name: 'Testo di sl-social', exact: true });
        await textarea.waitFor();
        assert.equal(await textarea.inputValue(), 'Ask three questions.');
        await f.page.waitForFunction(() => { const area = document.querySelector('#prompt-health-compare textarea'); return area && area.value.slice(area.selectionStart, area.selectionEnd) === 'Ask three questions.'; });
        await f.page.getByRole('button', { name: '1 segnati come voluti', exact: true }).click();
        assert.ok(await f.page.getByText('Scelta concordata', { exact: false }).count() > 0);
        await f.page.locator('summary').filter({ hasText: /^Percorsi e passi$/ }).click();
        await f.page.getByRole('button', { name: /Collaborazione.*Errore grave/ }).waitFor();
        assert.ok(!f.writes.some(write => write.path.endsWith('/llm/run') || write.path.endsWith('/save')));
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('English labels and clipboard fallback keep the brief accessible without saving', async () => {
    const f = await fixture({ lang: 'en', clipboardFailure: true });
    try {
        const issue = f.page.locator('details[name="prompt-health-open"]').first();
        await issue.locator(':scope > summary').click();
        await issue.getByText('QSA · Collaboration', { exact: true }).waitFor();
        await issue.getByText('Prepare a code change', { exact: true }).click();
        await issue.getByRole('button', { name: 'Copy for a coding agent', exact: true }).click();
        await issue.getByText('Automatic copy is unavailable.', { exact: false }).waitFor();
        assert.match(await issue.getByRole('textbox').inputValue(), /backend.prompt_contract:turn_contract/);
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('load failures remain explicit and do not claim the prompts are coherent', async () => {
    const f = await fixture({ failLoad: true });
    try {
        await f.page.getByText('Impossibile caricare gli avvisi sui prompt.', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('Nessun problema rilevato dai controlli disponibili.', { exact: true }).count(), 0);
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});


test('code origins show file, line and function beside each quote and in the copied brief', async () => {
    const f = await fixture({ sourceCase: true });
    try {
        const issue = f.page.locator('details[name="prompt-health-open"]').filter({ hasText: 'Opposite list rules.' });
        await issue.locator(':scope > summary').click();
        assert.equal(await issue.getByText('CODICE DELL’APPLICAZIONE', { exact: true }).count(), 2);
        const python = issue.getByRole('link', { name: /backend\/chat_logic.py · riga 532/ });
        await python.waitFor();
        assert.match(await python.getAttribute('href'), /blob\/main\/backend\/chat_logic.py#L532$/);
        assert.ok(await issue.getByText('DEFAULT_NO_REASONING_DIRECTIVE', { exact: true }).isVisible());
        assert.ok(await issue.getByText('_apply_global_directives', { exact: true }).isVisible());
        assert.ok(await issue.getByRole('link', { name: /backend\/prompts\/guided_choice_directive.md · riga 2/ }).isVisible());
        assert.ok(await issue.getByText('turn_contract', { exact: true }).isVisible());
        await issue.getByText('Prepara un intervento nel codice', { exact: true }).click();
        await issue.getByRole('button', { name: 'Copia per un agente di sviluppo', exact: true }).click();
        const brief = await f.page.evaluate(() => window.fixtureClipboard);
        for (const value of ['CODICE DELL’APPLICAZIONE', 'backend/chat_logic.py:532', 'backend/prompts/guided_choice_directive.md:2', '_apply_global_directives', 'turn_contract']) assert.ok(brief.includes(value), value);
        assert.ok(!brief.includes('origine precisa non è ancora identificata'));
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});


test('each problem shows its unique number and the history keeps resolved problems', async () => {
    const f = await fixture();
    try {
        const issue = f.page.locator('details[name="prompt-health-open"]').filter({ hasText: /Problema n\.\s12\b/ });
        await issue.waitFor();
        assert.equal(await issue.count(), 1);
        await f.page.getByText('Storico dei problemi', { exact: true }).click();
        const history = f.page.getByRole('list', { name: 'Storico dei problemi' });
        await history.waitFor();
        const items = history.locator(':scope > li');
        assert.equal(await items.count(), 2);
        assert.match(await items.nth(0).innerText(), /Problema n\. 13[\s\S]*Non più rilevato il/);
        assert.match(await items.nth(1).innerText(), /Problema n\. 12[\s\S]*Aperto/);
        await issue.locator(':scope > summary').click();
        await issue.getByText('Prepara un intervento nel codice', { exact: true }).click();
        await issue.getByRole('button', { name: 'Copia per un agente di sviluppo', exact: true }).click();
        assert.ok((await f.page.evaluate(() => window.fixtureClipboard)).includes('Problem #12 · ID: 1111111111111111'));
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('prompts to compare are picked from a dropdown, two or three at a time', async () => {
    const f = await fixture();
    try {
        const issue = f.page.locator('details[name="prompt-health-open"]').first();
        await issue.locator(':scope > summary').click();
        await issue.getByRole('button', { name: 'Esamina e correggi il prompt', exact: true }).click();
        const editor = f.page.locator('#prompt-health-compare');
        await editor.getByRole('heading', { name: 'QSA · Collaborazione', exact: true }).waitFor();
        const picker = editor.getByRole('combobox', { name: 'Aggiungi un prompt', exact: true });
        assert.equal(await editor.getByRole('textbox', { name: 'Aggiungi un prompt', exact: true }).count(), 0);
        const panels = await editor.getByRole('heading', { level: 3 }).count();
        if (panels < 2) await editor.getByText('il confronto è tra due o tre prompt', { exact: false }).waitFor();
        assert.equal(await picker.locator('optgroup[label="Passi guidati"] option', { hasText: 'QSA · Presentazione' }).count(), 1);
        assert.equal(await picker.locator('option', { hasText: 'QSA · Collaborazione' }).count(), 0, 'prompts already open are not offered');
        await picker.selectOption('guided_step:sl-intro');
        await editor.getByRole('heading', { name: 'QSA · Presentazione', exact: true }).waitFor();
        assert.equal(await editor.getByText('il confronto è tra due o tre prompt', { exact: false }).count(), 0);
        assert.equal(await picker.inputValue(), '');
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
