import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { documentRetrievalText } from '../src/lib/i18n-document-retrieval.ts';

const origin = process.env.RETRIEVAL_BASE_URL || 'http://127.0.0.1:3135';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true }); });
after(async () => { await browser.close(); });

const providers = [
    { id: 'ollama', external: false, default_model: 'qwen3-embedding:4b', models: ['qwen3-embedding:4b'], key_env: [], key_present: null },
    { id: 'mistral', external: true, default_model: 'mistral-embed', models: ['mistral-embed'], key_env: ['API_KEY_MISTRAL'], key_present: false },
    { id: 'openrouter', external: true, default_model: 'google/gemini-embedding-2', models: ['google/gemini-embedding-2'], key_env: ['API_KEY_OPENROUTER'], key_present: true },
    { id: 'none', external: false, default_model: '', models: [], key_env: [], key_present: null },
];
const collection = { id: 'competenzestrategiche', label: 'Competenze Strategiche (sito)', builtin: true, api_publishable: true,
    vectors_allowed: true, vectors_match: false, building: false, last_build_error: null, n_chunks: 212 };

async function fixture({ lang = 'it', width = 1440, provider = 'ollama', blocked = false, forbidden = false, dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1100 } });
    await context.addInitScript(({ lang, dark }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', dark ? 'dark' : 'light'); }, { lang, dark });
    const page = await context.newPage(), writes = [], errors = [];
    const state = { provider, model: provider === 'ollama' ? 'qwen3-embedding:4b' : 'mistral-embed', dimensions: null, mode: 'hybrid', providers,
        privacy: { mode: 'local', ner_model: 'qwen3:0.6b', ner_status: blocked ? 'unreachable' : 'unknown', ner_required: provider !== 'ollama', queries_blocked: blocked },
        collections: [collection] };
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const write = () => { assert.equal(request.headers()['x-requested-with'], 'CounselorBot'); writes.push({ path: url.pathname, body: request.postDataJSON?.() ?? null }); };
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'retrieval-fixture', is_admin: !forbidden, is_researcher: forbidden, groups: forbidden ? ['researchers'] : [] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, setup_completed: true };
        else if (url.pathname === '/api/user/api-settings') data = { available: false };
        else if (url.pathname === '/api/user/chatgpt') data = { enabled: false };
        else if (url.pathname === '/api/admin/external-privacy') {
            if (request.method() === 'PUT') { write(); state.privacy = { ...state.privacy, mode: 'basic', ner_status: 'disabled', ner_required: false, queries_blocked: false }; }
            data = { mode: state.privacy.mode, local_model: 'qwen3:0.6b' };
        } else if (url.pathname.startsWith('/api/admin/document-retrieval')) {
            if (forbidden) return route.fulfill({ status: 403, json: { detail: 'Forbidden' } });
            if (url.pathname === '/api/admin/document-retrieval' && request.method() === 'PUT') {
                write(); const body = request.postDataJSON();
                Object.assign(state, { provider: body.provider, mode: body.mode, model: body.model || providers.find(p => p.id === body.provider).default_model });
                data = state;
            } else if (url.pathname.endsWith('/test')) { write(); data = { ok: true, dimensions: 1024, elapsed_ms: 42, query_filter: blocked ? 'embedding_privacy_blocked' : 'ok' }; }
            else if (url.pathname.endsWith('/estimate')) data = { input_count: 212, estimated_tokens: 70400, estimated_cost_usd: 0.00704, price_known: true };
            else if (url.pathname.endsWith('/reindex')) { write(); state.collections = [{ ...collection, building: true }]; data = { status: 'building' }; }
            else data = state;
        } else if (url.pathname === '/api/admin/personal-api-policy') data = { enabled: false, encryption_ready: true };
        else if (url.pathname === '/api/admin/chatgpt/settings') data = { enabled: false, ready: true };
        return route.fulfill({ json: data });
    });
    return { page, context, state, writes, errors };
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) for (const width of [320, 1440]) {
    test(`switch from local to Mistral and to none in ${lang} at ${width}px`, async () => {
        const l = (key, values) => documentRetrievalText(lang, key, values);
        const f = await fixture({ lang, width, dark: width === 320 });
        try {
            await f.page.goto(`${origin}/admin`);
            const panel = f.page.getByTestId('document-retrieval-settings');
            const select = panel.getByLabel(l('provider'), { exact: true });
            await select.waitFor();
            assert.equal(await select.inputValue(), 'ollama'); assert.equal(f.writes.length, 0);
            await select.selectOption('mistral');
            await panel.getByText(l('keyMissing', { env: 'API_KEY_MISTRAL' }), { exact: true }).waitFor();
            assert.ok(await panel.getByText(l('keyHelp', { env: 'API_KEY_MISTRAL' }), { exact: true }).isVisible());
            assert.ok(await panel.getByText(l('privacyExternal'), { exact: true }).isVisible());
            await panel.getByRole('button', { name: l('save'), exact: true }).click();
            await panel.getByText(l('saved'), { exact: true }).waitFor();
            assert.deepEqual(f.writes.at(-1).body, { provider: 'mistral', model: '', dimensions: '', mode: 'hybrid' });
            await select.selectOption('none');
            assert.equal(await panel.getByLabel(l('mode'), { exact: true }).count(), 0);
            await panel.getByRole('button', { name: l('save'), exact: true }).click();
            await panel.getByText(l('saved'), { exact: true }).waitFor();
            assert.deepEqual(f.writes.at(-1).body, { provider: 'none', model: '', dimensions: '', mode: 'lexical' });
            await panel.getByText(`${l('chunks', { chunks: 212 })} · ${l('statusLexical')}`, { exact: true }).waitFor();
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

test('unreachable NER is explained and basic mode is changed only on explicit click', async () => {
    const f = await fixture({ provider: 'mistral', blocked: true });
    try {
        await f.page.goto(`${origin}/admin`);
        const panel = f.page.getByTestId('document-retrieval-settings');
        await panel.getByTestId('retrieval-ner-blocked').waitFor();
        assert.ok(await panel.getByText(documentRetrievalText('it', 'nerBlocked'), { exact: true }).isVisible());
        assert.equal(f.writes.length, 0);
        await panel.getByRole('button', { name: documentRetrievalText('it', 'useBasic'), exact: true }).click();
        await panel.getByText(documentRetrievalText('it', 'basicSaved'), { exact: true }).waitFor();
        assert.deepEqual(f.writes, [{ path: '/api/admin/external-privacy', body: { mode: 'basic' } }]);
        await panel.getByTestId('retrieval-ner-blocked').waitFor({ state: 'hidden' });
    } finally { await f.context.close(); }
});

test('test, cost estimate and reindex for a collection', async () => {
    const f = await fixture({ provider: 'mistral' });
    try {
        await f.page.goto(`${origin}/admin`);
        const panel = f.page.getByTestId('document-retrieval-settings');
        await panel.getByRole('button', { name: 'Prova', exact: true }).click();
        await panel.getByText(documentRetrievalText('it', 'testOk', { dimensions: 1024, ms: 42 }), { exact: true }).waitFor();
        const row = panel.getByTestId('retrieval-collection-competenzestrategiche');
        assert.ok(await row.getByText(documentRetrievalText('it', 'statusStale'), { exact: false }).isVisible());
        await row.getByRole('button', { name: 'Stima costi', exact: true }).click();
        await row.getByText(documentRetrievalText('it', 'estimateResult', { inputs: 212, tokens: (70400).toLocaleString('it'), cost: '< 0.01 USD' }), { exact: true }).waitFor();
        await row.getByRole('button', { name: 'Reindicizza', exact: true }).click();
        await row.getByText(documentRetrievalText('it', 'statusBuilding'), { exact: false }).waitFor();
        assert.deepEqual(f.writes.map(w => w.path), ['/api/admin/document-retrieval/test', '/api/admin/document-retrieval/collections/competenzestrategiche/reindex']);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('researchers cannot see the document retrieval settings', async () => {
    const f = await fixture({ forbidden: true });
    try {
        const loaded = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/document-retrieval');
        await f.page.goto(`${origin}/admin`); await loaded;
        await f.page.getByTestId('document-retrieval-settings').waitFor({ state: 'hidden' });
        assert.equal(f.writes.length, 0);
    } finally { await f.context.close(); }
});
